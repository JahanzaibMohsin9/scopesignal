/**
 * Slack Channels Service
 *
 * Fetches all public and private channels the bot has access to via the
 * Slack Web API `conversations.list` endpoint and upserts them into the
 * `channels` table, associating each with the given workspace.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSlackToken } from "@/lib/slack/token-vault";

type SlackChannel = {
  id: string;
  name: string;
  is_private: boolean;
};

type ConversationsListResponse = {
  ok: boolean;
  error?: string;
  channels?: SlackChannel[];
  response_metadata?: {
    next_cursor?: string;
  };
};

/**
 * Paginates through `conversations.list` to return every channel (public +
 * private) visible to the bot token in a single flat array.
 */
async function fetchAllSlackChannels(
  botToken: string,
): Promise<SlackChannel[]> {
  const collected: SlackChannel[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    const res = await fetch(
      `https://slack.com/api/conversations.list?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
        // Requests are server-side; we do not want accidental caching.
        cache: "no-store",
      },
    );

    if (!res.ok) {
      throw new Error(
        `Slack API request failed with HTTP ${res.status}: ${res.statusText}`,
      );
    }

    const data: ConversationsListResponse = await res.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
    }

    for (const ch of data.channels ?? []) {
      collected.push({
        id: ch.id,
        name: ch.name,
        is_private: ch.is_private,
      });
    }

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return collected;
}

export type SyncChannelsResult = {
  synced: number;
  error?: string;
};

/**
 * Fetches all Slack channels for `workspaceId` and upserts them into the
 * `channels` table.  The Slack bot token is read from the `workspaces` record
 * and decrypted at runtime.
 *
 * Existing rows are matched on the `(workspace_id, slack_channel_id)` unique
 * constraint; `name`, `is_private`, and `last_synced_at` are updated on
 * conflict. The `is_tracked` flag is intentionally left untouched so user
 * preferences survive a re-sync.
 */
export async function syncSlackChannels(
  workspaceId: string,
): Promise<SyncChannelsResult> {
  const supabase = createSupabaseAdminClient();

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("slack_access_token_ciphertext")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsError) {
    return { synced: 0, error: wsError.message };
  }

  if (!workspace?.slack_access_token_ciphertext) {
    return {
      synced: 0,
      error: "Slack is not connected for this workspace.",
    };
  }

  let botToken: string;
  try {
    botToken = decryptSlackToken(workspace.slack_access_token_ciphertext);
  } catch {
    return { synced: 0, error: "Failed to decrypt Slack bot token." };
  }

  let channels: SlackChannel[];
  try {
    channels = await fetchAllSlackChannels(botToken);
  } catch (err) {
    return {
      synced: 0,
      error: err instanceof Error ? err.message : "Unknown Slack API error.",
    };
  }

  if (channels.length === 0) {
    return { synced: 0 };
  }

  const now = new Date().toISOString();
  const rows = channels.map((ch) => ({
    workspace_id: workspaceId,
    slack_channel_id: ch.id,
    name: ch.name,
    is_private: ch.is_private,
    last_synced_at: now,
  }));

  const { error: upsertError } = await supabase.from("channels").upsert(rows, {
    onConflict: "workspace_id,slack_channel_id",
    ignoreDuplicates: false,
  });

  if (upsertError) {
    return { synced: 0, error: upsertError.message };
  }

  return { synced: channels.length };
}
