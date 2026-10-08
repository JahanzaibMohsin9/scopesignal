import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSlackToken } from "@/lib/slack/token-vault";
import type { SlackAnalysisJobPayload } from "@/lib/slack/event-queue";

const DEFAULT_CONTEXT_MESSAGE_COUNT = 5;
const SLACK_RATE_LIMIT_STATUS = 429;

type SlackApiMessage = {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  ts: string;
};

type SlackHistoryResponse = {
  ok: boolean;
  error?: string;
  messages?: SlackApiMessage[];
};

type SlackUserInfoResponse = {
  ok: boolean;
  error?: string;
  user?: {
    id: string;
    name?: string;
    real_name?: string;
    profile?: {
      display_name?: string;
      real_name?: string;
    };
  };
};

type SlackFetch = typeof fetch;

type WorkspaceTokenRow = {
  slack_access_token_ciphertext: string | null;
};

type SupabaseMaybeSingleResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export type SlackThreadContextSupabaseClient = {
  from(table: "workspaces"): {
    select(columns: "slack_access_token_ciphertext"): {
      eq(
        column: "id",
        value: string,
      ): {
        maybeSingle(): Promise<SupabaseMaybeSingleResult<WorkspaceTokenRow>>;
      };
    };
  };
};

export type SlackTranscriptMessage = {
  ts: string;
  timestamp: string;
  speaker: string;
  text: string;
  isTarget: boolean;
};

export type SlackThreadContext = {
  messages: SlackTranscriptMessage[];
  transcript: string;
  source: "thread" | "channel";
  targetTs: string;
  targetFound: boolean;
  warning?: string;
};

export async function getWorkspaceSlackBotToken({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: SlackThreadContextSupabaseClient;
}) {
  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as SlackThreadContextSupabaseClient);

  const { data: workspace, error } = await client
    .from("workspaces")
    .select("slack_access_token_ciphertext")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace Slack token.");
  }

  if (!workspace?.slack_access_token_ciphertext) {
    throw new Error("Slack is not connected for this workspace.");
  }

  try {
    return decryptSlackToken(workspace.slack_access_token_ciphertext);
  } catch {
    throw new Error("Failed to decrypt Slack bot token.");
  }
}

function compareSlackTs(a: string, b: string) {
  const aNum = Number(a);
  const bNum = Number(b);

  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }

  return a.localeCompare(b);
}

function formatSlackTimestamp(ts: string) {
  const seconds = Number(ts.split(".")[0]);

  if (!Number.isFinite(seconds)) {
    return ts;
  }

  return new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

function cleanSlackText(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function isHumanOrBotMessage(message: SlackApiMessage) {
  return message.type === "message" && Boolean(message.ts);
}

function slackApiUrl(
  method: "conversations.replies" | "conversations.history",
) {
  return `https://slack.com/api/${method}`;
}

async function postSlackApi<T>({
  botToken,
  method,
  body,
  fetchImpl,
}: {
  botToken: string;
  method: "conversations.replies" | "conversations.history";
  body: URLSearchParams;
  fetchImpl: SlackFetch;
}): Promise<T> {
  const response = await fetchImpl(slackApiUrl(method), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (response.status === SLACK_RATE_LIMIT_STATUS) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(
      `Slack API rate limited${retryAfter ? `; retry after ${retryAfter}s` : ""}.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Slack API request failed with HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

async function fetchConversationMessages({
  botToken,
  jobPayload,
  contextMessageCount,
  fetchImpl,
}: {
  botToken: string;
  jobPayload: SlackAnalysisJobPayload;
  contextMessageCount: number;
  fetchImpl: SlackFetch;
}) {
  const isThread = Boolean(jobPayload.thread_ts);
  const body = new URLSearchParams({
    channel: jobPayload.slack_channel_id,
    latest: jobPayload.message_ts,
    inclusive: "true",
    limit: String(contextMessageCount + 1),
  });

  if (isThread) {
    body.set("ts", jobPayload.thread_ts ?? jobPayload.message_ts);
  }

  const data = await postSlackApi<SlackHistoryResponse>({
    botToken,
    method: isThread ? "conversations.replies" : "conversations.history",
    body,
    fetchImpl,
  });

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
  }

  return {
    messages: data.messages ?? [],
    source: isThread ? ("thread" as const) : ("channel" as const),
  };
}

async function fetchSlackUserName({
  botToken,
  userId,
  fetchImpl,
}: {
  botToken: string;
  userId: string;
  fetchImpl: SlackFetch;
}) {
  const params = new URLSearchParams({ user: userId });
  const response = await fetchImpl(
    `https://slack.com/api/users.info?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (response.status === SLACK_RATE_LIMIT_STATUS) {
    return userId;
  }

  if (!response.ok) {
    return userId;
  }

  const data = (await response.json()) as SlackUserInfoResponse;
  if (!data.ok || !data.user) {
    return userId;
  }

  return (
    data.user.profile?.display_name?.trim() ||
    data.user.profile?.real_name?.trim() ||
    data.user.real_name?.trim() ||
    data.user.name?.trim() ||
    data.user.id
  );
}

async function resolveSpeakerNames({
  botToken,
  messages,
  fetchImpl,
}: {
  botToken: string;
  messages: SlackApiMessage[];
  fetchImpl: SlackFetch;
}) {
  const uniqueUserIds = Array.from(
    new Set(messages.map((message) => message.user).filter(Boolean)),
  ) as string[];
  const names = new Map<string, string>();

  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      names.set(
        userId,
        await fetchSlackUserName({ botToken, userId, fetchImpl }),
      );
    }),
  );

  return names;
}

function getSpeaker(message: SlackApiMessage, names: Map<string, string>) {
  if (message.user) {
    return names.get(message.user) ?? message.user;
  }

  return message.username ?? message.bot_id ?? "Unknown speaker";
}

export async function fetchSlackThreadContext({
  botToken,
  jobPayload,
  contextMessageCount = DEFAULT_CONTEXT_MESSAGE_COUNT,
  fetchImpl = fetch,
}: {
  botToken: string;
  jobPayload: SlackAnalysisJobPayload;
  contextMessageCount?: number;
  fetchImpl?: SlackFetch;
}): Promise<SlackThreadContext> {
  const { messages: rawMessages, source } = await fetchConversationMessages({
    botToken,
    jobPayload,
    contextMessageCount,
    fetchImpl,
  });

  const windowMessages = rawMessages
    .filter(isHumanOrBotMessage)
    .filter((message) => compareSlackTs(message.ts, jobPayload.message_ts) <= 0)
    .sort((a, b) => compareSlackTs(a.ts, b.ts))
    .slice(-1 * (contextMessageCount + 1));

  const targetFound = windowMessages.some(
    (message) => message.ts === jobPayload.message_ts,
  );

  if (!targetFound) {
    windowMessages.push({
      type: "message",
      user: jobPayload.slack_user_id,
      ts: jobPayload.message_ts,
      text: jobPayload.text,
    });
    windowMessages.sort((a, b) => compareSlackTs(a.ts, b.ts));
  }

  const names = await resolveSpeakerNames({
    botToken,
    messages: windowMessages,
    fetchImpl,
  });

  const messages = windowMessages.map((message) => ({
    ts: message.ts,
    timestamp: `${formatSlackTimestamp(message.ts)} UTC`,
    speaker: getSpeaker(message, names),
    text: cleanSlackText(message.text),
    isTarget: message.ts === jobPayload.message_ts,
  }));

  const transcript = messages
    .map((message) => {
      const marker = message.isTarget ? " (target)" : "";
      return `[${message.timestamp}] ${message.speaker}${marker}: ${message.text}`;
    })
    .join("\n");

  return {
    messages,
    transcript,
    source,
    targetTs: jobPayload.message_ts,
    targetFound,
    warning: targetFound
      ? undefined
      : "Target message was not returned by Slack; used queued payload as fallback.",
  };
}

export async function buildSlackThreadContextForJob({
  jobPayload,
  supabase,
  fetchImpl = fetch,
  contextMessageCount = DEFAULT_CONTEXT_MESSAGE_COUNT,
}: {
  jobPayload: SlackAnalysisJobPayload;
  supabase?: SlackThreadContextSupabaseClient;
  fetchImpl?: SlackFetch;
  contextMessageCount?: number;
}) {
  const botToken = await getWorkspaceSlackBotToken({
    workspaceId: jobPayload.workspace_id,
    supabase,
  });

  return fetchSlackThreadContext({
    botToken,
    jobPayload,
    fetchImpl,
    contextMessageCount,
  });
}
