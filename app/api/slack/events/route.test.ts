import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSlackEventMetricsSnapshot,
  resetSlackEventMetrics,
} from "@/lib/slack/event-metrics";
import { enqueueSlackAnalysisJob } from "@/lib/slack/event-queue";
import { POST, verifySlackSignature } from "./route";

vi.mock("@/lib/slack/event-prefilter", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/slack/event-prefilter")>();

  return {
    ...original,
    prefilterSlackMessageEvent: vi.fn(async () => ({
      accepted: true,
      eventId: "Ev123",
      workspaceId: "workspace-1",
      channelId: "channel-1",
      clientContactId: "contact-1",
    })),
  };
});

vi.mock("@/lib/slack/event-queue", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/slack/event-queue")>();

  return {
    ...original,
    enqueueSlackAnalysisJob: vi.fn(async () => ({
      idempotencyKey: "workspace-1:C123:1710000000.000100",
      messageId: 1,
    })),
  };
});

const signingSecret = "test-signing-secret";

function slackSignature(body: string, timestamp: string) {
  return `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
}

function signedRequest(body: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  return new Request("http://localhost/api/slack/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": slackSignature(body, timestamp),
    },
    body,
  });
}

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = signingSecret;
  resetSlackEventMetrics();
  vi.mocked(enqueueSlackAnalysisJob).mockClear();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("verifySlackSignature", () => {
  it("accepts fresh requests with matching signatures", async () => {
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    await expect(
      verifySlackSignature({
        body,
        signature: slackSignature(body, timestamp),
        signingSecret,
        timestamp,
      }),
    ).resolves.toBe(true);
  });

  it("rejects mismatched signatures", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();

    await expect(
      verifySlackSignature({
        body: "{}",
        signature: "v0=not-valid",
        signingSecret,
        timestamp,
      }),
    ).resolves.toBe(false);
  });

  it("rejects stale request timestamps", async () => {
    const body = "{}";
    const timestamp = (Math.floor(Date.now() / 1000) - 301).toString();

    await expect(
      verifySlackSignature({
        body,
        signature: slackSignature(body, timestamp),
        signingSecret,
        timestamp,
      }),
    ).resolves.toBe(false);
  });
});

describe("Slack events route", () => {
  it("responds to Slack URL verification challenges", async () => {
    const response = await POST(
      signedRequest(
        JSON.stringify({
          type: "url_verification",
          challenge: "challenge-token",
        }),
      ) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-token");
  });

  it("requires a valid signature for URL verification challenges", async () => {
    const response = await POST(
      new Request("http://localhost/api/slack/events", {
        method: "POST",
        body: JSON.stringify({
          type: "url_verification",
          challenge: "challenge-token",
        }),
      }) as never,
    );

    expect(response.status).toBe(401);
  });

  it("acknowledges event callbacks and records received metrics", async () => {
    const response = await POST(
      signedRequest(
        JSON.stringify({
          type: "event_callback",
          team_id: "T123",
          event_id: "Ev123",
          event: {
            type: "message",
            channel: "C123",
            user: "U123",
            ts: "1710000000.000100",
            text: "Can we expand the deliverables for launch next week?",
          },
        }),
      ) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(getSlackEventMetricsSnapshot().received).toBe(1);
    expect(enqueueSlackAnalysisJob).toHaveBeenCalledWith({
      jobPayload: expect.objectContaining({
        workspace_id: "workspace-1",
        slack_channel_id: "C123",
        slack_user_id: "U123",
        message_ts: "1710000000.000100",
        thread_ts: null,
        text: "Can we expand the deliverables for launch next week?",
      }),
    });
  });

  it("rejects unsigned requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/slack/events", {
        method: "POST",
        body: "{}",
      }) as never,
    );

    expect(response.status).toBe(401);
  });
});
