import { Resend } from "resend";
import type { PersistedClassificationAlert } from "@/lib/openai/classification-result";
import type { RetrievedChunk } from "@/lib/retrieval/vector-retriever";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildDashboardAlertUrl } from "@/lib/slack/alert-notifications";

const MAX_QUOTE_LENGTH = 700;
const MAX_REASON_LENGTH = 900;
const MAX_SNIPPET_LENGTH = 900;
const DEFAULT_FROM_EMAIL = "ScopeSignal <onboarding@resend.dev>";

type SupabaseSingleResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseListResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
};

type WorkspaceRow = {
  name: string | null;
  email_alerts_enabled: boolean;
};

type UserSelectBuilder = {
  eq(column: "workspace_id" | "id", value: string): UserSelectBuilder;
  in(column: "role", values: string[]): UserSelectBuilder;
  order(
    column: "role" | "created_at",
    options: { ascending: boolean },
  ): UserSelectBuilder;
  limit(count: number): Promise<SupabaseListResult<UserRow>>;
  maybeSingle(): Promise<SupabaseSingleResult<UserRow>>;
};

type WorkspaceSelectBuilder = {
  eq(column: "id", value: string): WorkspaceSelectBuilder;
  maybeSingle(): Promise<SupabaseSingleResult<WorkspaceRow>>;
};

export type ScopeAlertEmailNotificationSupabaseClient = {
  from(table: "users"): {
    select(columns: "id, email, full_name, role"): UserSelectBuilder;
  };
  from(table: "workspaces"): {
    select(columns: "name, email_alerts_enabled"): WorkspaceSelectBuilder;
  };
};

type ResendSendResult = {
  data?: { id?: string | null } | null;
  error?: { message?: string } | null;
};

export type ScopeAlertEmailSender = (message: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}) => Promise<ResendSendResult>;

export type ScopeAlertEmailDeliveryResult =
  | {
      ok: true;
      emailId: string | null;
      recipientEmail: string;
      trigger: "slack_failed" | "opt_in";
    }
  | {
      ok: false;
      reason:
        | "opted_out"
        | "recipient_not_found"
        | "missing_api_key"
        | "send_failed"
        | "unexpected_error";
      error: string;
    };

function truncateText(value: string | null | undefined, maxLength: number) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 14).trim()}... [truncated]`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatVerdict(verdict: PersistedClassificationAlert["verdict"]) {
  if (verdict === "out_of_scope") {
    return "Out of Scope";
  }

  if (verdict === "needs_review") {
    return "Needs Review";
  }

  return "In Scope";
}

function formatConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== "number") {
    return "Unknown";
  }

  return `${Math.round(confidence * 100)}%`;
}

function selectMatchedSnippet({
  chunks,
  alert,
}: {
  chunks: RetrievedChunk[];
  alert: PersistedClassificationAlert;
}) {
  const matchedIds = new Set(alert.matched_chunk_ids);
  const matchedChunk =
    chunks.find((chunk) => matchedIds.has(chunk.id)) ?? chunks[0] ?? null;

  if (!matchedChunk) {
    return alert.matched_section || "No contract snippet was retrieved.";
  }

  const section = matchedChunk.sectionTitle
    ? `${matchedChunk.documentTitle} > ${matchedChunk.sectionTitle}`
    : matchedChunk.documentTitle;

  return `${section}: ${matchedChunk.content}`;
}

function buildScopeAlertEmailTemplate({
  alert,
  chunks,
  workspaceName,
}: {
  alert: PersistedClassificationAlert;
  chunks: RetrievedChunk[];
  workspaceName: string | null;
}) {
  const verdict = formatVerdict(alert.verdict);
  const confidence = formatConfidence(alert.confidence);
  const dashboardUrl = buildDashboardAlertUrl(alert.id);
  const clientQuote = truncateText(alert.client_message, MAX_QUOTE_LENGTH);
  const matchedSnippet = truncateText(
    selectMatchedSnippet({ chunks, alert }),
    MAX_SNIPPET_LENGTH,
  );
  const reason =
    truncateText(alert.reason, MAX_REASON_LENGTH) ||
    "No rationale was returned.";
  const subject = `ScopeSignal alert: ${verdict} (${confidence} confidence)`;
  const intro = workspaceName
    ? `ScopeSignal flagged a client request for ${workspaceName}.`
    : "ScopeSignal flagged a client request that needs attention.";

  const text = [
    subject,
    "",
    intro,
    "",
    `Verdict: ${verdict}`,
    `Confidence: ${confidence}`,
    "",
    "Client message:",
    clientQuote,
    "",
    "Matched contract snippet:",
    matchedSnippet,
    "",
    "AI rationale:",
    reason,
    "",
    `View alert: ${dashboardUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background:#f7f7f5; padding:24px; color:#111827;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
        <div style="padding:24px 24px 12px; background:linear-gradient(135deg, #f97316 0%, #fb923c 100%); color:#ffffff;">
          <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase;">ScopeSignal Alert</p>
          <h1 style="margin:0; font-size:24px; line-height:1.2;">${escapeHtml(verdict)}</h1>
          <p style="margin:8px 0 0; font-size:14px;">Confidence: ${escapeHtml(confidence)}</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">${escapeHtml(intro)}</p>
          <div style="margin:0 0 16px; padding:16px; border:1px solid #e5e7eb; border-radius:12px; background:#fafaf9;">
            <p style="margin:0 0 8px; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#6b7280;">Client message</p>
            <p style="margin:0; font-size:14px; line-height:1.6;">${escapeHtml(clientQuote)}</p>
          </div>
          <div style="margin:0 0 16px; padding:16px; border:1px solid #e5e7eb; border-radius:12px; background:#fafaf9;">
            <p style="margin:0 0 8px; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#6b7280;">Matched contract snippet</p>
            <p style="margin:0; font-size:14px; line-height:1.6;">${escapeHtml(matchedSnippet)}</p>
          </div>
          <div style="margin:0 0 24px; padding:16px; border:1px solid #e5e7eb; border-radius:12px; background:#fafaf9;">
            <p style="margin:0 0 8px; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#6b7280;">AI rationale</p>
            <p style="margin:0; font-size:14px; line-height:1.6;">${escapeHtml(reason)}</p>
          </div>
          <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block; padding:12px 18px; border-radius:999px; background:#111827; color:#ffffff; text-decoration:none; font-weight:700;">
            View Alert
          </a>
        </div>
      </div>
    </div>
  `.trim();

  return { subject, html, text };
}

async function getUserById({
  supabase,
  workspaceId,
  userId,
}: {
  supabase: ScopeAlertEmailNotificationSupabaseClient;
  workspaceId: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("workspace_id", workspaceId)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load assigned alert user.");
  }

  return data;
}

async function getWorkspaceOwner({
  supabase,
  workspaceId,
}: {
  supabase: ScopeAlertEmailNotificationSupabaseClient;
  workspaceId: string;
}) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])
    .order("role", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace owner.");
  }

  return data?.[0] ?? null;
}

async function getWorkspaceNotificationSettings({
  supabase,
  workspaceId,
}: {
  supabase: ScopeAlertEmailNotificationSupabaseClient;
  workspaceId: string;
}) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("name, email_alerts_enabled")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message ?? "Failed to load workspace notification settings.",
    );
  }

  return data;
}

function createResendSender(apiKey: string): ScopeAlertEmailSender {
  const resend = new Resend(apiKey);

  return async ({ from, to, subject, html, text }) =>
    resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });
}

export async function sendScopeAlertEmail({
  alert,
  chunks,
  trigger,
  supabase,
  sendEmail,
}: {
  alert: PersistedClassificationAlert;
  chunks: RetrievedChunk[];
  trigger: "slack_failed" | "opt_in";
  supabase?: ScopeAlertEmailNotificationSupabaseClient;
  sendEmail?: ScopeAlertEmailSender;
}): Promise<ScopeAlertEmailDeliveryResult> {
  try {
    const client =
      supabase ??
      (createSupabaseAdminClient() as unknown as ScopeAlertEmailNotificationSupabaseClient);
    const workspace = await getWorkspaceNotificationSettings({
      supabase: client,
      workspaceId: alert.workspace_id,
    });

    if (trigger === "opt_in" && !workspace?.email_alerts_enabled) {
      return {
        ok: false,
        reason: "opted_out",
        error: "Email notifications are not enabled for this workspace.",
      };
    }

    const assignedUser = alert.assigned_user_id
      ? await getUserById({
          supabase: client,
          workspaceId: alert.workspace_id,
          userId: alert.assigned_user_id,
        })
      : null;
    const recipient =
      assignedUser ??
      (await getWorkspaceOwner({
        supabase: client,
        workspaceId: alert.workspace_id,
      }));

    if (!recipient?.email) {
      const error = "No assigned user or workspace owner email was found.";
      console.warn("email_alert_delivery.failed", {
        alertId: alert.id,
        workspaceId: alert.workspace_id,
        trigger,
        reason: "recipient_not_found",
        error,
      });
      return { ok: false, reason: "recipient_not_found", error };
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();

    if (!resendApiKey && !sendEmail) {
      const error = "RESEND_API_KEY is not configured.";
      console.warn("email_alert_delivery.failed", {
        alertId: alert.id,
        workspaceId: alert.workspace_id,
        trigger,
        reason: "missing_api_key",
        error,
      });
      return { ok: false, reason: "missing_api_key", error };
    }

    const sender = sendEmail ?? createResendSender(resendApiKey!);
    const template = buildScopeAlertEmailTemplate({
      alert,
      chunks,
      workspaceName: workspace?.name ?? null,
    });
    const result = await sender({
      from: process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
      to: [recipient.email],
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (result.error) {
      const error = result.error.message ?? "Resend failed to send the email.";
      console.warn("email_alert_delivery.failed", {
        alertId: alert.id,
        workspaceId: alert.workspace_id,
        trigger,
        recipientEmail: recipient.email,
        reason: "send_failed",
        error,
      });
      return { ok: false, reason: "send_failed", error };
    }

    console.info("email_alert_delivery.sent", {
      alertId: alert.id,
      workspaceId: alert.workspace_id,
      trigger,
      recipientEmail: recipient.email,
      emailId: result.data?.id ?? null,
    });

    return {
      ok: true,
      emailId: result.data?.id ?? null,
      recipientEmail: recipient.email,
      trigger,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.warn("email_alert_delivery.failed", {
      alertId: alert.id,
      workspaceId: alert.workspace_id,
      trigger,
      reason: "unexpected_error",
      error: message,
    });

    return {
      ok: false,
      reason: "unexpected_error",
      error: message,
    };
  }
}
