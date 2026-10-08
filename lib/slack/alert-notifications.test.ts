import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDashboardAlertUrl,
  buildScopeAlertSlackMessage,
  sendScopeAlertSlackDm,
  type SlackAlertNotificationSupabaseClient,
} from "@/lib/slack/alert-notifications";
import type { PersistedClassificationAlert } from "@/lib/openai/classification-result";
import type { RetrievedChunk } from "@/lib/retrieval/vector-retriever";

vi.mock("@/lib/slack/thread-context", () => ({
  getWorkspaceSlackBotToken: vi.fn(async () => "xoxb-token"),
}));

const alert: PersistedClassificationAlert = {
  id: "44444444-4444-4444-8444-444444444444",
  assigned_user_id: null,
  workspace_id: "workspace-1",
  proposal_id: "22222222-2222-4222-8222-222222222222",
  slack_channel_id: "C123",
  slack_message_ts: "1710000000.000100",
  slack_thread_ts: null,
  client_message: "Can we add a pricing page before launch?",
  thread_context: "Client asked for one more page.",
  verdict: "out_of_scope",
  confidence: 0.92,
  reason: "The contract only includes homepage, pricing, and contact pages.",
  matched_section:
    "Website Redesign Proposal > Deliverables (11111111-1111-4111-8111-111111111111)",
  matched_chunk_ids: ["11111111-1111-4111-8111-111111111111"],
  retrieval_trace: {
    version: 1,
    generatedAt: "2026-04-12T10:00:00.000Z",
    workspaceId: "workspace-1",
    query: {
      text: "Can we add a pricing page before launch?",
      matchCount: 10,
      finalCount: 5,
      similarityThreshold: null,
    },
    rankingPolicy: {
      addendumRecencyBoost: 2,
      description: "test",
    },
    candidates: [],
    finalChunkIds: ["11111111-1111-4111-8111-111111111111"],
  },
};

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

function createNotificationClient(email: string | null) {
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: email
        ? {
            id: "user-1",
            email,
            full_name: "Owner User",
            role: "owner",
          }
        : null,
      error: null,
    })),
    limit: vi.fn(async () => ({
      data: email
        ? [
            {
              id: "user-1",
              email,
              full_name: "Owner User",
              role: "owner",
            },
          ]
        : [],
      error: null,
    })),
  };
  const from = vi.fn(() => ({
    select: vi.fn(() => builder),
  }));

  return {
    client: { from } as unknown as SlackAlertNotificationSupabaseClient,
    builder,
  };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.scopesignal.test";
});

describe("buildScopeAlertSlackMessage", () => {
  it("includes the verdict, confidence, client quote, contract snippet, rationale, and dashboard link", () => {
    const message = buildScopeAlertSlackMessage({
      alert,
      chunks: [chunk],
    });

    expect(message.text).toContain("OUT OF SCOPE");
    expect(JSON.stringify(message.blocks)).toContain("92%");
    expect(JSON.stringify(message.blocks)).toContain(
      "Can we add a pricing page before launch?",
    );
    expect(JSON.stringify(message.blocks)).toContain(
      "The fixed scope includes homepage",
    );
    expect(JSON.stringify(message.blocks)).toContain(
      "The contract only includes",
    );
    expect(JSON.stringify(message.blocks)).toContain(
      buildDashboardAlertUrl(alert.id),
    );
  });
});

describe("sendScopeAlertSlackDm", () => {
  it("resolves the workspace owner by email and posts the alert DM", async () => {
    const { client } = createNotificationClient("owner@example.com");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, user: { id: "UOWNER" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, channel: "D123", ts: "171.001" }),
          { status: 200 },
        ),
      );

    await expect(
      sendScopeAlertSlackDm({
        alert,
        chunks: [chunk],
        supabase: client,
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: true,
      recipientSlackUserId: "UOWNER",
      channel: "D123",
      ts: "171.001",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://slack.com/api/users.lookupByEmail?email=owner%40example.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer xoxb-token",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("logs and returns a delivery failure when Slack cannot send the DM", async () => {
    const { client } = createNotificationClient("owner@example.com");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, user: { id: "UOWNER" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, error: "channel_not_found" }),
          {
            status: 200,
          },
        ),
      );

    await expect(
      sendScopeAlertSlackDm({
        alert,
        chunks: [chunk],
        supabase: client,
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "delivery_failed",
      error: "channel_not_found",
    });

    expect(console.warn).toHaveBeenCalledWith(
      "slack_alert_delivery.failed",
      expect.objectContaining({
        reason: "delivery_failed",
        error: "channel_not_found",
      }),
    );
  });

  it("returns recipient_not_found when no owner or assigned user can be resolved", async () => {
    const { client } = createNotificationClient(null);

    await expect(
      sendScopeAlertSlackDm({
        alert,
        chunks: [chunk],
        supabase: client,
        fetchImpl: vi.fn(),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "recipient_not_found",
      error: "No assigned user or workspace owner email was found.",
    });
  });
});
