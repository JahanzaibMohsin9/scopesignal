"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import { syncSlackChannels } from "@/lib/slack/channels";

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureUserWorkspace({ user });
}

/**
 * Server Action: trigger a full Slack channel sync for the current workspace.
 * Returns an object with success/error fields so the caller can surface feedback.
 */
export async function syncChannelsAction(): Promise<{
  success?: string;
  error?: string;
}> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to sync channels." };
  }

  const result = await syncSlackChannels(workspaceId);

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/settings/channels");
  return {
    success: `Synced ${result.synced} channel${result.synced === 1 ? "" : "s"}.`,
  };
}

/**
 * Server Action: toggle the `is_tracked` flag for a single channel.
 * Scoped to the current user's workspace — an attacker cannot toggle
 * channels from a different workspace.
 */
export async function toggleChannelTrackedAction(
  channelId: string,
  isTracked: boolean,
): Promise<{ error?: string }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to update channels." };
  }

  const adminSupabase = createSupabaseAdminClient();

  const { error } = await adminSupabase
    .from("channels")
    .update({ is_tracked: isTracked })
    .eq("id", channelId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/channels");
  return {};
}
