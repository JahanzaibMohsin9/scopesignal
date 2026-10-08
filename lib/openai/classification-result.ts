import {
  buildClassificationInput,
  classifyScope,
  type ClassificationInput,
  type ClassificationOutput,
  type ClassificationResult,
} from "@/lib/openai/classification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  RetrievedChunk,
  RetrievalTrace,
} from "@/lib/retrieval/vector-retriever";
import type { SlackAnalysisJobPayload } from "@/lib/slack/event-queue";

export const HUMAN_REVIEW_CONFIDENCE_THRESHOLD = 0.6;
const MAX_CLIENT_MESSAGE_CHARS = 6_000;
const MAX_THREAD_CONTEXT_CHARS = 10_000;

const AMBIGUOUS_LANGUAGE_PATTERNS = [
  /\bnot sure\b/i,
  /\bunclear\b/i,
  /\bmaybe\b/i,
  /\bmight\b/i,
  /\bpossibly\b/i,
  /\bkind of\b/i,
  /\bsort of\b/i,
  /\bwhatever makes sense\b/i,
  /\bif possible\b/i,
];
const NON_ENGLISH_HINT_PATTERNS = [
  /[¿¡]/,
  /\b(podemos|agregar|pagina|página|adicional|lanzamiento)\b/i,
  /\b(pouvez|ajouter|avant|lancement)\b/i,
  /\b(können|hinzufügen|start)\b/i,
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AlertUpsertResult = {
  data: { id: string; assigned_user_id: string | null } | null;
  error: { message?: string } | null;
};

export type ClassificationAlertSupabaseClient = {
  from(table: "alerts"): {
    upsert(
      values: ClassificationAlertUpsert,
      options: { onConflict: "workspace_id,slack_channel_id,slack_message_ts" },
    ): {
      select(columns: "id, assigned_user_id"): {
        maybeSingle(): Promise<AlertUpsertResult>;
      };
    };
  };
};

export type ClassificationAlertUpsert = {
  workspace_id: string;
  proposal_id: string | null;
  slack_channel_id: string;
  slack_message_ts: string;
  slack_thread_ts: string | null;
  client_message: string;
  thread_context: string;
  verdict: ClassificationOutput["verdict"];
  confidence: number;
  reason: string;
  matched_section: string;
  matched_chunk_ids: string[];
  retrieval_trace: RetrievalTrace;
};

export type PersistedClassificationAlert = ClassificationAlertUpsert & {
  id: string | null;
  assigned_user_id: string | null;
};

export type ScopeClassificationOutcome = {
  output: ClassificationOutput;
  model: string | null;
  usage: ClassificationResult["usage"] | null;
  matchedChunkIds: string[];
  edgeCases: string[];
  clientMessage: string;
  threadContext: string;
};

export type ScopeClassifier = (args: {
  input: ClassificationInput;
}) => Promise<ClassificationResult>;

function truncateForClassifier(text: string, maxChars: number) {
  const trimmed = text.trim();

  if (trimmed.length <= maxChars) {
    return {
      text: trimmed,
      truncated: false,
    };
  }

  return {
    text: `${trimmed.slice(0, maxChars)}\n[truncated for classification]`,
    truncated: true,
  };
}

function looksNonEnglish(text: string) {
  if (NON_ENGLISH_HINT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  const letters = text.match(/\p{L}/gu) ?? [];

  if (letters.length < 20) {
    return false;
  }

  const asciiLetters = text.match(/[a-z]/gi) ?? [];
  return asciiLetters.length / letters.length < 0.5;
}

function hasAmbiguousLanguage(text: string) {
  return AMBIGUOUS_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));
}

function needsReview(output: ClassificationOutput, edgeCases: string[]) {
  return (
    output.verdict === "needs_review" ||
    output.needs_human_review ||
    output.confidence < HUMAN_REVIEW_CONFIDENCE_THRESHOLD ||
    edgeCases.includes("ambiguous_language")
  );
}

function normalizeOutputForReviewPolicy(
  output: ClassificationOutput,
  edgeCases: string[],
): ClassificationOutput {
  if (!needsReview(output, edgeCases)) {
    return output;
  }

  const reasons = [];

  if (output.confidence < HUMAN_REVIEW_CONFIDENCE_THRESHOLD) {
    reasons.push(
      `confidence below ${HUMAN_REVIEW_CONFIDENCE_THRESHOLD.toFixed(1)}`,
    );
  }

  if (edgeCases.includes("ambiguous_language")) {
    reasons.push("ambiguous client wording");
  }

  const reviewReason =
    reasons.length > 0 ? ` Human review: ${reasons.join(", ")}.` : "";

  return {
    ...output,
    verdict: "needs_review",
    needs_human_review: true,
    reason: `${output.reason}${reviewReason}`.trim(),
  };
}

function buildSyntheticReviewOutput({
  reason,
  confidence,
  matchedSection = "",
}: {
  reason: string;
  confidence: number;
  matchedSection?: string;
}): ClassificationOutput {
  return {
    verdict: "needs_review",
    confidence,
    reason,
    matched_section: matchedSection,
    needs_human_review: true,
  };
}

function getMatchedChunkIds(chunks: RetrievedChunk[]) {
  return chunks
    .map((chunk) => chunk.id)
    .filter((chunkId) => UUID_PATTERN.test(chunkId));
}

function getProposalId(chunks: RetrievedChunk[]) {
  return chunks[0]?.proposalId ?? null;
}

export async function classifyScopeForAlert({
  workspaceId,
  clientMessage,
  threadContext,
  chunks,
  classifier = classifyScope,
}: {
  workspaceId: string;
  clientMessage: string;
  threadContext: string;
  chunks: RetrievedChunk[];
  classifier?: ScopeClassifier;
}): Promise<ScopeClassificationOutcome> {
  const normalizedMessage = truncateForClassifier(
    clientMessage,
    MAX_CLIENT_MESSAGE_CHARS,
  );
  const normalizedThreadContext = truncateForClassifier(
    threadContext,
    MAX_THREAD_CONTEXT_CHARS,
  );
  const edgeCases: string[] = [];

  if (normalizedMessage.truncated) {
    edgeCases.push("long_message_truncated");
  }

  if (normalizedThreadContext.truncated) {
    edgeCases.push("long_thread_context_truncated");
  }

  if (chunks.length === 0) {
    edgeCases.push("empty_retrieval");
    return {
      output: buildSyntheticReviewOutput({
        reason:
          "No indexed proposal or addendum chunks were retrieved for this workspace.",
        confidence: 0.2,
      }),
      model: null,
      usage: null,
      matchedChunkIds: [],
      edgeCases,
      clientMessage: normalizedMessage.text,
      threadContext: normalizedThreadContext.text,
    };
  }

  if (looksNonEnglish(normalizedMessage.text)) {
    edgeCases.push("non_english_message");
    return {
      output: buildSyntheticReviewOutput({
        reason:
          "The client message appears to be non-English, so it requires human review before scope judgment.",
        confidence: 0.3,
        matchedSection: `${chunks[0]?.documentTitle ?? "Retrieved scope"} (${chunks[0]?.id ?? "no_chunk"})`,
      }),
      model: null,
      usage: null,
      matchedChunkIds: getMatchedChunkIds(chunks),
      edgeCases,
      clientMessage: normalizedMessage.text,
      threadContext: normalizedThreadContext.text,
    };
  }

  if (hasAmbiguousLanguage(normalizedMessage.text)) {
    edgeCases.push("ambiguous_language");
  }

  const classification = await classifier({
    input: buildClassificationInput({
      workspaceId,
      clientMessage: normalizedMessage.text,
      threadContext: normalizedThreadContext.text,
      chunks,
    }),
  });

  return {
    output: normalizeOutputForReviewPolicy(classification.output, edgeCases),
    model: classification.model,
    usage: classification.usage,
    matchedChunkIds: getMatchedChunkIds(chunks),
    edgeCases,
    clientMessage: normalizedMessage.text,
    threadContext: normalizedThreadContext.text,
  };
}

export async function persistClassificationAlert({
  jobPayload,
  outcome,
  chunks,
  retrievalTrace,
  supabase,
}: {
  jobPayload: SlackAnalysisJobPayload;
  outcome: ScopeClassificationOutcome;
  chunks: RetrievedChunk[];
  retrievalTrace: RetrievalTrace;
  supabase?: ClassificationAlertSupabaseClient;
}) {
  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as ClassificationAlertSupabaseClient);

  const values: ClassificationAlertUpsert = {
    workspace_id: jobPayload.workspace_id,
    proposal_id: getProposalId(chunks),
    slack_channel_id: jobPayload.slack_channel_id,
    slack_message_ts: jobPayload.message_ts,
    slack_thread_ts: jobPayload.thread_ts,
    client_message: outcome.clientMessage,
    thread_context: outcome.threadContext,
    verdict: outcome.output.verdict,
    confidence: outcome.output.confidence,
    reason: outcome.output.reason,
    matched_section: outcome.output.matched_section,
    matched_chunk_ids: outcome.matchedChunkIds,
    retrieval_trace: retrievalTrace,
  };

  const { data, error } = await client
    .from("alerts")
    .upsert(values, {
      onConflict: "workspace_id,slack_channel_id,slack_message_ts",
    })
    .select("id, assigned_user_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to persist classification alert.");
  }

  return {
    ...values,
    id: data?.id ?? null,
    assigned_user_id: data?.assigned_user_id ?? null,
  } satisfies PersistedClassificationAlert;
}
