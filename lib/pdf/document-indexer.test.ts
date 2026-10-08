import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const {
  createEmbeddingsMock,
  createOpenAiEmbeddingClientMock,
  persistDocumentChunksMock,
} = vi.hoisted(() => ({
  createEmbeddingsMock: vi.fn(),
  createOpenAiEmbeddingClientMock: vi.fn(),
  persistDocumentChunksMock: vi.fn(),
}));

vi.mock("@/lib/openai/embeddings", () => ({
  createEmbeddings: createEmbeddingsMock,
  createOpenAiEmbeddingClient: createOpenAiEmbeddingClientMock,
}));

vi.mock("@/lib/pdf/chunk-storage", () => ({
  persistDocumentChunks: persistDocumentChunksMock,
}));

import { indexDocumentChunks } from "./document-indexer";

function createSupabaseMock() {
  const documentEqMock = vi.fn().mockResolvedValue({ error: null });
  const documentUpdateMock = vi.fn(() => ({ eq: documentEqMock }));

  const chunkEqMock = vi.fn().mockResolvedValue({ error: null });
  const chunkUpdateMock = vi.fn(() => ({ eq: chunkEqMock }));

  const usageInsertMock = vi.fn().mockResolvedValue({ error: null });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          update: documentUpdateMock,
        };
      }

      if (table === "chunks") {
        return {
          update: chunkUpdateMock,
        };
      }

      if (table === "usage_logs") {
        return {
          insert: usageInsertMock,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    supabase,
    documentUpdateMock,
    documentEqMock,
    chunkUpdateMock,
    chunkEqMock,
    usageInsertMock,
  };
}

function asSupabaseClient(supabase: unknown): Pick<SupabaseClient, "from"> {
  return supabase as Pick<SupabaseClient, "from">;
}

beforeEach(() => {
  vi.clearAllMocks();
  persistDocumentChunksMock.mockResolvedValue([
    {
      id: "chunk-1",
      chunkIndex: 0,
      content: "Included services.",
    },
    {
      id: "chunk-2",
      chunkIndex: 1,
      content: "Excluded services.",
    },
  ]);
  createEmbeddingsMock.mockResolvedValue({
    embeddings: [
      [0.1, 0.2],
      [0.3, 0.4],
    ],
    model: "text-embedding-3-small",
    usage: {
      promptTokens: 9,
      totalTokens: 9,
      rawUsage: {
        prompt_tokens: 9,
        total_tokens: 9,
      },
      requestId: "req_123",
    },
  });
  createOpenAiEmbeddingClientMock.mockReturnValue({
    embeddings: {},
  });
});

describe("indexDocumentChunks", () => {
  it("persists chunks, embeds them, stores vectors, logs usage, and marks the document indexed", async () => {
    const mocks = createSupabaseMock();

    await expect(
      indexDocumentChunks({
        supabase: asSupabaseClient(mocks.supabase),
        workspaceId: "workspace-1",
        proposalId: "proposal-1",
        documentId: "document-1",
        text: "Normalized text.",
      }),
    ).resolves.toBe(2);

    expect(mocks.documentUpdateMock).toHaveBeenNthCalledWith(1, {
      status: "processing",
    });
    expect(persistDocumentChunksMock).toHaveBeenCalledWith({
      supabase: asSupabaseClient(mocks.supabase),
      workspaceId: "workspace-1",
      proposalId: "proposal-1",
      documentId: "document-1",
      text: "Normalized text.",
    });
    expect(createEmbeddingsMock).toHaveBeenCalledWith(
      ["Included services.", "Excluded services."],
      undefined,
    );
    expect(mocks.chunkUpdateMock).toHaveBeenCalledWith({
      embedding: [0.1, 0.2],
    });
    expect(mocks.chunkUpdateMock).toHaveBeenCalledWith({
      embedding: [0.3, 0.4],
    });
    expect(mocks.usageInsertMock).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      source: "managed",
      provider: "openai",
      model: "text-embedding-3-small",
      request_type: "embedding",
      prompt_tokens: 9,
      completion_tokens: 0,
      total_tokens: 9,
      raw_usage: {
        prompt_tokens: 9,
        total_tokens: 9,
      },
      request_id: "req_123",
    });
    expect(mocks.documentUpdateMock).toHaveBeenLastCalledWith({
      status: "indexed",
    });
  });

  it("logs BYOK document embedding usage with the workspace credential source", async () => {
    const mocks = createSupabaseMock();
    const embeddingClient = { embeddings: {} };
    createOpenAiEmbeddingClientMock.mockReturnValue(embeddingClient);

    await expect(
      indexDocumentChunks({
        supabase: asSupabaseClient(mocks.supabase),
        workspaceId: "workspace-1",
        proposalId: "proposal-1",
        documentId: "document-1",
        text: "Normalized text.",
        credentialSource: "byok",
        apiKey: "sk-test",
      }),
    ).resolves.toBe(2);

    expect(createOpenAiEmbeddingClientMock).toHaveBeenCalledWith("sk-test");
    expect(createEmbeddingsMock).toHaveBeenCalledWith(
      ["Included services.", "Excluded services."],
      embeddingClient,
    );
    expect(mocks.usageInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "workspace-1",
        source: "byok",
      }),
    );
  });

  it("retries transient embedding failures before succeeding", async () => {
    vi.useFakeTimers();
    const mocks = createSupabaseMock();
    createEmbeddingsMock
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        embeddings: [[0.1, 0.2]],
        model: "text-embedding-3-small",
        usage: {
          promptTokens: 5,
          totalTokens: 5,
          rawUsage: {},
          requestId: null,
        },
      });
    persistDocumentChunksMock.mockResolvedValue([
      { id: "chunk-1", chunkIndex: 0, content: "Included services." },
    ]);

    const result = indexDocumentChunks({
      supabase: asSupabaseClient(mocks.supabase),
      workspaceId: "workspace-1",
      proposalId: "proposal-1",
      documentId: "document-1",
      text: "Normalized text.",
    });

    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toBe(1);
    expect(createEmbeddingsMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("marks the document failed when no chunks are generated", async () => {
    const mocks = createSupabaseMock();
    persistDocumentChunksMock.mockResolvedValue([]);

    await expect(
      indexDocumentChunks({
        supabase: asSupabaseClient(mocks.supabase),
        workspaceId: "workspace-1",
        proposalId: "proposal-1",
        documentId: "document-1",
        text: null,
      }),
    ).rejects.toThrow("No readable chunks");

    expect(mocks.documentUpdateMock).toHaveBeenLastCalledWith({
      status: "failed",
      parse_error: "No readable chunks were generated from this document.",
    });
  });
});
