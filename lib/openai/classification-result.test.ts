import { describe, expect, it, vi } from "vitest";
import {
  classifyScopeForAlert,
  HUMAN_REVIEW_CONFIDENCE_THRESHOLD,
  persistClassificationAlert,
  type ClassificationAlertSupabaseClient,
} from "@/lib/openai/classification-result";
import type {
  RetrievedChunk,
  RetrievalTrace,
} from "@/lib/retrieval/vector-retriever";
import type { SlackAnalysisJobPayload } from "@/lib/slack/event-queue";

const chunk: RetrievedChunk = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-1",
  proposalId: "22222222-2222-4222-8222-222222222222",
  documentId: "33333333-3333-4333-8333-333333333333",
  documentTitle: "Website Redesign Proposal",
  documentKind: "proposal",
  documentEffectiveDate: "2026-04-01",
  proposalName: "Website Redesign",
  clientName: "ClientCo",
  sectionTitle: "Deliverables",
  chunkIndex: 1,
  content: "The fixed scope includes homepage, pricing, and contact pages.",
  metadata: {},
  similarity: 0.91,
  authorityScore: 0.91,
  recencyBoost: 0,
  originalRank: 1,
  finalRank: 1,
};

const trace: RetrievalTrace = {
  version: 1,
  generatedAt: "2026-04-12T10:00:00.000Z",
  workspaceId: "workspace-1",
  query: {
    text: "Can we add another page?",
    matchCount: 10,
    finalCount: 5,
    similarityThreshold: null,
  },
  rankingPolicy: {
    addendumRecencyBoost: 2,
    description: "test",
  },
  candidates: [],
  finalChunkIds: [chunk.id],
};

const jobPayload: SlackAnalysisJobPayload = {
  workspace_id: "workspace-1",
  slack_channel_id: "C123",
  slack_user_id: "U123",
  message_ts: "1710000000.000100",
  thread_ts: null,
  text: "Can we add another page?",
  received_at: "2026-04-12T10:00:00.000Z",
};

function createAlertClient() {
  const maybeSingle = vi.fn(async () => ({
    data: {
      id: "44444444-4444-4444-8444-444444444444",
      assigned_user_id: null,
    },
    error: null,
  }));
  const select = vi.fn(() => ({ maybeSingle }));
  const upsert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));

  return {
    client: { from } as unknown as ClassificationAlertSupabaseClient,
    upsert,
    select,
    maybeSingle,
  };
}

describe("classifyScopeForAlert", () => {
  it("forces low-confidence model output into human review", async () => {
    const classifier = vi.fn(async () => ({
      output: {
        verdict: "out_of_scope" as const,
        confidence: HUMAN_REVIEW_CONFIDENCE_THRESHOLD - 0.01,
        reason: "The evidence is weak.",
        matched_section:
          "Website Redesign Proposal > Deliverables (11111111-1111-4111-8111-111111111111)",
        needs_human_review: false,
      },
      model: "gpt-5-mini",
      usage: {
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        rawUsage: {},
        requestId: "req_123",
      },
    }));

    const result = await classifyScopeForAlert({
      workspaceId: "workspace-1",
      clientMessage: "Can we add another page?",
      threadContext: "Client asked for an extra page.",
      chunks: [chunk],
      classifier,
    });

    expect(result.output).toEqual(
      expect.objectContaining({
        verdict: "needs_review",
        needs_human_review: true,
      }),
    );
    expect(result.output.reason).toContain("confidence below 0.6");
  });

  it("returns review without calling the model when retrieval is empty", async () => {
    const classifier = vi.fn();

    const result = await classifyScopeForAlert({
      workspaceId: "workspace-1",
      clientMessage: "Can we add a landing page?",
      threadContext: "",
      chunks: [],
      classifier,
    });

    expect(classifier).not.toHaveBeenCalled();
    expect(result.output.verdict).toBe("needs_review");
    expect(result.output.needs_human_review).toBe(true);
    expect(result.edgeCases).toContain("empty_retrieval");
    expect(result.matchedChunkIds).toEqual([]);
  });

  it("defaults ambiguous client wording to review even when the model is definitive", async () => {
    const result = await classifyScopeForAlert({
      workspaceId: "workspace-1",
      clientMessage: "Maybe we can add another page before launch?",
      threadContext: "",
      chunks: [chunk],
      classifier: vi.fn(async () => ({
        output: {
          verdict: "out_of_scope" as const,
          confidence: 0.92,
          reason: "Additional pages require change order.",
          matched_section:
            "Website Redesign Proposal > Deliverables (11111111-1111-4111-8111-111111111111)",
          needs_human_review: false,
        },
        model: "gpt-5-mini",
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          rawUsage: {},
          requestId: null,
        },
      })),
    });

    expect(result.output.verdict).toBe("needs_review");
    expect(result.output.needs_human_review).toBe(true);
    expect(result.output.reason).toContain("ambiguous client wording");
    expect(result.edgeCases).toContain("ambiguous_language");
  });

  it("returns review without calling the model for non-English messages", async () => {
    const classifier = vi.fn();

    const result = await classifyScopeForAlert({
      workspaceId: "workspace-1",
      clientMessage:
        "Podemos agregar una pagina adicional antes del lanzamiento?",
      threadContext: "",
      chunks: [chunk],
      classifier,
    });

    expect(classifier).not.toHaveBeenCalled();
    expect(result.output.verdict).toBe("needs_review");
    expect(result.edgeCases).toContain("non_english_message");
    expect(result.matchedChunkIds).toEqual([chunk.id]);
  });

  it("truncates extremely long messages before classification", async () => {
    const classifier = vi.fn(async () => ({
      output: {
        verdict: "in_scope" as const,
        confidence: 0.91,
        reason: "Included.",
        matched_section:
          "Website Redesign Proposal > Deliverables (11111111-1111-4111-8111-111111111111)",
        needs_human_review: false,
      },
      model: "gpt-5-mini",
      usage: {
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        rawUsage: {},
        requestId: null,
      },
    }));

    const result = await classifyScopeForAlert({
      workspaceId: "workspace-1",
      clientMessage: "A".repeat(7_000),
      threadContext: "",
      chunks: [chunk],
      classifier,
    });

    expect(result.edgeCases).toContain("long_message_truncated");
    expect(classifier).toHaveBeenCalledWith({
      input: expect.objectContaining({
        clientMessage: expect.stringContaining(
          "[truncated for classification]",
        ),
      }),
    });
  });
});

describe("persistClassificationAlert", () => {
  it("upserts the normalized classification result into alerts", async () => {
    const { client, upsert } = createAlertClient();
    const outcome = await classifyScopeForAlert({
      workspaceId: "workspace-1",
      clientMessage: "Can we add another page?",
      threadContext: "Client asked for an extra page.",
      chunks: [chunk],
      classifier: vi.fn(async () => ({
        output: {
          verdict: "out_of_scope" as const,
          confidence: 0.92,
          reason: "Additional pages require change order.",
          matched_section:
            "Website Redesign Proposal > Deliverables (11111111-1111-4111-8111-111111111111)",
          needs_human_review: false,
        },
        model: "gpt-5-mini",
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          rawUsage: {},
          requestId: "req_123",
        },
      })),
    });

    await persistClassificationAlert({
      jobPayload,
      outcome,
      chunks: [chunk],
      retrievalTrace: trace,
      supabase: client,
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        workspace_id: "workspace-1",
        proposal_id: chunk.proposalId,
        slack_channel_id: "C123",
        slack_message_ts: "1710000000.000100",
        slack_thread_ts: null,
        client_message: "Can we add another page?",
        thread_context: "Client asked for an extra page.",
        verdict: "out_of_scope",
        confidence: 0.92,
        reason: "Additional pages require change order.",
        matched_section:
          "Website Redesign Proposal > Deliverables (11111111-1111-4111-8111-111111111111)",
        matched_chunk_ids: [chunk.id],
        retrieval_trace: trace,
      },
      { onConflict: "workspace_id,slack_channel_id,slack_message_ts" },
    );
  });
});
