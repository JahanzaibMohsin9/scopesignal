import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PersistedClassificationAlert } from "@/lib/openai/classification-result";
import type { RetrievedChunk } from "@/lib/retrieval/vector-retriever";
import { getWorkspaceSlackBotToken } from "@/lib/slack/thread-context";

const SLACK_RATE_LIMIT_STATUS = 429;
const MAX_QUOTE_LENGTH = 700;
const MAX_REASON_LENGTH = 900;
const MAX_SNIPPET_LENGTH = 900;

type SlackFetch = typeof fetch;

type SupabaseSingleResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseListResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
};

type UserSelectBuilder = {
  eq(column: "workspace_id" | "id", value: string): UserSelectBuilder;
  in(column: "role", values: string[]): UserSelectBuilder;
  order(
    column: "role" | "created_at",
    options: { ascending: boolean },
  ): UserSelectBuilder;
  limit(count: number): Promise<SupabaseListResult<UserRow>>;
  maybeSingle(): Promise<SupabaseSingleResult<UserRow>>;
};

export type SlackAlertNotificationSupabaseClient = {
  from(table: "users"): {
    select(columns: "id, email, full_name, role"): UserSelectBuilder;
  };
};

type SlackLookupByEmailResponse = {
  ok: boolean;
  error?: string;
  user?: {
    id?: string;
  };
};

type SlackPostMessageResponse = {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

type SlackBlock =
  | {
      type: "header";
      text: {
        type: "plain_text";
        text: string;
      };
    }
  | {
      type: "section";
      text: {
        type: "mrkdwn";
        text: string;
      };
    }
  | {
      type: "divider";
    }
  | {
      type: "actions";
      elements: Array<{
        type: "button";
        text: {
          type: "plain_text";
          text: string;
        };
        url?: string;
        value?: string;
        style?: "primary" | "danger";
        action_id: string;
      }>;
    };

export type SlackAlertMessage = {
  text: string;
  blocks: SlackBlock[];
};

export type SlackAlertDeliveryResult =
  | {
      ok: true;
      recipientSlackUserId: string;
      channel: string | null;
      ts: string | null;
    }
  | {
      ok: false;
      reason:
        | "slack_not_connected"
        | "recipient_not_found"
        | "lookup_failed"
        | "delivery_failed"
        | "unexpected_error";
      error: string;
    };

function truncateText(value: string | null | undefined, maxLength: number) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 14).trim()}... [truncated]`;
}

function escapeMrkdwn(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatVerdict(verdict: PersistedClassificationAlert["verdict"]) {
  if (verdict === "out_of_scope") {
    return "OUT OF SCOPE";
  }

  if (verdict === "needs_review") {
    return "NEEDS REVIEW";
  }

  return "IN SCOPE";
}

function formatConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== "number") {
    return "unknown";
  }

  return `${Math.round(confidence * 100)}%`;
}

function getDashboardBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

export function buildDashboardAlertUrl(alertId: string | null | undefined) {
  const baseUrl = getDashboardBaseUrl();

  if (!alertId) {
    return `${baseUrl}/alerts`;
  }

  return `${baseUrl}/alerts/${encodeURIComponent(alertId)}`;
}

function selectMatchedSnippet({
  chunks,
  alert,
}: {
  chunks: RetrievedChunk[];
  alert: PersistedClassificationAlert;
}) {
  const matchedIds = new Set(alert.matched_chunk_ids);
  const matchedChunk =
    chunks.find((chunk) => matchedIds.has(chunk.id)) ?? chunks[0] ?? null;

  if (!matchedChunk) {
    return alert.matched_section || "No contract snippet was retrieved.";
  }

  const section = matchedChunk.sectionTitle
    ? `${matchedChunk.documentTitle} > ${matchedChunk.sectionTitle}`
    : matchedChunk.documentTitle;

  return `${section}: ${matchedChunk.content}`;
}

export function buildScopeAlertSlackMessage({
  alert,
  chunks,
  dashboardUrl = buildDashboardAlertUrl(alert.id),
}: {
  alert: PersistedClassificationAlert;
  chunks: RetrievedChunk[];
  dashboardUrl?: string;
}): SlackAlertMessage {
  const verdict = formatVerdict(alert.verdict);
  const confidence = formatConfidence(alert.confidence);
  const clientQuote = escapeMrkdwn(
    truncateText(alert.client_message, MAX_QUOTE_LENGTH),
  );
  const matchedSnippet = escapeMrkdwn(
    truncateText(selectMatchedSnippet({ chunks, alert }), MAX_SNIPPET_LENGTH),
  );
  const reason = escapeMrkdwn(truncateText(alert.reason, MAX_REASON_LENGTH));

  return {
    text: `ScopeSignal alert: ${verdict} (${confidence} confidence)`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "ScopeSignal Alert",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Verdict:* \`${verdict}\`\n*Confidence:* ${confidence}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Client message*\n>${clientQuote}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Matched contract snippet*\n>${matchedSnippet}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*AI rationale*\n${reason || "No rationale was returned."}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Approve Draft Reply",
            },
            value: alert.id ?? "",
            action_id: "scopesignal_alert_approve_draft_reply",
            style: "primary",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "False Positive",
            },
            value: alert.id ?? "",
            action_id: "scopesignal_alert_false_positive",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Ignore",
            },
            value: alert.id ?? "",
            action_id: "scopesignal_alert_ignore",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Alert",
            },
            url: dashboardUrl,
            action_id: "view_alert",
          },
        ],
      },
    ],
  };
}

async function getUserById({
  supabase,
  workspaceId,
  userId,
}: {
  supabase: SlackAlertNotificationSupabaseClient;
  workspaceId: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("workspace_id", workspaceId)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load assigned alert user.");
  }

  return data;
}

async function getWorkspaceOwner({
  supabase,
  workspaceId,
}: {
  supabase: SlackAlertNotificationSupabaseClient;
  workspaceId: string;
}) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])
    .order("role", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace owner.");
  }

  return data?.[0] ?? null;
}

async function resolveRecipientEmail({
  alert,
  supabase,
}: {
  alert: PersistedClassificationAlert;
  supabase: SlackAlertNotificationSupabaseClient;
}) {
  const assignedUser = alert.assigned_user_id
    ? await getUserById({
        supabase,
        workspaceId: alert.workspace_id,
        userId: alert.assigned_user_id,
      })
    : null;

  const recipient =
    assignedUser ??
    (await getWorkspaceOwner({
      supabase,
      workspaceId: alert.workspace_id,
    }));

  return recipient?.email ?? null;
}

async function lookupSlackUserByEmail({
  botToken,
  email,
  fetchImpl,
}: {
  botToken: string;
  email: string;
  fetchImpl: SlackFetch;
}) {
  const params = new URLSearchParams({ email });
  const response = await fetchImpl(
    `https://slack.com/api/users.lookupByEmail?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

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

  const data = (await response.json()) as SlackLookupByEmailResponse;

  if (!data.ok || !data.user?.id) {
    return {
      ok: false as const,
      error: data.error ?? "Slack user lookup failed.",
    };
  }

  return {
    ok: true as const,
    slackUserId: data.user.id,
  };
}

async function postSlackMessage({
  botToken,
  slackUserId,
  message,
  fetchImpl,
}: {
  botToken: string;
  slackUserId: string;
  message: SlackAlertMessage;
  fetchImpl: SlackFetch;
}) {
  const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: slackUserId,
      text: message.text,
      blocks: message.blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
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

  const data = (await response.json()) as SlackPostMessageResponse;

  if (!data.ok) {
    return {
      ok: false as const,
      error: data.error ?? "Slack message delivery failed.",
    };
  }

  return {
    ok: true as const,
    channel: data.channel ?? null,
    ts: data.ts ?? null,
  };
}

export async function sendScopeAlertSlackDm({
  alert,
  chunks,
  supabase,
  fetchImpl = fetch,
}: {
  alert: PersistedClassificationAlert;
  chunks: RetrievedChunk[];
  supabase?: SlackAlertNotificationSupabaseClient;
  fetchImpl?: SlackFetch;
}): Promise<SlackAlertDeliveryResult> {
  try {
    const client =
      supabase ??
      (createSupabaseAdminClient() as unknown as SlackAlertNotificationSupabaseClient);
    const botToken = await getWorkspaceSlackBotToken({
      workspaceId: alert.workspace_id,
    });
    const recipientEmail = await resolveRecipientEmail({
      alert,
      supabase: client,
    });

    if (!recipientEmail) {
      const error = "No assigned user or workspace owner email was found.";
      console.warn("slack_alert_delivery.failed", {
        alertId: alert.id,
        workspaceId: alert.workspace_id,
        reason: "recipient_not_found",
        error,
      });
      return { ok: false, reason: "recipient_not_found", error };
    }

    const lookup = await lookupSlackUserByEmail({
      botToken,
      email: recipientEmail,
      fetchImpl,
    });

    if (!lookup.ok) {
      console.warn("slack_alert_delivery.failed", {
        alertId: alert.id,
        workspaceId: alert.workspace_id,
        reason: "lookup_failed",
        error: lookup.error,
      });
      return { ok: false, reason: "lookup_failed", error: lookup.error };
    }

    const delivery = await postSlackMessage({
      botToken,
      slackUserId: lookup.slackUserId,
      message: buildScopeAlertSlackMessage({ alert, chunks }),
      fetchImpl,
    });

    if (!delivery.ok) {
      console.warn("slack_alert_delivery.failed", {
        alertId: alert.id,
        workspaceId: alert.workspace_id,
        recipientSlackUserId: lookup.slackUserId,
        reason: "delivery_failed",
        error: delivery.error,
      });
      return {
        ok: false,
        reason: "delivery_failed",
        error: delivery.error,
      };
    }

    console.info("slack_alert_delivery.sent", {
      alertId: alert.id,
      workspaceId: alert.workspace_id,
      recipientSlackUserId: lookup.slackUserId,
      channel: delivery.channel,
      ts: delivery.ts,
    });

    return {
      ok: true,
      recipientSlackUserId: lookup.slackUserId,
      channel: delivery.channel,
      ts: delivery.ts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason =
      message === "Slack is not connected for this workspace."
        ? "slack_not_connected"
        : "unexpected_error";

    console.warn("slack_alert_delivery.failed", {
      alertId: alert.id,
      workspaceId: alert.workspace_id,
      reason,
      error: message,
    });

    return {
      ok: false,
      reason,
      error: message,
    };
  }
}
