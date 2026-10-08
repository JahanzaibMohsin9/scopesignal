import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserWorkspaceProfile } from "@/lib/auth/workspace";

export const getWorkspaceSession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      accountName: undefined,
      user: null,
      workspaceId: null,
      workspaceName: undefined,
    };
  }

  const metadataFullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : undefined;

  const profile = await ensureUserWorkspaceProfile({
    user,
    fullName: metadataFullName,
  });

  return {
    accountName: profile.accountName,
    user,
    workspaceId: profile.workspaceId,
    workspaceName: profile.workspaceName,
  };
});
