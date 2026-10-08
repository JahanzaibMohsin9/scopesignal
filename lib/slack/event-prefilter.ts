import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  recordSlackEventAccepted,
  recordSlackEventSkipped,
} from "@/lib/slack/event-metrics";

const MIN_MESSAGE_WORDS = 5;

const LOW_SIGNAL_MESSAGES = new Set([
  "thanks",
  "thank you",
  "ok",
  "okay",
  "sounds good",
  "sounds great",
  "looks good",
  "got it",
  "done",
  "yes",
  "no",
  "yep",
  "nope",
  "sure",
  "great",
  "perfect",
  "awesome",
]);

export type SlackMessageEvent = {
  type?: string;
  subtype?: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  app_id?: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
};

export type SlackEventCallbackPayload = {
  type: "event_callback";
  team_id?: string;
  event_id?: string;
  event?: SlackMessageEvent;
};

export type SlackPrefilterResult =
  | {
      accepted: true;
      eventId: string;
      workspaceId: string;
      channelId: string;
      clientContactId: string;
    }
  | {
      accepted: false;
      eventId: string;
      reason: SlackSkipReason;
    };

export type SlackSkipReason =
  | "missing_event"
  | "unsupported_event_type"
  | "bot_message_subtype"
  | "app_generated_message"
  | "missing_team"
  | "workspace_not_connected"
  | "missing_channel"
  | "untracked_channel"
  | "missing_user"
  | "unknown_client_contact"
  | "inactive_client_contact"
  | "message_too_short"
  | "low_signal_message";

type WorkspaceLookup = {
  id: string;
  slack_bot_user_id: string | null;
};

type QueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type QueryBuilder<T> = {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: string): QueryBuilder<T>;
  maybeSingle<Result = T>(): Promise<QueryResult<Result>>;
};

export type SlackPrefilterSupabaseClient = {
  from(table: string): QueryBuilder<unknown>;
};

function getEventId(payload: SlackEventCallbackPayload): string {
  return payload.event_id ?? payload.event?.ts ?? "unknown";
}

function normalizeMessage(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function countWords(text: string): number {
  if (!text) {
    return 0;
  }

  return text.split(" ").filter(Boolean).length;
}

function isLowSignalMessage(normalizedText: string): boolean {
  return LOW_SIGNAL_MESSAGES.has(normalizedText);
}

function logSlackEventDecision(
  result: SlackPrefilterResult,
  metadata: Record<string, string | undefined> = {},
) {
  if (result.accepted) {
    recordSlackEventAccepted();
    console.info("slack_event_prefilter.accepted", {
      eventId: result.eventId,
      workspaceId: result.workspaceId,
      channelId: result.channelId,
      clientContactId: result.clientContactId,
      ...metadata,
    });
    return;
  }

  recordSlackEventSkipped(result.reason);
  console.info("slack_event_prefilter.skipped", {
    eventId: result.eventId,
    reason: result.reason,
    ...metadata,
  });
}

function skipped(
  payload: SlackEventCallbackPayload,
  reason: SlackSkipReason,
  metadata?: Record<string, string | undefined>,
): SlackPrefilterResult {
  const result: SlackPrefilterResult = {
    accepted: false,
    eventId: getEventId(payload),
    reason,
  };

  logSlackEventDecision(result, metadata);
  return result;
}

export async function prefilterSlackMessageEvent(
  payload: SlackEventCallbackPayload,
  supabase?: SlackPrefilterSupabaseClient,
): Promise<SlackPrefilterResult> {
  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as SlackPrefilterSupabaseClient);
  const event = payload.event;

  if (!event) {
    return skipped(payload, "missing_event");
  }

  if (event.type !== "message") {
    return skipped(payload, "unsupported_event_type", {
      eventType: event.type,
    });
  }

  if (event.subtype === "bot_message") {
    return skipped(payload, "bot_message_subtype");
  }

  if (event.bot_id || event.app_id) {
    return skipped(payload, "app_generated_message");
  }

  if (!payload.team_id) {
    return skipped(payload, "missing_team");
  }

  if (!event.channel) {
    return skipped(payload, "missing_channel");
  }

  if (!event.user) {
    return skipped(payload, "missing_user");
  }

  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .select("id, slack_bot_user_id")
    .eq("slack_team_id", payload.team_id)
    .maybeSingle<WorkspaceLookup>();

  if (workspaceError || !workspace) {
    return skipped(payload, "workspace_not_connected", {
      slackTeamId: payload.team_id,
    });
  }

  if (
    workspace.slack_bot_user_id &&
    workspace.slack_bot_user_id === event.user
  ) {
    return skipped(payload, "app_generated_message", {
      workspaceId: workspace.id,
      slackUserId: event.user,
    });
  }

  const { data: channel, error: channelError } = await client
    .from("channels")
    .select("id, is_tracked")
    .eq("workspace_id", workspace.id)
    .eq("slack_channel_id", event.channel)
    .maybeSingle<{ id: string; is_tracked: boolean }>();

  if (channelError || !channel) {
    return skipped(payload, "untracked_channel", {
      workspaceId: workspace.id,
      slackChannelId: event.channel,
    });
  }

  if (!channel.is_tracked) {
    return skipped(payload, "untracked_channel", {
      workspaceId: workspace.id,
      channelId: channel.id,
    });
  }

  const { data: contact, error: contactError } = await client
    .from("client_contacts")
    .select("id, is_active")
    .eq("workspace_id", workspace.id)
    .eq("slack_user_id", event.user)
    .maybeSingle<{ id: string; is_active: boolean }>();

  if (contactError || !contact) {
    return skipped(payload, "unknown_client_contact", {
      workspaceId: workspace.id,
      slackUserId: event.user,
    });
  }

  if (!contact.is_active) {
    return skipped(payload, "inactive_client_contact", {
      workspaceId: workspace.id,
      clientContactId: contact.id,
    });
  }

  const text = event.text ?? "";
  const normalizedText = normalizeMessage(text);

  if (isLowSignalMessage(normalizedText)) {
    return skipped(payload, "low_signal_message", {
      workspaceId: workspace.id,
      channelId: channel.id,
      clientContactId: contact.id,
    });
  }

  if (countWords(normalizedText) < MIN_MESSAGE_WORDS) {
    return skipped(payload, "message_too_short", {
      workspaceId: workspace.id,
      channelId: channel.id,
      clientContactId: contact.id,
    });
  }

  const result: SlackPrefilterResult = {
    accepted: true,
    eventId: getEventId(payload),
    workspaceId: workspace.id,
    channelId: channel.id,
    clientContactId: contact.id,
  };

  logSlackEventDecision(result, {
    slackChannelId: event.channel,
    slackUserId: event.user,
    slackMessageTs: event.ts,
  });

  return result;
}
