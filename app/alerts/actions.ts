"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import { retrieveRelevantChunks } from "@/lib/retrieval/vector-retriever";
import { classifyScopeForAlert } from "@/lib/openai/classification-result";

type AlertStatus =
  | "open"
  | "sent_draft"
  | "false_positive"
  | "ignored"
  | "resolved";

type AlertReclassifyRow = {
  id: string;
  client_message: string;
  thread_context: string | null;
};

type ReviewAction =
  | "approved"
  | "false-positive"
  | "ignored"
  | "reclassified"
  | "reopened"
  | "resolved";

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureUserWorkspace({ user });
}

function getAlertId(formData: FormData) {
  const value = formData.get("alertId");
  return typeof value === "string" ? value.trim() : "";
}

function getResolvedAt(status: AlertStatus) {
  if (status === "open") {
    return null;
  }

  return new Date().toISOString();
}

function redirectToAlertReview(alertId: string, reviewAction: ReviewAction) {
  redirect(`/alerts/${alertId}?reviewAction=${reviewAction}`);
}

async function updateAlertStatus(
  formData: FormData,
  status: AlertStatus,
  reviewAction: ReviewAction,
): Promise<void> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    throw new Error("You must be signed in to update alerts.");
  }

  const alertId = getAlertId(formData);
  if (!alertId) {
    throw new Error("Choose an alert to update.");
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await adminSupabase
    .from("alerts")
    .update({
      status,
      resolved_at: getResolvedAt(status),
    })
    .eq("id", alertId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/alerts");
  revalidatePath(`/alerts/${alertId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
  redirectToAlertReview(alertId, reviewAction);
}

export async function resolveAlertAction(formData: FormData) {
  return updateAlertStatus(formData, "resolved", "resolved");
}

export async function approveAlertAction(formData: FormData) {
  return updateAlertStatus(formData, "sent_draft", "approved");
}

export async function markFalsePositiveAlertAction(formData: FormData) {
  return updateAlertStatus(formData, "false_positive", "false-positive");
}

export async function ignoreAlertAction(formData: FormData) {
  return updateAlertStatus(formData, "ignored", "ignored");
}

export async function reopenAlertAction(formData: FormData) {
  return updateAlertStatus(formData, "open", "reopened");
}

export async function reclassifyAlertAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    throw new Error("You must be signed in to reclassify alerts.");
  }

  const alertId = getAlertId(formData);
  if (!alertId) {
    throw new Error("Choose an alert to reclassify.");
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data, error: fetchError } = await adminSupabase
    .from("alerts")
    .select("id, client_message, thread_context")
    .eq("id", alertId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError || !data) {
    throw new Error(fetchError?.message ?? "Alert was not found.");
  }

  const alert = data as AlertReclassifyRow;
  const retrieval = await retrieveRelevantChunks({
    workspaceId,
    message: alert.client_message,
  });
  const classification = await classifyScopeForAlert({
    workspaceId,
    clientMessage: alert.client_message,
    threadContext: alert.thread_context ?? "",
    chunks: retrieval.chunks,
  });

  const { error: updateError } = await adminSupabase
    .from("alerts")
    .update({
      proposal_id: retrieval.chunks[0]?.proposalId ?? null,
      verdict: classification.output.verdict,
      confidence: classification.output.confidence,
      reason: classification.output.reason,
      matched_section: classification.output.matched_section,
      matched_chunk_ids: classification.matchedChunkIds,
      retrieval_trace: retrieval.trace,
      status: "open",
      resolved_at: null,
    })
    .eq("id", alertId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/alerts");
  revalidatePath(`/alerts/${alertId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
  redirectToAlertReview(alertId, "reclassified");
}
