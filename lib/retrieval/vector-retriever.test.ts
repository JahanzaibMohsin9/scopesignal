import { describe, expect, it, vi } from "vitest";
import {
  persistRetrievalTraceForAlert,
  retrieveRelevantChunks,
  type MatchedChunkRow,
  type RetrievalTrace,
  type VectorRetrieverSupabaseClient,
} from "@/lib/retrieval/vector-retriever";

const matchedChunk: MatchedChunkRow = {
  chunk_id: "chunk-1",
  workspace_id: "workspace-1",
  proposal_id: "proposal-1",
  document_id: "document-1",
  document_title: "Website Redesign Proposal",
  document_kind: "proposal",
  document_effective_date: "2026-04-01",
  proposal_name: "Website Redesign",
  client_name: "ClientCo",
  section_title: "Deliverables",
  chunk_index: 3,
  content: "The project includes homepage, pricing, and contact page delivery.",
  metadata: { sectionLevel: 2 },
  similarity: 0.87,
};

function createSupabaseClient({
  chunks = [matchedChunk],
  fallbackChunks = [],
  rpcError = null,
  usageError = null,
}: {
  chunks?: MatchedChunkRow[];
  fallbackChunks?: unknown[];
  rpcError?: { message?: string } | null;
  usageError?: { message?: string } | null;
} = {}) {
  const insert = vi.fn(async () => ({ error: usageError }));
  const updateResult = vi.fn(async () => ({ error: null }));
  const slackMessageEq = vi.fn(() => updateResult());
  const slackChannelEq = vi.fn(() => ({ eq: slackMessageEq }));
  const workspaceEq = vi.fn(() => ({ eq: slackChannelEq }));
  const update = vi.fn(() => ({ eq: workspaceEq }));
  const rpc = vi.fn(async () => ({
    data: chunks,
    error: rpcError,
  }));
  const fallbackLimit = vi.fn(async () => ({
    data: fallbackChunks,
    error: null,
  }));
  const fallbackOrder = vi.fn(() => ({ limit: fallbackLimit }));
  const fallbackDocumentDeletedAtIs = vi.fn(() => ({ order: fallbackOrder }));
  const fallbackDocumentStatusEq = vi.fn(() => ({
    is: fallbackDocumentDeletedAtIs,
  }));
  const fallbackDeletedAtIs = vi.fn(() => ({ eq: fallbackDocumentStatusEq }));
  const fallbackWorkspaceEq = vi.fn(() => ({ is: fallbackDeletedAtIs }));
  const fallbackSelect = vi.fn(() => ({ eq: fallbackWorkspaceEq }));
  const from = vi.fn((table: "usage_logs" | "alerts" | "chunks") => {
    if (table === "alerts") {
      return { update };
    }

    if (table === "chunks") {
      return { select: fallbackSelect };
    }

    return { insert };
  });

  return {
    client: {
      rpc,
      from,
    } as unknown as VectorRetrieverSupabaseClient,
    rpc,
    insert,
    update,
    workspaceEq,
    slackChannelEq,
    slackMessageEq,
    fallbackSelect,
    fallbackWorkspaceEq,
    fallbackLimit,
  };
}

const embeddingResult = {
  embeddings: [[0.1, 0.2, 0.3]],
  model: "text-embedding-3-small",
  usage: {
    promptTokens: 12,
    totalTokens: 12,
    rawUsage: { prompt_tokens: 12, total_tokens: 12 },
    requestId: "req_123",
  },
};

describe("retrieveRelevantChunks", () => {
  it("embeds the message and retrieves workspace-scoped matching chunks", async () => {
    const { client, rpc, insert } = createSupabaseClient();
    const embedder = vi.fn(async () => embeddingResult);

    const result = await retrieveRelevantChunks({
      workspaceId: "workspace-1",
      message: " Can we add another landing page? ",
      matchCount: 10,
      similarityThreshold: 0.6,
      supabase: client,
      embedder,
    });

    expect(embedder).toHaveBeenCalledWith(["Can we add another landing page?"]);
    expect(rpc).toHaveBeenCalledWith("match_chunks", {
      p_workspace_id: "workspace-1",
      query_embedding: [0.1, 0.2, 0.3],
      match_count: 10,
      similarity_threshold: 0.6,
    });
    expect(result.chunks).toEqual([
      {
        id: "chunk-1",
        workspaceId: "workspace-1",
        proposalId: "proposal-1",
        documentId: "document-1",
        documentTitle: "Website Redesign Proposal",
        documentKind: "proposal",
        documentEffectiveDate: "2026-04-01",
        proposalName: "Website Redesign",
        clientName: "ClientCo",
        sectionTitle: "Deliverables",
        chunkIndex: 3,
        content:
          "The project includes homepage, pricing, and contact page delivery.",
        metadata: { sectionLevel: 2 },
        similarity: 0.87,
        authorityScore: 0.87,
        recencyBoost: 0,
        originalRank: 1,
        finalRank: 1,
      },
    ]);
    expect(result.trace).toEqual(
      expect.objectContaining({
        version: 1,
        workspaceId: "workspace-1",
        finalChunkIds: ["chunk-1"],
        query: {
          text: "Can we add another landing page?",
          matchCount: 10,
          finalCount: 5,
          similarityThreshold: 0.6,
        },
      }),
    );
    expect(result.trace.candidates).toEqual([
      expect.objectContaining({
        chunkId: "chunk-1",
        similarity: 0.87,
        recencyBoost: 0,
        authorityScore: 0.87,
        originalRank: 1,
        finalRank: 1,
        selected: true,
      }),
    ]);
    expect(insert).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      source: "managed",
      provider: "openai",
      model: "text-embedding-3-small",
      request_type: "embedding",
      prompt_tokens: 12,
      completion_tokens: 0,
      total_tokens: 12,
      raw_usage: { prompt_tokens: 12, total_tokens: 12 },
      request_id: "req_123",
    });
  });

  it("returns no chunks without calling OpenAI for blank messages", async () => {
    const { client, rpc } = createSupabaseClient();
    const embedder = vi.fn(async () => embeddingResult);

    await expect(
      retrieveRelevantChunks({
        workspaceId: "workspace-1",
        message: "   ",
        supabase: client,
        embedder,
      }),
    ).resolves.toEqual({
      chunks: [],
      trace: expect.objectContaining({
        version: 1,
        workspaceId: "workspace-1",
        finalChunkIds: [],
        candidates: [],
      }),
      embedding: {
        model: "",
        promptTokens: 0,
        totalTokens: 0,
        requestId: null,
      },
    });

    expect(embedder).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws when OpenAI does not return a query embedding", async () => {
    const { client } = createSupabaseClient();

    await expect(
      retrieveRelevantChunks({
        workspaceId: "workspace-1",
        message: "scope question",
        supabase: client,
        embedder: vi.fn(async () => ({
          ...embeddingResult,
          embeddings: [],
        })),
      }),
    ).rejects.toThrow("OpenAI did not return an embedding for the query.");
  });

  it("surfaces database retrieval failures", async () => {
    const { client } = createSupabaseClient({
      rpcError: { message: "workspace denied" },
    });

    await expect(
      retrieveRelevantChunks({
        workspaceId: "workspace-1",
        message: "scope question",
        supabase: client,
        embedder: vi.fn(async () => embeddingResult),
      }),
    ).rejects.toThrow("workspace denied");
  });

  it("falls back to indexed workspace chunks when vector search returns no candidates", async () => {
    const fallbackChunk = {
      id: "fallback-chunk",
      workspace_id: "workspace-1",
      proposal_id: "proposal-1",
      document_id: "document-1",
      section_title: "Out-of-Scope Items",
      chunk_index: 0,
      content: "Mobile apps and payment gateways require a separate addendum.",
      metadata: { source: "fallback" },
      documents: {
        title: "Website Redesign Proposal",
        kind: "proposal",
        effective_date: "2026-04-01",
      },
      proposals: {
        name: "Website Redesign",
        client_name: "ClientCo",
      },
    };
    const { client, fallbackWorkspaceEq, fallbackLimit } = createSupabaseClient(
      {
        chunks: [],
        fallbackChunks: [fallbackChunk],
      },
    );

    const result = await retrieveRelevantChunks({
      workspaceId: "workspace-1",
      message: "Can we build a mobile app too?",
      supabase: client,
      embedder: vi.fn(async () => embeddingResult),
    });

    expect(fallbackWorkspaceEq).toHaveBeenCalledWith(
      "workspace_id",
      "workspace-1",
    );
    expect(fallbackLimit).toHaveBeenCalledWith(5);
    expect(result.chunks).toEqual([
      expect.objectContaining({
        id: "fallback-chunk",
        proposalId: "proposal-1",
        documentTitle: "Website Redesign Proposal",
        proposalName: "Website Redesign",
        content:
          "Mobile apps and payment gateways require a separate addendum.",
        similarity: 1,
        finalRank: 1,
      }),
    ]);
    expect(result.trace.finalChunkIds).toEqual(["fallback-chunk"]);
  });

  it("boosts newer addendums above older proposal chunks and keeps the final top five", async () => {
    const olderProposal = {
      ...matchedChunk,
      chunk_id: "proposal-chunk",
      document_kind: "proposal" as const,
      document_effective_date: "2026-01-01",
      similarity: 0.99,
    };
    const newerAddendum = {
      ...matchedChunk,
      chunk_id: "addendum-chunk",
      document_id: "document-2",
      document_kind: "addendum" as const,
      document_effective_date: "2026-03-01",
      similarity: 0.62,
    };
    const otherChunks = Array.from({ length: 5 }, (_, index) => ({
      ...matchedChunk,
      chunk_id: `other-${index}`,
      document_id: `other-document-${index}`,
      proposal_id: `other-proposal-${index}`,
      similarity: 0.98 - index * 0.01,
    }));
    const { client } = createSupabaseClient({
      chunks: [olderProposal, ...otherChunks, newerAddendum],
    });

    const result = await retrieveRelevantChunks({
      workspaceId: "workspace-1",
      message: "Can we add another landing page?",
      supabase: client,
      embedder: vi.fn(async () => embeddingResult),
    });

    expect(result.chunks).toHaveLength(5);
    expect(result.chunks[0]).toEqual(
      expect.objectContaining({
        id: "addendum-chunk",
        recencyBoost: 2,
        authorityScore: 2.62,
        finalRank: 1,
      }),
    );
    expect(result.trace.finalChunkIds).toHaveLength(5);
    expect(result.trace.finalChunkIds[0]).toBe("addendum-chunk");
    expect(result.trace.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chunkId: "addendum-chunk",
          selected: true,
          finalRank: 1,
        }),
        expect.objectContaining({
          chunkId: "other-4",
          selected: false,
          finalRank: null,
        }),
      ]),
    );
  });

  it("persists retrieval traces on matching alert records", async () => {
    const { client, update, workspaceEq, slackChannelEq, slackMessageEq } =
      createSupabaseClient();
    const trace = {
      version: 1,
      generatedAt: "2026-04-12T10:00:00.000Z",
      workspaceId: "workspace-1",
      query: {
        text: "scope question",
        matchCount: 10,
        finalCount: 5,
        similarityThreshold: null,
      },
      rankingPolicy: {
        addendumRecencyBoost: 2,
        description: "test",
      },
      candidates: [],
      finalChunkIds: [],
    } satisfies RetrievalTrace;

    await persistRetrievalTraceForAlert({
      workspaceId: "workspace-1",
      slackChannelId: "C123",
      slackMessageTs: "1710000000.000100",
      trace,
      supabase: client,
    });

    expect(update).toHaveBeenCalledWith({ retrieval_trace: trace });
    expect(workspaceEq).toHaveBeenCalledWith("workspace_id", "workspace-1");
    expect(slackChannelEq).toHaveBeenCalledWith("slack_channel_id", "C123");
    expect(slackMessageEq).toHaveBeenCalledWith(
      "slack_message_ts",
      "1710000000.000100",
    );
  });
});
