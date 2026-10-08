import { notFound } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCircle2, ChevronLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import {
  formatSlackChannelName,
  formatSlackMessageTimestamp,
} from "@/lib/slack/display";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  approveAlertAction,
  ignoreAlertAction,
  markFalsePositiveAlertAction,
  reclassifyAlertAction,
  reopenAlertAction,
  resolveAlertAction,
} from "@/app/alerts/actions";
import { ReviewActionSubmitButton } from "./review-action-submit-button";

export const metadata = {
  title: "Alert Details - ScopeSignal",
  description: "Review a ScopeSignal alert and its supporting evidence.",
};

type AlertDetailRow = {
  id: string;
  client_message: string;
  thread_context: string | null;
  verdict: "in_scope" | "out_of_scope" | "needs_review";
  confidence: number | null;
  reason: string | null;
  matched_section: string | null;
  status: string;
  slack_channel_id: string;
  slack_message_ts: string;
  created_at: string;
  proposals: {
    name: string | null;
    client_name: string | null;
  } | null;
};

type ChannelRow = {
  name: string;
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ reviewAction?: string }>;
};

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureUserWorkspace({ user });
}

function formatVerdict(verdict: AlertDetailRow["verdict"]) {
  if (verdict === "out_of_scope") return "Out of scope";
  if (verdict === "needs_review") return "Needs review";
  return "In scope";
}

function verdictVariant(verdict: AlertDetailRow["verdict"]) {
  if (verdict === "out_of_scope") return "destructive" as const;
  if (verdict === "needs_review") return "warning" as const;
  return "success" as const;
}

function formatConfidence(confidence: number | null) {
  if (typeof confidence !== "number") {
    return "Unknown";
  }

  return `${Math.round(confidence * 100)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getReviewActionMessage(reviewAction: string | undefined) {
  if (reviewAction === "resolved") return "Alert marked as resolved.";
  if (reviewAction === "approved") return "Alert approved.";
  if (reviewAction === "false-positive") {
    return "Alert marked as a false positive.";
  }
  if (reviewAction === "ignored") return "Alert ignored.";
  if (reviewAction === "reopened") return "Alert reopened for review.";
  if (reviewAction === "reclassified") {
    return "Alert reclassified with the latest contract evidence.";
  }

  return null;
}

function AlertActionForm({
  alertId,
  action,
  label,
  pendingLabel,
  variant = "outline",
}: {
  alertId: string;
  action: (formData: FormData) => Promise<void>;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="alertId" value={alertId} />
      <ReviewActionSubmitButton
        label={label}
        pendingLabel={pendingLabel}
        variant={variant}
      />
    </form>
  );
}

export default async function AlertDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const reviewActionMessage = getReviewActionMessage(
    (await searchParams)?.reviewAction,
  );
  const workspaceId = await getWorkspaceId();

  if (!workspaceId) {
    return notFound();
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data } = await adminSupabase
    .from("alerts")
    .select(
      "id, client_message, thread_context, verdict, confidence, reason, matched_section, status, slack_channel_id, slack_message_ts, created_at, proposals(name, client_name)",
    )
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const alert = data as AlertDetailRow | null;

  if (!alert) {
    return notFound();
  }

  const { data: channelData, error: channelError } = await adminSupabase
    .from("channels")
    .select("name")
    .eq("workspace_id", workspaceId)
    .eq("slack_channel_id", alert.slack_channel_id)
    .maybeSingle();

  if (channelError) {
    throw new Error(channelError.message);
  }

  const channel = channelData as ChannelRow | null;
  const channelLabel = formatSlackChannelName(channel?.name);
  const messageTimestamp = formatSlackMessageTimestamp(alert.slack_message_ts);

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 gap-1 text-muted-foreground"
        >
          <Link href="/alerts">
            <ChevronLeft className="h-4 w-4" />
            Back to Alerts
          </Link>
        </Button>
      </div>

      <PageHeader
        icon={Bell}
        title="Alert Details"
        description={`Slack message from ${channelLabel} on ${messageTimestamp}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={verdictVariant(alert.verdict)}>
              {formatVerdict(alert.verdict)}
            </Badge>
            <Badge variant="secondary">{formatStatus(alert.status)}</Badge>
          </div>
        }
      />

      {reviewActionMessage ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-300" />
          <div>
            <p className="font-medium">{reviewActionMessage}</p>
            <p className="mt-1 text-emerald-100/75">
              The review state is now {formatStatus(alert.status)}.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Client Message</CardTitle>
            <CardDescription>
              The Slack text that triggered classification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <blockquote className="border-l-2 border-accent pl-4 text-sm leading-6 text-foreground">
              {alert.client_message}
            </blockquote>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Confidence
              </p>
              <p className="mt-1 text-lg font-semibold">
                {formatConfidence(alert.confidence)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </p>
              <p className="mt-1">{formatDate(alert.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Proposal
              </p>
              <p className="mt-1">
                {alert.proposals?.name ?? "No proposal linked"}
              </p>
              {alert.proposals?.client_name ? (
                <p className="text-muted-foreground">
                  {alert.proposals.client_name}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Review Actions</CardTitle>
            <CardDescription>
              Update the alert outcome after checking the contract evidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <AlertActionForm
                alertId={alert.id}
                action={resolveAlertAction}
                label="Resolve"
                pendingLabel="Resolving"
                variant="default"
              />
              <AlertActionForm
                alertId={alert.id}
                action={approveAlertAction}
                label="Approve"
                pendingLabel="Approving"
              />
              <AlertActionForm
                alertId={alert.id}
                action={markFalsePositiveAlertAction}
                label="False Positive"
                pendingLabel="Saving"
              />
              <AlertActionForm
                alertId={alert.id}
                action={ignoreAlertAction}
                label="Ignore"
                pendingLabel="Ignoring"
              />
              <AlertActionForm
                alertId={alert.id}
                action={reopenAlertAction}
                label="Reopen"
                pendingLabel="Reopening"
                variant="secondary"
              />
              <form action={reclassifyAlertAction}>
                <input type="hidden" name="alertId" value={alert.id} />
                <ReviewActionSubmitButton
                  label="Reclassify"
                  pendingLabel="Reclassifying"
                  icon="reclassify"
                />
              </form>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">
              Matched Contract Evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-6">
              {alert.matched_section || "No matched section was recorded."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">AI Rationale</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-6">
              {alert.reason || "No rationale was recorded."}
            </p>
          </CardContent>
        </Card>

        {alert.thread_context ? (
          <Card className="border-border/60 lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Thread Context</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
                {alert.thread_context}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
