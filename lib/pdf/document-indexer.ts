import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmbeddings,
  createOpenAiEmbeddingClient,
} from "@/lib/openai/embeddings";
import type { OpenAiCredentialSource } from "@/lib/openai/byok";
import { persistDocumentChunks } from "@/lib/pdf/chunk-storage";

type IndexDocumentInput = {
  supabase: Pick<SupabaseClient, "from">;
  workspaceId: string;
  proposalId: string;
  documentId: string;
  text: string | null;
  credentialSource?: OpenAiCredentialSource;
  apiKey?: string;
};

const MAX_EMBEDDING_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

export async function indexDocumentChunks({
  supabase,
  workspaceId,
  proposalId,
  documentId,
  text,
  credentialSource = "managed",
  apiKey,
}: IndexDocumentInput): Promise<number> {
  await updateDocumentStatus(supabase, documentId, "processing");

  try {
    const chunks = await persistDocumentChunks({
      supabase,
      workspaceId,
      proposalId,
      documentId,
      text,
    });

    if (chunks.length === 0) {
      throw new Error("No readable chunks were generated from this document.");
    }

    const embeddingClient = apiKey
      ? createOpenAiEmbeddingClient(apiKey)
      : undefined;
    const result = await withEmbeddingRetry(() =>
      createEmbeddings(chunks.map((chunk) => chunk.content), embeddingClient),
    );

    if (result.embeddings.length !== chunks.length) {
      throw new Error(
        "OpenAI returned a different embedding count than requested.",
      );
    }

    await Promise.all(
      chunks.map((chunk, index) =>
        updateChunkEmbedding(
          supabase,
          chunk.id,
          result.embeddings[index] ?? [],
        ),
      ),
    );

    await logEmbeddingUsage(supabase, {
      workspaceId,
      model: result.model,
      promptTokens: result.usage.promptTokens,
      totalTokens: result.usage.totalTokens,
      rawUsage: result.usage.rawUsage,
      requestId: result.usage.requestId,
      source: credentialSource,
    });

    await updateDocumentStatus(supabase, documentId, "indexed");

    return chunks.length;
  } catch (error) {
    await updateDocumentStatus(
      supabase,
      documentId,
      "failed",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

async function withEmbeddingRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_EMBEDDING_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_EMBEDDING_ATTEMPTS) {
        break;
      }
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateDocumentStatus(
  supabase: Pick<SupabaseClient, "from">,
  documentId: string,
  status: "processing" | "indexed" | "failed",
  parseError: string | null = null,
) {
  const values =
    status === "failed" ? { status, parse_error: parseError } : { status };

  const { error } = await supabase
    .from("documents")
    .update(values)
    .eq("id", documentId);

  if (error) {
    throw error;
  }
}

async function updateChunkEmbedding(
  supabase: Pick<SupabaseClient, "from">,
  chunkId: string,
  embedding: number[],
) {
  const { error } = await supabase
    .from("chunks")
    .update({ embedding })
    .eq("id", chunkId);

  if (error) {
    throw error;
  }
}

async function logEmbeddingUsage(
  supabase: Pick<SupabaseClient, "from">,
  {
    workspaceId,
    model,
    promptTokens,
    totalTokens,
    rawUsage,
    requestId,
    source,
  }: {
    workspaceId: string;
    model: string;
    promptTokens: number;
    totalTokens: number;
    rawUsage: unknown;
    requestId: string | null;
    source: OpenAiCredentialSource;
  },
) {
  const { error } = await supabase.from("usage_logs").insert({
    workspace_id: workspaceId,
    source,
    provider: "openai",
    model,
    request_type: "embedding",
    prompt_tokens: promptTokens,
    completion_tokens: 0,
    total_tokens: totalTokens,
    raw_usage: rawUsage,
    request_id: requestId,
  });

  if (error) {
    throw error;
  }
}
