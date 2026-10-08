import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type WorkspaceProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  workspace_id: string | null;
  workspace: { name: string | null } | null;
};

type EnsureWorkspaceProfileRow = {
  account_name: string | null;
  workspace_id: string;
  workspace_name: string | null;
};

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type WorkspaceSupabaseClient = ReturnType<typeof createSupabaseAdminClient> & {
  rpc(
    functionName: "ensure_user_workspace_profile",
    args: {
      p_user_id: string;
      p_email: string;
      p_full_name: string;
      p_workspace_name: string;
    },
  ): Promise<RpcResult<EnsureWorkspaceProfileRow[]>>;
};

function displayNameFromEmail(email: string) {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function ensureUserWorkspace({
  user,
  fullName,
  workspaceName,
}: {
  user: User;
  fullName?: string;
  workspaceName?: string;
}) {
  const profile = await ensureUserWorkspaceProfile({
    user,
    fullName,
    workspaceName,
  });

  return profile.workspaceId;
}

export async function ensureUserWorkspaceProfile({
  user,
  fullName,
  workspaceName,
}: {
  user: User;
  fullName?: string;
  workspaceName?: string;
}) {
  if (!user.email) {
    throw new Error("Cannot create a workspace for a user without an email.");
  }

  const supabase = createSupabaseAdminClient() as WorkspaceSupabaseClient;

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("users")
    .select("id, email, full_name, workspace_id, workspace:workspaces(name)")
    .eq("id", user.id)
    .maybeSingle<WorkspaceProfileRow>();

  if (existingProfileError) {
    throw existingProfileError;
  }

  if (existingProfile?.workspace_id) {
    return {
      accountName:
        existingProfile.email ||
        user.email ||
        existingProfile.full_name ||
        fullName,
      workspaceId: existingProfile.workspace_id,
      workspaceName: existingProfile.workspace?.name ?? workspaceName,
    };
  }

  const resolvedFullName =
    fullName?.trim() ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "") ||
    displayNameFromEmail(user.email);
  const resolvedWorkspaceName =
    workspaceName?.trim() ||
    (typeof user.user_metadata?.workspace_name === "string"
      ? user.user_metadata.workspace_name
      : "") ||
    `${resolvedFullName}'s Workspace`;
  const { data: profileRows, error: profileError } = await supabase.rpc(
    "ensure_user_workspace_profile",
    {
      p_user_id: user.id,
      p_email: user.email,
      p_full_name: resolvedFullName,
      p_workspace_name: resolvedWorkspaceName,
    },
  );

  if (profileError) {
    throw profileError;
  }

  const profile = profileRows?.[0];

  if (!profile?.workspace_id) {
    throw new Error("Workspace profile was not returned.");
  }

  return {
    accountName: profile.account_name ?? user.email ?? resolvedFullName,
    workspaceId: profile.workspace_id,
    workspaceName: profile.workspace_name ?? resolvedWorkspaceName,
  };
}
