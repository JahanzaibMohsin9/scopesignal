"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserWorkspace } from "@/lib/auth/workspace";

export async function updateWorkspaceNameAction(
  workspaceName: string,
): Promise<{ success?: string; error?: string; workspaceName?: string }> {
  const trimmedWorkspaceName = workspaceName.trim();

  if (trimmedWorkspaceName.length < 2) {
    return {
      error: "Workspace name must be at least 2 characters long.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update workspace settings." };
  }

  const workspaceId = await ensureUserWorkspace({ user });
  const { error } = await supabase
    .from("workspaces")
    .update({ name: trimmedWorkspaceName })
    .eq("id", workspaceId);

  if (error) {
    return {
      error:
        error.message ??
        "You do not have permission to update workspace settings.",
    };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return {
    success: "Workspace name updated.",
    workspaceName: trimmedWorkspaceName,
  };
}

export async function updateEmailAlertsAction(
  emailAlertsEnabled: boolean,
): Promise<{ success?: string; error?: string; emailAlertsEnabled?: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update notifications." };
  }

  const workspaceId = await ensureUserWorkspace({ user });
  const { error } = await supabase
    .from("workspaces")
    .update({ email_alerts_enabled: emailAlertsEnabled })
    .eq("id", workspaceId);

  if (error) {
    return {
      error:
        error.message ??
        "You do not have permission to update workspace notifications.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");

  return {
    success: emailAlertsEnabled
      ? "Email alerts are enabled."
      : "Email alerts are disabled.",
    emailAlertsEnabled,
  };
}
