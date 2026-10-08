"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import {
  clearWorkspaceOpenAiApiKey,
  saveWorkspaceOpenAiApiKey,
  validateOpenAiApiKey,
} from "@/lib/openai/byok";

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureUserWorkspace({ user });
}

function readApiKey(formData: FormData) {
  const value = formData.get("openai_api_key");

  return typeof value === "string" ? value.trim() : "";
}

export async function validateByokKeyAction(
  formData: FormData,
): Promise<{ success?: string; error?: string; keyLastFour?: string }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to validate an API key." };
  }

  const apiKey = readApiKey(formData);
  const validation = await validateOpenAiApiKey({ apiKey });

  if (!validation.ok) {
    return { error: validation.error };
  }

  return {
    success: `OpenAI accepted this key ending in ${validation.keyLastFour}.`,
    keyLastFour: validation.keyLastFour,
  };
}

export async function saveByokKeyAction(
  formData: FormData,
): Promise<{ success?: string; error?: string; keyLastFour?: string }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to save an API key." };
  }

  const apiKey = readApiKey(formData);
  const result = await saveWorkspaceOpenAiApiKey({ workspaceId, apiKey });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/settings");
  revalidatePath("/settings/byok");

  return {
    success: `Saved OpenAI API key ending in ${result.keyLastFour}.`,
    keyLastFour: result.keyLastFour,
  };
}

export async function clearByokKeyAction(): Promise<{
  success?: string;
  error?: string;
}> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to remove an API key." };
  }

  const result = await clearWorkspaceOpenAiApiKey({ workspaceId });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/settings");
  revalidatePath("/settings/byok");

  return { success: "Removed your workspace OpenAI API key." };
}
