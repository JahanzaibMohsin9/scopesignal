import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendScopeAlertEmail,
  type ScopeAlertEmailNotificationSupabaseClient,
  type ScopeAlertEmailSender,
} from "@/lib/email/alert-notifications";
import type { PersistedClassificationAlert } from "@/lib/openai/classification-result";
import type { RetrievedChunk } from "@/lib/retrieval/vector-retriever";

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

function createNotificationClient({
  email,
  emailAlertsEnabled,
}: {
  email: string | null;
  emailAlertsEnabled: boolean;
}) {
  const userBuilder = {
    eq: vi.fn(() => userBuilder),
    in: vi.fn(() => userBuilder),
    order: vi.fn(() => userBuilder),
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

  const workspaceBuilder = {
    eq: vi.fn(() => workspaceBuilder),
    maybeSingle: vi.fn(async () => ({
      data: {
        name: "Acme Digital Agency",
        email_alerts_enabled: emailAlertsEnabled,
      },
      error: null,
    })),
  };

  const from = vi.fn((table: "users" | "workspaces") => {
    if (table === "users") {
      return { select: vi.fn(() => userBuilder) };
    }

    return { select: vi.fn(() => workspaceBuilder) };
  });

  return {
    client: { from } as unknown as ScopeAlertEmailNotificationSupabaseClient,
  };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.scopesignal.test";
});

describe("sendScopeAlertEmail", () => {
  it("sends an opt-in email when the workspace has email notifications enabled", async () => {
    const { client } = createNotificationClient({
      email: "owner@example.com",
      emailAlertsEnabled: true,
    });
    const sendEmail: ScopeAlertEmailSender = vi.fn(async () => ({
      data: { id: "email_123" },
      error: null,
    }));

    await expect(
      sendScopeAlertEmail({
        alert,
        chunks: [chunk],
        trigger: "opt_in",
        supabase: client,
        sendEmail,
      }),
    ).resolves.toEqual({
      ok: true,
      emailId: "email_123",
      recipientEmail: "owner@example.com",
      trigger: "opt_in",
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owner@example.com"],
        subject: expect.stringContaining("Out of Scope"),
        html: expect.stringContaining("View Alert"),
        text: expect.stringContaining(
          "View alert: https://app.scopesignal.test/alerts/44444444-4444-4444-8444-444444444444",
        ),
      }),
    );
  });

  it("skips opt-in delivery when the workspace has email alerts disabled", async () => {
    const { client } = createNotificationClient({
      email: "owner@example.com",
      emailAlertsEnabled: false,
    });

    await expect(
      sendScopeAlertEmail({
        alert,
        chunks: [chunk],
        trigger: "opt_in",
        supabase: client,
        sendEmail: vi.fn(),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "opted_out",
      error: "Email notifications are not enabled for this workspace.",
    });
  });

  it("still sends fallback email delivery when Slack fails even if opt-in is off", async () => {
    const { client } = createNotificationClient({
      email: "owner@example.com",
      emailAlertsEnabled: false,
    });
    const sendEmail: ScopeAlertEmailSender = vi.fn(async () => ({
      data: { id: "email_456" },
      error: null,
    }));

    await expect(
      sendScopeAlertEmail({
        alert,
        chunks: [chunk],
        trigger: "slack_failed",
        supabase: client,
        sendEmail,
      }),
    ).resolves.toEqual({
      ok: true,
      emailId: "email_456",
      recipientEmail: "owner@example.com",
      trigger: "slack_failed",
    });
  });
});
