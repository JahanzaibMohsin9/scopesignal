import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/retrieval/vector-retriever", () => ({
  retrieveRelevantChunks: vi.fn(),
}));

vi.mock("@/lib/openai/classification-result", () => ({
  classifyScopeForAlert: vi.fn(),
  persistClassificationAlert: vi.fn(),
}));

vi.mock("@/lib/email/alert-notifications", () => ({
  sendScopeAlertEmail: vi.fn(),
}));

vi.mock("@/lib/slack/thread-context", () => ({
  buildSlackThreadContextForJob: vi.fn(),
}));

vi.mock("@/lib/slack/alert-notifications", () => ({
  sendScopeAlertSlackDm: vi.fn(),
}));

vi.mock("@/lib/slack/quota-notifications", () => ({
  sendQuotaThresholdSlackDm: vi.fn(),
}));

vi.mock("@/lib/usage/quota", () => ({
  QuotaExhaustedError: class QuotaExhaustedError extends Error {},
  releaseManagedClassificationQuota: vi.fn(),
  recordByokClassificationUsage: vi.fn(),
  recordManagedClassificationUsage: vi.fn(),
  reserveManagedClassificationQuota: vi.fn(),
}));

vi.mock("@/lib/openai/byok", () => ({
  isInvalidOpenAiApiKeyError: vi.fn(),
  markWorkspaceOpenAiApiKeyInvalid: vi.fn(),
  resolveWorkspaceOpenAiCredentials: vi.fn(),
}));

vi.mock("@/lib/openai/classification", () => ({
  classifyScope: vi.fn(),
}));

vi.mock("@/lib/openai/embeddings", () => ({
  createEmbeddings: vi.fn(),
  createOpenAiEmbeddingClient: vi.fn(() => ({ embeddings: { create: vi.fn() } })),
}));

import { processScopeJob, type ScopeWorkerJob } from "./scope-worker";
import { retrieveRelevantChunks } from "@/lib/retrieval/vector-retriever";
import {
  classifyScopeForAlert,
  persistClassificationAlert,
} from "@/lib/openai/classification-result";
import { buildSlackThreadContextForJob } from "@/lib/slack/thread-context";
import {
  releaseManagedClassificationQuota,
  recordByokClassificationUsage,
  recordManagedClassificationUsage,
  reserveManagedClassificationQuota,
} from "@/lib/usage/quota";
import {
  isInvalidOpenAiApiKeyError,
  markWorkspaceOpenAiApiKeyInvalid,
  resolveWorkspaceOpenAiCredentials,
} from "@/lib/openai/byok";

const mockedRetrieveRelevantChunks = vi.mocked(retrieveRelevantChunks);
const mockedClassifyScopeForAlert = vi.mocked(classifyScopeForAlert);
const mockedPersistClassificationAlert = vi.mocked(persistClassificationAlert);
const mockedBuildSlackThreadContextForJob = vi.mocked(
  buildSlackThreadContextForJob,
);
const mockedRecordByokClassificationUsage = vi.mocked(
  recordByokClassificationUsage,
);
const mockedReleaseManagedClassificationQuota = vi.mocked(
  releaseManagedClassificationQuota,
);
const mockedRecordManagedClassificationUsage = vi.mocked(
  recordManagedClassificationUsage,
);
const mockedReserveManagedClassificationQuota = vi.mocked(
  reserveManagedClassificationQuota,
);
const mockedIsInvalidOpenAiApiKeyError = vi.mocked(isInvalidOpenAiApiKeyError);
const mockedMarkWorkspaceOpenAiApiKeyInvalid = vi.mocked(
  markWorkspaceOpenAiApiKeyInvalid,
);
const mockedResolveWorkspaceOpenAiCredentials = vi.mocked(
  resolveWorkspaceOpenAiCredentials,
);

const job: ScopeWorkerJob = {
  message_id: 201,
  read_count: 1,
  enqueued_at: "2026-04-21T08:00:00.000Z",
  visibility_until: "2026-04-21T08:00:30.000Z",
  payload: {
    workspace_id: "workspace-1",
    slack_channel_id: "C123",
    slack_user_id: "U123",
    message_ts: "1710000000.000100",
    thread_ts: null,
    text: "Can you add a mobile app to this project?",
    received_at: "2026-04-21T08:00:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  mockedBuildSlackThreadContextForJob.mockResolvedValue({
    source: "thread",
    targetFound: true,
    targetTs: job.payload.message_ts,
    transcript: "Client: Can you add a mobile app to this project?",
    messages: [],
  });
  mockedClassifyScopeForAlert.mockResolvedValue({
    output: {
      verdict: "in_scope",
      confidence: 0.91,
      reason: "Covered by the agreement.",
      matched_section: "Proposal > Deliverables (chunk-1)",
      needs_human_review: false,
    },
    edgeCases: [],
    matchedChunkIds: ["chunk-1"],
    usage: {
      promptTokens: 50,
      completionTokens: 10,
      totalTokens: 60,
      rawUsage: {},
      requestId: "req_123",
    },
    model: "gpt-5-mini",
    clientMessage: job.payload.text,
    threadContext: "Client: Can you add a mobile app to this project?",
  });
  mockedPersistClassificationAlert.mockResolvedValue({
    id: "alert-1",
    workspace_id: "workspace-1",
    proposal_id: "proposal-1",
    slack_channel_id: job.payload.slack_channel_id,
    slack_message_ts: job.payload.message_ts,
    slack_thread_ts: null,
    verdict: "in_scope",
    confidence: 0.91,
    reason: "Covered by the agreement.",
    matched_section: "Proposal > Deliverables (chunk-1)",
    matched_chunk_ids: ["chunk-1"],
    client_message: job.payload.text,
    thread_context: "Client: Can you add a mobile app to this project?",
    retrieval_trace: {
      version: 1,
      generatedAt: "2026-04-21T08:00:00.000Z",
      workspaceId: "workspace-1",
      query: {
        text: job.payload.text,
        matchCount: 1,
        finalCount: 1,
        similarityThreshold: null,
      },
      rankingPolicy: {
        addendumRecencyBoost: 2,
        description: "Test trace",
      },
      candidates: [],
      finalChunkIds: ["chunk-1"],
    },
    assigned_user_id: null,
  });
  mockedReserveManagedClassificationQuota.mockResolvedValue({
    workspace_id: "workspace-1",
    month_start: "2026-04-01",
    managed_usage_enabled: true,
    allocated_monthly_events: 100,
    managed_classification_count: 1,
    remaining_events: 99,
    has_quota: true,
    notification_to_send: null,
  });
  mockedReleaseManagedClassificationQuota.mockResolvedValue({
    workspace_id: "workspace-1",
    month_start: "2026-04-01",
    managed_usage_enabled: true,
    allocated_monthly_events: 100,
    managed_classification_count: 0,
    remaining_events: 100,
    has_quota: true,
    notification_to_send: null,
  });
  mockedRecordManagedClassificationUsage.mockResolvedValue({
    workspace_id: "workspace-1",
    month_start: "2026-04-01",
    managed_usage_enabled: true,
    allocated_monthly_events: 100,
    managed_classification_count: 1,
    remaining_events: 99,
    has_quota: true,
    notification_to_send: null,
  });
});

describe("processScopeJob", () => {
  it("falls back to the managed key when the saved BYOK key is rejected", async () => {
    mockedResolveWorkspaceOpenAiCredentials
      .mockResolvedValueOnce({
        apiKey: "sk-byok",
        source: "byok",
        keyLastFour: "9876",
      })
      .mockResolvedValueOnce({
        apiKey: "sk-managed",
        source: "managed",
        keyLastFour: null,
      });
    mockedRetrieveRelevantChunks
      .mockRejectedValueOnce(
        Object.assign(new Error("Incorrect API key provided"), { status: 401 }),
      )
      .mockResolvedValueOnce({
        chunks: [
          {
            id: "chunk-1",
            workspaceId: "workspace-1",
            proposalId: "proposal-1",
            documentId: "document-1",
            documentTitle: "Proposal",
            documentKind: "proposal",
            documentEffectiveDate: "2026-04-01",
            proposalName: "Website Project",
            clientName: "ClientCo",
            sectionTitle: "Deliverables",
            chunkIndex: 0,
            content: "Mobile app work is included.",
            metadata: {},
            similarity: 0.95,
            recencyBoost: 0,
            originalRank: 1,
            finalRank: 1,
            authorityScore: 1,
          },
        ],
        trace: {
          version: 1,
          generatedAt: "2026-04-21T08:00:00.000Z",
          workspaceId: "workspace-1",
          query: {
            text: job.payload.text,
            matchCount: 1,
            finalCount: 1,
            similarityThreshold: null,
          },
          rankingPolicy: {
            addendumRecencyBoost: 2,
            description: "Test trace",
          },
          candidates: [],
          finalChunkIds: ["chunk-1"],
        },
        embedding: {
          model: "text-embedding-3-small",
          promptTokens: 10,
          totalTokens: 10,
          requestId: "req_embed_123",
        },
      });
    mockedIsInvalidOpenAiApiKeyError.mockReturnValue(true);
    mockedMarkWorkspaceOpenAiApiKeyInvalid.mockResolvedValue({ ok: true });

    await expect(processScopeJob(job)).resolves.toBeUndefined();

    expect(mockedResolveWorkspaceOpenAiCredentials).toHaveBeenCalledTimes(2);
    expect(mockedMarkWorkspaceOpenAiApiKeyInvalid).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(mockedReserveManagedClassificationQuota).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(mockedRecordManagedClassificationUsage).toHaveBeenCalled();
    expect(mockedRecordByokClassificationUsage).not.toHaveBeenCalled();
    expect(mockedReleaseManagedClassificationQuota).not.toHaveBeenCalled();
  });

  it("releases managed quota reservations when managed analysis fails", async () => {
    mockedResolveWorkspaceOpenAiCredentials.mockResolvedValue({
      apiKey: "sk-managed",
      source: "managed",
      keyLastFour: null,
    });
    mockedRetrieveRelevantChunks.mockRejectedValue(new Error("OpenAI timeout"));

    await expect(processScopeJob(job)).rejects.toThrow("OpenAI timeout");

    expect(mockedReserveManagedClassificationQuota).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(mockedReleaseManagedClassificationQuota).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(mockedRecordManagedClassificationUsage).not.toHaveBeenCalled();
  });
});
