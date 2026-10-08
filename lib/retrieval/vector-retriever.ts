import {
  createEmbeddings,
  type EmbeddingResult,
} from "@/lib/openai/embeddings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OpenAiCredentialSource } from "@/lib/openai/byok";

const DEFAULT_MATCH_COUNT = 10;
const DEFAULT_FINAL_COUNT = 5;
const ADDENDUM_RECENCY_BOOST = 2;

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type FromInsertResult = {
  error: { message?: string } | null;
};

type FromUpdateResult = {
  error: { message?: string } | null;
};

type FallbackChunkRow = {
  id: string;
  workspace_id: string;
  proposal_id: string;
  document_id: string;
  section_title: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown> | null;
  documents:
    | {
        title: string | null;
        kind: "proposal" | "addendum";
        effective_date: string | null;
      }
    | {
        title: string | null;
        kind: "proposal" | "addendum";
        effective_date: string | null;
      }[]
    | null;
  proposals:
    | {
        name: string | null;
        client_name: string | null;
      }
    | {
        name: string | null;
        client_name: string | null;
      }[]
    | null;
};

type FallbackChunkSelectResult = {
  data: FallbackChunkRow[] | null;
  error: { message?: string } | null;
};

export type VectorRetrieverSupabaseClient = {
  rpc(
    functionName: "match_chunks",
    args: {
      p_workspace_id: string;
      query_embedding: number[];
      match_count: number;
      similarity_threshold: number | null;
    },
  ): Promise<RpcResult<MatchedChunkRow[]>>;
  from(table: "usage_logs"): {
    insert(values: {
      workspace_id: string;
      source: OpenAiCredentialSource;
      provider: "openai";
      model: string;
      request_type: "embedding";
      prompt_tokens: number;
      completion_tokens: 0;
      total_tokens: number;
      raw_usage: unknown;
      request_id: string | null;
    }): Promise<FromInsertResult>;
  };
  from(table: "alerts"): {
    update(values: { retrieval_trace: RetrievalTrace }): {
      eq(
        column: "workspace_id",
        value: string,
      ): {
        eq(
          column: "slack_channel_id",
          value: string,
        ): {
          eq(
            column: "slack_message_ts",
            value: string,
          ): Promise<FromUpdateResult>;
        };
      };
    };
  };
  from(table: "chunks"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        is(
          column: string,
          value: null,
        ): {
          eq(
            column: string,
            value: string,
          ): {
            is(
              column: string,
              value: null,
            ): {
              order(
                column: string,
                options: { ascending: boolean },
              ): {
                limit(count: number): Promise<FallbackChunkSelectResult>;
              };
            };
          };
        };
      };
    };
  };
};

export type MatchedChunkRow = {
  chunk_id: string;
  workspace_id: string;
  proposal_id: string;
  document_id: string;
  document_title: string;
  document_kind: "proposal" | "addendum";
  document_effective_date: string | null;
  proposal_name: string;
  client_name: string;
  section_title: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export type RetrievedChunk = {
  id: string;
  workspaceId: string;
  proposalId: string;
  documentId: string;
  documentTitle: string;
  documentKind: "proposal" | "addendum";
  documentEffectiveDate: string | null;
  proposalName: string;
  clientName: string;
  sectionTitle: string | null;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  authorityScore: number;
  recencyBoost: number;
  originalRank: number;
  finalRank: number;
};

export type RetrievalTraceCandidate = {
  chunkId: string;
  documentId: string;
  proposalId: string;
  documentKind: "proposal" | "addendum";
  effectiveDate: string | null;
  sectionTitle: string | null;
  similarity: number;
  recencyBoost: number;
  authorityScore: number;
  originalRank: number;
  finalRank: number | null;
  selected: boolean;
};

export type RetrievalTrace = {
  version: 1;
  generatedAt: string;
  workspaceId: string;
  query: {
    text: string;
    matchCount: number;
    finalCount: number;
    similarityThreshold: number | null;
  };
  rankingPolicy: {
    addendumRecencyBoost: number;
    description: string;
  };
  candidates: RetrievalTraceCandidate[];
  finalChunkIds: string[];
};

export type RetrieveRelevantChunksResult = {
  chunks: RetrievedChunk[];
  trace: RetrievalTrace;
  embedding: {
    model: string;
    promptTokens: number;
    totalTokens: number;
    requestId: string | null;
  };
};

export async function retrieveRelevantChunks({
  workspaceId,
  message,
  matchCount = DEFAULT_MATCH_COUNT,
  finalCount = DEFAULT_FINAL_COUNT,
  similarityThreshold = null,
  supabase,
  embedder = createEmbeddings,
  usageSource = "managed",
}: {
  workspaceId: string;
  message: string;
  matchCount?: number;
  finalCount?: number;
  similarityThreshold?: number | null;
  supabase?: VectorRetrieverSupabaseClient;
  embedder?: (input: string[]) => Promise<EmbeddingResult>;
  usageSource?: OpenAiCredentialSource;
}): Promise<RetrieveRelevantChunksResult> {
  const query = message.trim();

  if (!query) {
    const trace = buildRetrievalTrace({
      workspaceId,
      query,
      matchCount,
      finalCount,
      similarityThreshold,
      candidates: [],
      finalChunks: [],
    });

    return {
      chunks: [],
      trace,
      embedding: {
        model: "",
        promptTokens: 0,
        totalTokens: 0,
        requestId: null,
      },
    };
  }

  const embeddingResult = await embedder([query]);
  const queryEmbedding = embeddingResult.embeddings[0];

  if (!queryEmbedding) {
    throw new Error("OpenAI did not return an embedding for the query.");
  }

  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as VectorRetrieverSupabaseClient);

  const { data, error } = await client.rpc("match_chunks", {
    p_workspace_id: workspaceId,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to retrieve matching chunks.");
  }

  await logRetrievalEmbeddingUsage(
    client,
    workspaceId,
    embeddingResult,
    usageSource,
  );
  const rpcCandidates = (data ?? []).map(toRetrievedChunk);
  const candidates =
    rpcCandidates.length > 0
      ? rpcCandidates
      : await retrieveFallbackChunks(client, workspaceId, finalCount);
  const chunks = rerankRetrievedChunks(candidates, finalCount);
  const trace = buildRetrievalTrace({
    workspaceId,
    query,
    matchCount,
    finalCount,
    similarityThreshold,
    candidates: chunks.allCandidates,
    finalChunks: chunks.finalChunks,
  });

  console.info("retrieval.trace", {
    workspaceId,
    candidateCount: candidates.length,
    fallbackUsed: rpcCandidates.length === 0 && candidates.length > 0,
    finalChunkIds: trace.finalChunkIds,
    candidates: trace.candidates.map((candidate) => ({
      chunkId: candidate.chunkId,
      similarity: candidate.similarity,
      effectiveDate: candidate.effectiveDate,
      authorityScore: candidate.authorityScore,
      finalRank: candidate.finalRank,
    })),
  });

  return {
    chunks: chunks.finalChunks,
    trace,
    embedding: {
      model: embeddingResult.model,
      promptTokens: embeddingResult.usage.promptTokens,
      totalTokens: embeddingResult.usage.totalTokens,
      requestId: embeddingResult.usage.requestId,
    },
  };
}

async function retrieveFallbackChunks(
  supabase: VectorRetrieverSupabaseClient,
  workspaceId: string,
  finalCount: number,
) {
  const { data, error } = await supabase
    .from("chunks")
    .select(
      "id, workspace_id, proposal_id, document_id, section_title, chunk_index, content, metadata, documents!inner(title, kind, effective_date, status, deleted_at), proposals!inner(name, client_name)",
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .eq("documents.status", "indexed")
    .is("documents.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(finalCount, 1));

  if (error) {
    throw new Error(error.message ?? "Failed to retrieve fallback chunks.");
  }

  return (data ?? []).map(toRetrievedFallbackChunk);
}

function getSingleJoinValue<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toRetrievedFallbackChunk(row: FallbackChunkRow): RetrievedChunk {
  const document = getSingleJoinValue(row.documents);
  const proposal = getSingleJoinValue(row.proposals);
  const syntheticSimilarity = 1 / (row.chunk_index + 1);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    proposalId: row.proposal_id,
    documentId: row.document_id,
    documentTitle: document?.title ?? "Indexed proposal",
    documentKind: document?.kind ?? "proposal",
    documentEffectiveDate: document?.effective_date ?? null,
    proposalName: proposal?.name ?? "Proposal",
    clientName: proposal?.client_name ?? "",
    sectionTitle: row.section_title,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata ?? {},
    similarity: syntheticSimilarity,
    authorityScore: syntheticSimilarity,
    recencyBoost: 0,
    originalRank: 0,
    finalRank: 0,
  };
}

export async function persistRetrievalTraceForAlert({
  workspaceId,
  slackChannelId,
  slackMessageTs,
  trace,
  supabase,
}: {
  workspaceId: string;
  slackChannelId: string;
  slackMessageTs: string;
  trace: RetrievalTrace;
  supabase?: VectorRetrieverSupabaseClient;
}) {
  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as VectorRetrieverSupabaseClient);

  const { error } = await client
    .from("alerts")
    .update({ retrieval_trace: trace })
    .eq("workspace_id", workspaceId)
    .eq("slack_channel_id", slackChannelId)
    .eq("slack_message_ts", slackMessageTs);

  if (error) {
    throw new Error(error.message ?? "Failed to persist retrieval trace.");
  }
}

async function logRetrievalEmbeddingUsage(
  supabase: VectorRetrieverSupabaseClient,
  workspaceId: string,
  result: EmbeddingResult,
  source: OpenAiCredentialSource,
) {
  const { error } = await supabase.from("usage_logs").insert({
    workspace_id: workspaceId,
    source,
    provider: "openai",
    model: result.model,
    request_type: "embedding",
    prompt_tokens: result.usage.promptTokens,
    completion_tokens: 0,
    total_tokens: result.usage.totalTokens,
    raw_usage: result.usage.rawUsage,
    request_id: result.usage.requestId,
  });

  if (error) {
    throw new Error(
      error.message ?? "Failed to log retrieval embedding usage.",
    );
  }
}

function toRetrievedChunk(row: MatchedChunkRow): RetrievedChunk {
  return {
    id: row.chunk_id,
    workspaceId: row.workspace_id,
    proposalId: row.proposal_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    documentKind: row.document_kind,
    documentEffectiveDate: row.document_effective_date,
    proposalName: row.proposal_name,
    clientName: row.client_name,
    sectionTitle: row.section_title,
    chunkIndex: row.chunk_index,
    content: row.content,
    metadata: row.metadata,
    similarity: row.similarity,
    authorityScore: row.similarity,
    recencyBoost: 0,
    originalRank: 0,
    finalRank: 0,
  };
}

function getEffectiveDateTime(
  chunk: Pick<RetrievedChunk, "documentEffectiveDate">,
) {
  if (!chunk.documentEffectiveDate) {
    return null;
  }

  const time = Date.parse(chunk.documentEffectiveDate);
  return Number.isNaN(time) ? null : time;
}

function hasNewerProposalAddendum(
  chunk: RetrievedChunk,
  allChunks: RetrievedChunk[],
) {
  if (chunk.documentKind !== "addendum") {
    return false;
  }

  const chunkDate = getEffectiveDateTime(chunk);
  if (chunkDate === null) {
    return false;
  }

  return allChunks.some((candidate) => {
    if (
      candidate.proposalId !== chunk.proposalId ||
      candidate.documentKind !== "proposal"
    ) {
      return false;
    }

    const proposalDate = getEffectiveDateTime(candidate);
    return proposalDate === null || chunkDate > proposalDate;
  });
}

export function rerankRetrievedChunks(
  chunks: RetrievedChunk[],
  finalCount = DEFAULT_FINAL_COUNT,
) {
  const rankedCandidates = chunks.map((chunk, index) => {
    const recencyBoost = hasNewerProposalAddendum(chunk, chunks)
      ? ADDENDUM_RECENCY_BOOST
      : 0;

    return {
      ...chunk,
      originalRank: index + 1,
      recencyBoost,
      authorityScore: chunk.similarity + recencyBoost,
      finalRank: 0,
    };
  });

  const sorted = [...rankedCandidates].sort((a, b) => {
    if (b.authorityScore !== a.authorityScore) {
      return b.authorityScore - a.authorityScore;
    }

    const bDate = getEffectiveDateTime(b) ?? 0;
    const aDate = getEffectiveDateTime(a) ?? 0;
    if (bDate !== aDate) {
      return bDate - aDate;
    }

    return a.originalRank - b.originalRank;
  });

  const finalChunks = sorted
    .slice(0, Math.max(finalCount, 0))
    .map((chunk, index) => ({
      ...chunk,
      finalRank: index + 1,
    }));
  const finalRankById = new Map(
    finalChunks.map((chunk) => [chunk.id, chunk.finalRank]),
  );
  const allCandidates = rankedCandidates.map((chunk) => ({
    ...chunk,
    finalRank: finalRankById.get(chunk.id) ?? 0,
  }));

  return {
    finalChunks,
    allCandidates,
  };
}

function buildRetrievalTrace({
  workspaceId,
  query,
  matchCount,
  finalCount,
  similarityThreshold,
  candidates,
  finalChunks,
}: {
  workspaceId: string;
  query: string;
  matchCount: number;
  finalCount: number;
  similarityThreshold: number | null;
  candidates: RetrievedChunk[];
  finalChunks: RetrievedChunk[];
}): RetrievalTrace {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    workspaceId,
    query: {
      text: query,
      matchCount,
      finalCount,
      similarityThreshold,
    },
    rankingPolicy: {
      addendumRecencyBoost: ADDENDUM_RECENCY_BOOST,
      description:
        "Addendum chunks with effective dates newer than their base proposal receive a deterministic boost before the final top-five selection.",
    },
    candidates: candidates.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      proposalId: chunk.proposalId,
      documentKind: chunk.documentKind,
      effectiveDate: chunk.documentEffectiveDate,
      sectionTitle: chunk.sectionTitle,
      similarity: chunk.similarity,
      recencyBoost: chunk.recencyBoost,
      authorityScore: chunk.authorityScore,
      originalRank: chunk.originalRank,
      finalRank: chunk.finalRank || null,
      selected: chunk.finalRank > 0,
    })),
    finalChunkIds: finalChunks.map((chunk) => chunk.id),
  };
}
