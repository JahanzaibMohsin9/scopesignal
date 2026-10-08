import { describe, expect, it, vi } from "vitest";
import {
  buildSlackAnalysisJobPayload,
  enqueueSlackAnalysisJob,
  getSlackAnalysisJobIdempotencyKey,
  type SlackAnalysisJobPayload,
  type SlackEventQueueSupabaseClient,
} from "./event-queue";
import type {
  SlackEventCallbackPayload,
  SlackPrefilterResult,
} from "./event-prefilter";

const acceptedResult: Extract<SlackPrefilterResult, { accepted: true }> = {
  accepted: true,
  eventId: "Ev123",
  workspaceId: "workspace-1",
  channelId: "channel-row-1",
  clientContactId: "contact-1",
};

const slackPayload: SlackEventCallbackPayload = {
  type: "event_callback",
  team_id: "T123",
  event_id: "Ev123",
  event: {
    type: "message",
    channel: "C123",
    user: "U123",
    ts: "1710000000.000100",
    thread_ts: "1710000000.000000",
    text: "Can we expand the deliverables for launch next week?",
  },
};

describe("Slack event queue helpers", () => {
  it("builds the worker job payload contract from an accepted Slack event", () => {
    expect(
      buildSlackAnalysisJobPayload({
        payload: slackPayload,
        prefilterResult: acceptedResult,
        receivedAt: "2026-04-12T01:00:00.000Z",
      }),
    ).toEqual({
      workspace_id: "workspace-1",
      slack_channel_id: "C123",
      slack_user_id: "U123",
      message_ts: "1710000000.000100",
      thread_ts: "1710000000.000000",
      text: "Can we expand the deliverables for launch next week?",
      received_at: "2026-04-12T01:00:00.000Z",
    });
  });

  it("derives stable idempotency keys for duplicate Slack retries", () => {
    expect(
      getSlackAnalysisJobIdempotencyKey({
        workspace_id: "workspace-1",
        slack_channel_id: "C123",
        message_ts: "1710000000.000100",
      }),
    ).toBe("workspace-1:C123:1710000000.000100");
  });

  it("enqueues jobs through the database RPC with the idempotency key", async () => {
    const jobPayload: SlackAnalysisJobPayload = {
      workspace_id: "workspace-1",
      slack_channel_id: "C123",
      slack_user_id: "U123",
      message_ts: "1710000000.000100",
      thread_ts: null,
      text: "Can we expand the deliverables for launch next week?",
      received_at: "2026-04-12T01:00:00.000Z",
    };
    const rpc = vi.fn(async () => ({ data: 42, error: null }));
    const supabase = { rpc } as unknown as SlackEventQueueSupabaseClient;

    await expect(
      enqueueSlackAnalysisJob({ jobPayload, supabase }),
    ).resolves.toMatchObject({
      idempotencyKey: "workspace-1:C123:1710000000.000100",
      messageId: 42,
    });
    expect(rpc).toHaveBeenCalledWith("enqueue_slack_event_job", {
      job_payload: jobPayload,
      p_idempotency_key: "workspace-1:C123:1710000000.000100",
    });
  });
});
