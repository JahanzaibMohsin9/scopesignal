import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceSlackBotToken } from "@/lib/slack/thread-context";
import {
  getUsagePercent,
  type ManagedUsageRecord,
  type QuotaNotificationKind,
} from "@/lib/usage/quota";

const SLACK_RATE_LIMIT_STATUS = 429;

type SlackFetch = typeof fetch;

type SupabaseListResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type UserRow = {
  email: string | null;
  role: string;
};

type UserSelectBuilder = {
  eq(column: "workspace_id", value: string): UserSelectBuilder;
  in(column: "role", values: string[]): UserSelectBuilder;
  order(
    column: "role" | "created_at",
    options: { ascending: boolean },
  ): UserSelectBuilder;
  limit(count: number): Promise<SupabaseListResult<UserRow>>;
};

export type SlackQuotaNotificationSupabaseClient = {
  from(table: "users"): {
    select(columns: "email, role"): UserSelectBuilder;
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

export type SlackQuotaNotificationResult =
  | {
      ok: true;
      recipientSlackUserId: string;
      channel: string | null;
      ts: string | null;
    }
  | {
      ok: false;
      reason:
        | "no_notification_needed"
        | "slack_not_connected"
        | "recipient_not_found"
        | "lookup_failed"
        | "delivery_failed"
        | "unexpected_error";
      error: string;
    };

function getDashboardBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

function buildQuotaMessage({
  notificationKind,
  usage,
}: {
  notificationKind: QuotaNotificationKind;
  usage: ManagedUsageRecord;
}) {
  const percent = getUsagePercent({
    used: usage.managed_classification_count,
    allocated: usage.allocated_monthly_events,
  });
  const settingsUrl = `${getDashboardBaseUrl()}/settings`;
  const countText = `${usage.managed_classification_count}/${usage.allocated_monthly_events}`;

  if (notificationKind === "paused_100") {
    return {
      text: "ScopeSignal service paused: monthly quota reached.",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "ScopeSignal Service Paused",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Your workspace has used *${countText}* managed classifications this month (${percent}%). New Slack messages will be acknowledged but not classified until your quota resets or your plan changes.`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "View Usage",
              },
              url: settingsUrl,
              action_id: "view_usage",
            },
          ],
        },
      ],
    };
  }

  return {
    text: "ScopeSignal quota warning: 80% of monthly usage reached.",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "ScopeSignal Quota Warning",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Your workspace has used *${countText}* managed classifications this month (${percent}%). ScopeSignal will pause managed classifications once the monthly limit is reached.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Usage",
            },
            url: settingsUrl,
            action_id: "view_usage",
          },
        ],
      },
    ],
  };
}

async function getWorkspaceOwnerEmail({
  supabase,
  workspaceId,
}: {
  supabase: SlackQuotaNotificationSupabaseClient;
  workspaceId: string;
}) {
  const { data, error } = await supabase
    .from("users")
    .select("email, role")
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])
    .order("role", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace owner.");
  }

  return data?.[0]?.email ?? null;
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
  message: ReturnType<typeof buildQuotaMessage>;
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

export async function sendQuotaThresholdSlackDm({
  usage,
  supabase,
  fetchImpl = fetch,
}: {
  usage: ManagedUsageRecord;
  supabase?: SlackQuotaNotificationSupabaseClient;
  fetchImpl?: SlackFetch;
}): Promise<SlackQuotaNotificationResult> {
  if (!usage.notification_to_send) {
    return {
      ok: false,
      reason: "no_notification_needed",
      error: "No quota threshold notification is due.",
    };
  }

  try {
    const client =
      supabase ??
      (createSupabaseAdminClient() as unknown as SlackQuotaNotificationSupabaseClient);
    const botToken = await getWorkspaceSlackBotToken({
      workspaceId: usage.workspace_id,
    });
    const recipientEmail = await getWorkspaceOwnerEmail({
      supabase: client,
      workspaceId: usage.workspace_id,
    });

    if (!recipientEmail) {
      const error = "No workspace owner email was found.";
      console.warn("slack_quota_delivery.failed", {
        workspaceId: usage.workspace_id,
        notificationKind: usage.notification_to_send,
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
      console.warn("slack_quota_delivery.failed", {
        workspaceId: usage.workspace_id,
        notificationKind: usage.notification_to_send,
        reason: "lookup_failed",
        error: lookup.error,
      });
      return { ok: false, reason: "lookup_failed", error: lookup.error };
    }

    const delivery = await postSlackMessage({
      botToken,
      slackUserId: lookup.slackUserId,
      message: buildQuotaMessage({
        notificationKind: usage.notification_to_send,
        usage,
      }),
      fetchImpl,
    });

    if (!delivery.ok) {
      console.warn("slack_quota_delivery.failed", {
        workspaceId: usage.workspace_id,
        notificationKind: usage.notification_to_send,
        recipientSlackUserId: lookup.slackUserId,
        reason: "delivery_failed",
        error: delivery.error,
      });
      return { ok: false, reason: "delivery_failed", error: delivery.error };
    }

    console.info("slack_quota_delivery.sent", {
      workspaceId: usage.workspace_id,
      notificationKind: usage.notification_to_send,
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

    console.warn("slack_quota_delivery.failed", {
      workspaceId: usage.workspace_id,
      notificationKind: usage.notification_to_send,
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
