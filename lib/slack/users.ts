/**
 * Slack Users Service
 *
 * Fetches workspace members via the Slack Web API `users.list` endpoint.
 * Used by the Contacts settings page to search and tag clients without
 * pulling the entire workspace into the browser.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSlackToken } from "@/lib/slack/token-vault";

export type SlackUser = {
  id: string;
  display_name: string;
  real_name: string;
  email?: string;
  /** URL to the user's 72×72 avatar image */
  avatar_url?: string;
  is_bot: boolean;
};

type UsersListResponse = {
  ok: boolean;
  error?: string;
  members?: Array<{
    id: string;
    is_bot: boolean;
    deleted: boolean;
    profile?: {
      display_name?: string;
      real_name?: string;
      email?: string;
      image_72?: string;
    };
  }>;
  response_metadata?: {
    next_cursor?: string;
  };
};

type UsersInfoResponse = {
  ok: boolean;
  error?: string;
  user?: {
    id: string;
    is_bot: boolean;
    deleted: boolean;
    profile?: {
      display_name?: string;
      real_name?: string;
      email?: string;
      image_72?: string;
    };
  };
};

function toSlackUser(
  member: NonNullable<UsersInfoResponse["user"]>,
): SlackUser {
  const displayName =
    member.profile?.display_name?.trim() ||
    member.profile?.real_name?.trim() ||
    member.id;

  return {
    id: member.id,
    display_name: displayName,
    real_name: member.profile?.real_name?.trim() ?? displayName,
    email: member.profile?.email,
    avatar_url: member.profile?.image_72,
    is_bot: member.is_bot,
  };
}

/**
 * Paginates through `users.list` and returns matching non-deleted, non-bot
 * members. Slack does not expose text search for users, so we page on the
 * server and stop once we have enough matches.
 */
async function fetchSlackUsersPage({
  botToken,
  query,
  limit,
  maxPages,
}: {
  botToken: string;
  query: string;
  limit: number;
  maxPages: number;
}): Promise<SlackUser[]> {
  const collected: SlackUser[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  const normalizedQuery = query.trim().toLowerCase();

  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(
      `https://slack.com/api/users.list?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      throw new Error(
        `Slack API request failed with HTTP ${res.status}: ${res.statusText}`,
      );
    }

    const data: UsersListResponse = await res.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
    }

    for (const member of data.members ?? []) {
      // Skip bots, deleted accounts, and Slackbot.
      if (member.is_bot || member.deleted || member.id === "USLACKBOT") {
        continue;
      }

      const user = toSlackUser(member);
      const haystack = [user.display_name, user.real_name, user.email ?? ""]
        .join(" ")
        .toLowerCase();

      if (!normalizedQuery || haystack.includes(normalizedQuery)) {
        collected.push(user);
      }
    }

    cursor = data.response_metadata?.next_cursor || undefined;
    pageCount += 1;
  } while (cursor && collected.length < limit && pageCount < maxPages);

  return collected.slice(0, limit);
}

export type FetchSlackUsersResult =
  | { users: SlackUser[]; error?: never }
  | { users?: never; error: string };

export type FetchSlackUserResult =
  | { user: SlackUser; error?: never }
  | { user?: never; error: string };

async function getWorkspaceBotToken(
  workspaceId: string,
): Promise<{ botToken: string } | { error: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("slack_access_token_ciphertext")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsError) return { error: wsError.message };

  if (!workspace?.slack_access_token_ciphertext) {
    return { error: "Slack is not connected for this workspace." };
  }

  try {
    return {
      botToken: decryptSlackToken(workspace.slack_access_token_ciphertext),
    };
  } catch {
    return { error: "Failed to decrypt Slack bot token." };
  }
}

/**
 * Fetches all non-bot Slack workspace members for the given `workspaceId`.
 * Decrypts the Slack bot token at runtime and handles errors gracefully.
 */
export async function fetchSlackWorkspaceUsers(
  workspaceId: string,
  {
    query = "",
    limit = 20,
    maxPages = 5,
  }: { query?: string; limit?: number; maxPages?: number } = {},
): Promise<FetchSlackUsersResult> {
  const tokenResult = await getWorkspaceBotToken(workspaceId);
  if ("error" in tokenResult) return { error: tokenResult.error };

  try {
    const users = await fetchSlackUsersPage({
      botToken: tokenResult.botToken,
      query,
      limit,
      maxPages,
    });
    return { users };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unknown Slack API error.",
    };
  }
}

export async function fetchSlackWorkspaceUserById(
  workspaceId: string,
  slackUserId: string,
): Promise<FetchSlackUserResult> {
  const tokenResult = await getWorkspaceBotToken(workspaceId);
  if ("error" in tokenResult) return { error: tokenResult.error };

  const params = new URLSearchParams({ user: slackUserId });

  try {
    const res = await fetch(
      `https://slack.com/api/users.info?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${tokenResult.botToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return {
        error: `Slack API request failed with HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = (await res.json()) as UsersInfoResponse;
    if (!data.ok || !data.user) {
      return { error: `Slack API error: ${data.error ?? "unknown"}` };
    }

    if (data.user.is_bot || data.user.deleted || data.user.id === "USLACKBOT") {
      return { error: "Only active human Slack users can be tagged." };
    }

    return { user: toSlackUser(data.user) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unknown Slack API error.",
    };
  }
}
