import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getClassificationModel, getOpenAiApiKey } from "@/lib/openai/config";
import type { RetrievedChunk } from "@/lib/retrieval/vector-retriever";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OpenAiCredentialSource } from "@/lib/openai/byok";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 250;

export const CLASSIFICATION_SYSTEM_PROMPT = `
You are ScopeSignal's contract scope classifier for an agency account team.
Your job is to decide whether the client's latest Slack request is covered by the signed proposal and addendums provided in the ranked scope chunks.

Use these inputs:
- client_message: the exact client request that triggered analysis.
- thread_context: nearby Slack thread messages for pronouns, follow-ups, and intent. Do not treat thread context as contract evidence.
- scope_chunks: ranked proposal or addendum excerpts. Earlier chunks are more relevant, and addendums may override older proposal terms when they are newer and directly applicable.

Classification rules:
- verdict = "in_scope" when the retrieved contract evidence clearly includes the requested work, quantity, channel, deliverable, or support activity.
- verdict = "out_of_scope" when the evidence clearly excludes the work, states it requires a change order, or omits a requested deliverable from a fixed list.
- verdict = "needs_review" when evidence is missing, contradictory, indirect, too generic, or the client wording is ambiguous.
- Set needs_human_review to true for every needs_review verdict and for any result where a reasonable account manager could disagree.
- Do not infer scope from agency norms, pricing assumptions, or what seems reasonable. Use only the cited scope chunks as contract evidence.
- If the retrieved chunks do not contain enough evidence, choose needs_review even if the request sounds likely.

Confidence calibration:
- 0.85-1.00 only for clear cases with direct evidence in a cited chunk.
- 0.65-0.84 for likely cases with good but not perfect evidence.
- 0.00-0.64 for ambiguous, missing, conflicting, or weak evidence. These should usually need human review.
- Never use high confidence just because the request is short or common.

Evidence requirements:
- matched_section must cite the strongest evidence as "Document Title > Section Title (chunk_id)". If the section title is unavailable, use "Document Title (chunk_id)".
- reason must briefly explain how the cited language supports the verdict.
- For out_of_scope, identify the limiting or exclusionary language when possible.
- For in_scope, identify the included deliverable or service when possible.
`.trim();

export const ClassificationOutputSchema = z
  .object({
    verdict: z.enum(["in_scope", "out_of_scope", "needs_review"]),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    matched_section: z.string(),
    needs_human_review: z.boolean(),
  })
  .strict();

export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

export const ClassificationChunkSchema = z
  .object({
    id: z.string().min(1),
    documentTitle: z.string().min(1),
    documentKind: z.enum(["proposal", "addendum"]),
    documentEffectiveDate: z.string().nullable(),
    sectionTitle: z.string().nullable(),
    content: z.string().min(1),
    similarity: z.number(),
    authorityScore: z.number(),
  })
  .strict();

export const ClassificationInputSchema = z
  .object({
    workspaceId: z.string().min(1),
    alertId: z.string().uuid().optional(),
    clientMessage: z.string().min(1),
    threadContext: z.string(),
    chunks: z.array(ClassificationChunkSchema),
  })
  .strict();

export type ClassificationInput = z.infer<typeof ClassificationInputSchema>;

type UsageInsert = {
  workspace_id: string;
  alert_id?: string;
  source: OpenAiCredentialSource;
  provider: "openai";
  model: string;
  request_type: "classification";
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  raw_usage: unknown;
  request_id: string | null;
};

type SupabaseInsertResult = {
  error: { message?: string } | null;
};

export type ClassificationSupabaseClient = {
  from(table: "usage_logs"): {
    insert(values: UsageInsert): Promise<SupabaseInsertResult>;
  };
};

type ClassificationResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
};

type ClassificationResponse = {
  output_parsed?: unknown;
  output_text?: string;
  model?: string;
  usage?: ClassificationResponseUsage;
  _request_id?: string | null;
};

export type ClassificationOpenAIClient = {
  responses: {
    parse(args: unknown): Promise<ClassificationResponse>;
  };
};

export type ClassifyScopeOptions = {
  input: ClassificationInput;
  model?: string;
  apiKey?: string;
  usageSource?: OpenAiCredentialSource;
  openai?: ClassificationOpenAIClient;
  supabase?: ClassificationSupabaseClient;
  maxAttempts?: number;
  initialRetryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type ClassificationUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  rawUsage: unknown;
  requestId: string | null;
};

export type ClassificationResult = {
  output: ClassificationOutput;
  model: string;
  usage: ClassificationUsage;
};

export type ClassificationMessage = {
  role: "system" | "user";
  content: string;
};

export async function classifyScope({
  input,
  model = getClassificationModel(),
  apiKey,
  usageSource = "managed",
  openai,
  supabase,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  initialRetryDelayMs = DEFAULT_INITIAL_RETRY_DELAY_MS,
  sleep = defaultSleep,
}: ClassifyScopeOptions): Promise<ClassificationResult> {
  const validatedInput = ClassificationInputSchema.parse(input);
  const openAiClient = openai ?? createOpenAiClient(apiKey);
  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as ClassificationSupabaseClient);

  const response = await withRetry(
    () =>
      openAiClient.responses.parse({
        model,
        input: buildClassificationMessages(validatedInput),
        text: {
          format: zodTextFormat(
            ClassificationOutputSchema,
            "scope_classification",
          ),
        },
      }),
    { maxAttempts, initialRetryDelayMs, sleep },
  );

  const output = parseClassificationOutput(response);
  const usage = normalizeClassificationUsage(response);
  const resolvedModel = response.model || model;

  await logClassificationUsage({
    supabase: client,
    workspaceId: validatedInput.workspaceId,
    alertId: validatedInput.alertId,
    model: resolvedModel,
    usage,
    source: usageSource,
  });

  return {
    output,
    model: resolvedModel,
    usage,
  };
}

export function buildClassificationInput({
  workspaceId,
  alertId,
  clientMessage,
  threadContext,
  chunks,
}: {
  workspaceId: string;
  alertId?: string;
  clientMessage: string;
  threadContext: string;
  chunks: RetrievedChunk[];
}): ClassificationInput {
  return ClassificationInputSchema.parse({
    workspaceId,
    alertId,
    clientMessage,
    threadContext,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      documentTitle: chunk.documentTitle,
      documentKind: chunk.documentKind,
      documentEffectiveDate: chunk.documentEffectiveDate,
      sectionTitle: chunk.sectionTitle,
      content: chunk.content,
      similarity: chunk.similarity,
      authorityScore: chunk.authorityScore,
    })),
  });
}

export function buildClassificationMessages(
  input: ClassificationInput,
): ClassificationMessage[] {
  return [
    {
      role: "system",
      content: CLASSIFICATION_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: buildClassificationPayload(input),
    },
  ];
}

async function withRetry<T>(
  operation: () => Promise<T>,
  {
    maxAttempts,
    initialRetryDelayMs,
    sleep,
  }: {
    maxAttempts: number;
    initialRetryDelayMs: number;
    sleep: (ms: number) => Promise<void>;
  },
) {
  let lastError: unknown;
  const attempts = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }

      await sleep(initialRetryDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function parseClassificationOutput(response: ClassificationResponse) {
  const parsed = ClassificationOutputSchema.safeParse(response.output_parsed);

  if (parsed.success) {
    return parsed.data;
  }

  if (response.output_text) {
    try {
      return ClassificationOutputSchema.parse(JSON.parse(response.output_text));
    } catch {
      // The structured parser error below includes the field-level details.
    }
  }

  throw new Error(
    `Malformed classification response: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
      .join("; ")}`,
  );
}

function normalizeClassificationUsage(
  response: ClassificationResponse,
): ClassificationUsage {
  const usage = response.usage ?? {};
  const promptTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const completionTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
    rawUsage: usage,
    requestId: response._request_id ?? null,
  };
}

async function logClassificationUsage({
  supabase,
  workspaceId,
  alertId,
  model,
  usage,
  source,
}: {
  supabase: ClassificationSupabaseClient;
  workspaceId: string;
  alertId?: string;
  model: string;
  usage: ClassificationUsage;
  source: OpenAiCredentialSource;
}) {
  const values: UsageInsert = {
    workspace_id: workspaceId,
    source,
    provider: "openai",
    model,
    request_type: "classification",
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    raw_usage: usage.rawUsage,
    request_id: usage.requestId,
  };

  if (alertId) {
    values.alert_id = alertId;
  }

  const { error } = await supabase.from("usage_logs").insert(values);

  if (error) {
    throw new Error(error.message ?? "Failed to log classification usage.");
  }
}

function buildClassificationPayload(input: ClassificationInput) {
  return JSON.stringify({
    client_message: input.clientMessage,
    thread_context: input.threadContext,
    scope_chunks: input.chunks.map((chunk, index) => ({
      rank: index + 1,
      chunk_id: chunk.id,
      document_title: chunk.documentTitle,
      document_kind: chunk.documentKind,
      effective_date: chunk.documentEffectiveDate,
      section_title: chunk.sectionTitle,
      content: chunk.content,
      similarity: chunk.similarity,
      authority_score: chunk.authorityScore,
    })),
  });
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function createOpenAiClient(apiKey = getOpenAiApiKey()): ClassificationOpenAIClient {
  return new OpenAI({
    apiKey,
  }) as ClassificationOpenAIClient;
}
