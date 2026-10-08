"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import {
  fetchSlackWorkspaceUserById,
  fetchSlackWorkspaceUsers,
  type SlackUser,
} from "@/lib/slack/users";

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureUserWorkspace({ user });
}

/**
 * Server Action: search for Slack workspace users matching an optional query.
 * Returns all human (non-bot) members; filtering is done client-side against
 * this list for instant autocomplete — the Slack API does not support
 * server-side text search on users.list.
 */
export async function searchSlackUsersAction(query: string): Promise<{
  users?: SlackUser[];
  error?: string;
}> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { error: "You must be signed in." };

  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return { users: [] };
  }

  const result = await fetchSlackWorkspaceUsers(workspaceId, {
    query: trimmedQuery,
    limit: 20,
    maxPages: 5,
  });
  if (result.error) return { error: result.error };

  return { users: result.users };
}

/**
 * Server Action: tag a Slack user as a client contact for the current workspace.
 * Uses an upsert so calling it twice for the same user is idempotent.
 */
export async function tagContactAction(
  slackUserId: string,
): Promise<{ error?: string }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { error: "You must be signed in." };

  const userResult = await fetchSlackWorkspaceUserById(
    workspaceId,
    slackUserId,
  );
  if ("error" in userResult) return { error: userResult.error };

  const user = userResult.user;
  const adminSupabase = createSupabaseAdminClient();

  const { error } = await adminSupabase.from("client_contacts").upsert(
    {
      workspace_id: workspaceId,
      slack_user_id: user.id,
      display_name: user.display_name,
      real_name: user.real_name,
      email: user.email ?? null,
      is_active: true,
      metadata: user.avatar_url ? { avatar_url: user.avatar_url } : {},
    },
    { onConflict: "workspace_id,slack_user_id", ignoreDuplicates: false },
  );

  if (error) return { error: error.message };

  revalidatePath("/settings/contacts");
  return {};
}

/**
 * Server Action: remove (delete) a tagged contact from the workspace.
 */
export async function untagContactAction(
  contactId: string,
): Promise<{ error?: string }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { error: "You must be signed in." };

  const adminSupabase = createSupabaseAdminClient();

  const { error } = await adminSupabase
    .from("client_contacts")
    .delete()
    .eq("id", contactId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath("/settings/contacts");
  return {};
}

/**
 * Server Action: toggle the `is_active` flag for a tagged contact.
 * An inactive contact's messages are not analysed — useful for
 * temporarily pausing monitoring without losing the tag.
 */
export async function toggleContactActiveAction(
  contactId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { error: "You must be signed in." };

  const adminSupabase = createSupabaseAdminClient();

  const { error } = await adminSupabase
    .from("client_contacts")
    .update({ is_active: isActive })
    .eq("id", contactId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath("/settings/contacts");
  return {};
}
