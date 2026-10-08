import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  SlackEventCallbackPayload,
  SlackPrefilterResult,
} from "@/lib/slack/event-prefilter";

export const SLACK_ANALYSIS_QUEUE_NAME = "scopesignal_jobs";

export type SlackAnalysisJobPayload = {
  workspace_id: string;
  slack_channel_id: string;
  slack_user_id: string;
  message_ts: string;
  thread_ts: string | null;
  text: string;
  received_at: string;
};

export function getSlackAnalysisJobIdempotencyKey(
  payload: Pick<
    SlackAnalysisJobPayload,
    "workspace_id" | "slack_channel_id" | "message_ts"
  >,
) {
  return [
    payload.workspace_id,
    payload.slack_channel_id,
    payload.message_ts,
  ].join(":");
}

export function buildSlackAnalysisJobPayload({
  payload,
  prefilterResult,
  receivedAt,
}: {
  payload: SlackEventCallbackPayload;
  prefilterResult: Extract<SlackPrefilterResult, { accepted: true }>;
  receivedAt: string;
}): SlackAnalysisJobPayload {
  const event = payload.event;

  if (!event?.channel || !event.user || !event.ts || !event.text) {
    throw new Error("Cannot enqueue Slack event with missing message fields.");
  }

  return {
    workspace_id: prefilterResult.workspaceId,
    slack_channel_id: event.channel,
    slack_user_id: event.user,
    message_ts: event.ts,
    thread_ts: event.thread_ts ?? null,
    text: event.text,
    received_at: receivedAt,
  };
}

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

export type SlackEventQueueSupabaseClient = {
  rpc(
    functionName: "enqueue_slack_event_job",
    args: {
      job_payload: SlackAnalysisJobPayload;
      p_idempotency_key: string;
    },
  ): Promise<RpcResult>;
};

export async function enqueueSlackAnalysisJob({
  jobPayload,
  supabase,
}: {
  jobPayload: SlackAnalysisJobPayload;
  supabase?: SlackEventQueueSupabaseClient;
}) {
  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as SlackEventQueueSupabaseClient);
  const idempotencyKey = getSlackAnalysisJobIdempotencyKey(jobPayload);

  const { data, error } = await client.rpc("enqueue_slack_event_job", {
    job_payload: jobPayload,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to enqueue Slack analysis job.");
  }

  const messageId =
    Array.isArray(data) && data.length > 0 && typeof data[0] === "object"
      ? (data[0] as { message_id?: unknown }).message_id
      : data;

  console.info("slack_event_queue.enqueued", {
    queue: SLACK_ANALYSIS_QUEUE_NAME,
    idempotencyKey,
    messageId,
  });

  return {
    idempotencyKey,
    messageId,
  };
}
