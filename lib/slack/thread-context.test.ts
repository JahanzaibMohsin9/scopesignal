import { describe, expect, it, vi } from "vitest";
import {
  buildSlackThreadContextForJob,
  fetchSlackThreadContext,
  type SlackThreadContextSupabaseClient,
} from "@/lib/slack/thread-context";
import { encryptSlackToken } from "@/lib/slack/token-vault";
import type { SlackAnalysisJobPayload } from "@/lib/slack/event-queue";

const jobPayload: SlackAnalysisJobPayload = {
  workspace_id: "workspace-1",
  slack_channel_id: "C123",
  slack_user_id: "UCLIENT",
  message_ts: "1710000300.000100",
  thread_ts: "1710000000.000100",
  text: "Can we expand the launch deliverables by Friday?",
  received_at: "2026-04-12T10:00:00.000Z",
};

function slackResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function mockSlackFetch({
  messages,
  users = {},
}: {
  messages: unknown[];
  users?: Record<string, string>;
}) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input);

    if (url.includes("conversations.")) {
      return slackResponse({ ok: true, messages });
    }

    if (url.includes("users.info")) {
      const userId = new URL(url).searchParams.get("user") ?? "";
      return slackResponse({
        ok: true,
        user: {
          id: userId,
          name: userId,
          profile: {
            display_name: users[userId] ?? userId,
          },
        },
      });
    }

    return slackResponse({ ok: false, error: "unexpected_method" });
  }) as unknown as typeof fetch;
}

describe("fetchSlackThreadContext", () => {
  it("fetches thread replies and formats a chronological transcript with speaker names", async () => {
    const fetchImpl = mockSlackFetch({
      messages: [
        {
          type: "message",
          user: "UCLIENT",
          text: "Can we expand the launch deliverables by Friday?",
          ts: "1710000300.000100",
        },
        {
          type: "message",
          user: "UAM",
          text: "The proposal includes homepage, pricing, and contact pages.",
          ts: "1710000200.000100",
        },
        {
          type: "message",
          user: "UCLIENT",
          text: "What is included in launch support?",
          ts: "1710000000.000100",
        },
      ],
      users: {
        UCLIENT: "Nora Client",
        UAM: "Ari Manager",
      },
    });

    const context = await fetchSlackThreadContext({
      botToken: "xoxb-token",
      jobPayload,
      contextMessageCount: 3,
      fetchImpl,
    });

    expect(context.source).toBe("thread");
    expect(context.targetFound).toBe(true);
    expect(context.messages.map((message) => message.ts)).toEqual([
      "1710000000.000100",
      "1710000200.000100",
      "1710000300.000100",
    ]);
    expect(context.transcript).toContain(
      "[2024-03-09 16:00:00 UTC] Nora Client: What is included in launch support?",
    );
    expect(context.transcript).toContain(
      "[2024-03-09 16:05:00 UTC] Nora Client (target): Can we expand the launch deliverables by Friday?",
    );
  });

  it("uses channel history when there is no thread timestamp", async () => {
    const fetchImpl = mockSlackFetch({
      messages: [
        {
          type: "message",
          user: "UCLIENT",
          text: "Can we expand the launch deliverables by Friday?",
          ts: "1710000300.000100",
        },
      ],
      users: { UCLIENT: "Nora Client" },
    });

    const context = await fetchSlackThreadContext({
      botToken: "xoxb-token",
      jobPayload: { ...jobPayload, thread_ts: null },
      fetchImpl,
    });

    expect(context.source).toBe("channel");
    expect(context.transcript).toContain("Nora Client (target)");
  });

  it("falls back to the queued payload when Slack returns an empty history window", async () => {
    const fetchImpl = mockSlackFetch({
      messages: [],
      users: { UCLIENT: "Nora Client" },
    });

    const context = await fetchSlackThreadContext({
      botToken: "xoxb-token",
      jobPayload,
      fetchImpl,
    });

    expect(context.targetFound).toBe(false);
    expect(context.warning).toBe(
      "Target message was not returned by Slack; used queued payload as fallback.",
    );
    expect(context.transcript).toContain("Nora Client (target)");
    expect(context.transcript).toContain(jobPayload.text);
  });

  it("surfaces Slack rate limits with retry timing", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "12" },
      });
    }) as unknown as typeof fetch;

    await expect(
      fetchSlackThreadContext({
        botToken: "xoxb-token",
        jobPayload,
        fetchImpl,
      }),
    ).rejects.toThrow("Slack API rate limited; retry after 12s.");
  });
});

describe("buildSlackThreadContextForJob", () => {
  it("loads and decrypts the workspace Slack bot token before fetching context", async () => {
    process.env.SLACK_TOKEN_ENCRYPTION_KEY = "test-encryption-key";
    const encryptedToken = encryptSlackToken("xoxb-decrypted");
    const fetchImpl = mockSlackFetch({
      messages: [
        {
          type: "message",
          user: "UCLIENT",
          text: jobPayload.text,
          ts: jobPayload.message_ts,
        },
      ],
      users: { UCLIENT: "Nora Client" },
    });

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { slack_access_token_ciphertext: encryptedToken },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SlackThreadContextSupabaseClient;

    const context = await buildSlackThreadContextForJob({
      jobPayload,
      supabase,
      fetchImpl,
    });

    expect(context.transcript).toContain("Nora Client (target)");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://slack.com/api/conversations.replies",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer xoxb-decrypted",
        }),
      }),
    );
  });
});
