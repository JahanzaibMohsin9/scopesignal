import { Settings, Bell, Key, Moon, Gauge } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { getWorkspaceSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUsagePercent } from "@/lib/usage/quota";
import { EmailNotificationsForm } from "./email-notifications-form";
import { WorkspaceSettingsForm } from "./workspace-settings-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata = {
  title: "Settings - ScopeSignal",
  description: "Configure your ScopeSignal workspace settings.",
};

function formatTier(value: string | null | undefined) {
  if (value === "ltd") return "Lifetime";
  if (value === "pro") return "Pro";
  if (value === "enterprise") return "Enterprise";
  return "Free";
}

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

export default async function SettingsPage() {
  const { workspaceId, workspaceName } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();
  const currentMonthStart = getCurrentMonthStart();

  const [workspaceResult, usageResult] = workspaceId
    ? await Promise.all([
        adminSupabase
          .from("workspaces")
          .select(
            "name, tier, allocated_monthly_events, managed_usage_enabled, openai_api_key_status, email_alerts_enabled",
          )
          .eq("id", workspaceId)
          .maybeSingle(),
        adminSupabase
          .from("monthly_usage")
          .select(
            "managed_classification_count, byok_classification_count, prompt_tokens, completion_tokens, total_tokens",
          )
          .eq("workspace_id", workspaceId)
          .eq("month_start", currentMonthStart)
          .maybeSingle(),
      ])
    : [
        { data: null, error: null },
        { data: null, error: null },
      ];

  if (workspaceResult.error) {
    throw new Error(workspaceResult.error.message);
  }

  if (usageResult.error) {
    throw new Error(usageResult.error.message);
  }

  const workspace = workspaceResult.data;
  const usage = usageResult.data;
  const allocatedMonthlyEvents = workspace?.allocated_monthly_events ?? 0;
  const managedClassificationCount = usage?.managed_classification_count ?? 0;
  const usagePercent = getUsagePercent({
    used: managedClassificationCount,
    allocated: allocatedMonthlyEvents,
  });
  const remainingEvents = Math.max(
    allocatedMonthlyEvents - managedClassificationCount,
    0,
  );
  const managedUsageEnabled = workspace?.managed_usage_enabled ?? true;
  const hasByokKey = workspace?.openai_api_key_status === "validated";
  const hasInvalidByokKey = workspace?.openai_api_key_status === "invalid";
  const emailAlertsEnabled = workspace?.email_alerts_enabled ?? false;
  const usageTone =
    usagePercent >= 100
      ? "bg-destructive"
      : usagePercent >= 80
        ? "bg-amber-400"
        : "bg-accent";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="General Settings"
        description="Manage your workspace preferences and configuration."
      />

      {/* Workspace Info */}
      <Card id="settings-workspace-card" className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Workspace</CardTitle>
          <CardDescription>
            Your workspace details and plan information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <WorkspaceSettingsForm
              initialWorkspaceName={workspace?.name ?? workspaceName ?? ""}
            />
            <div className="space-y-1.5">
              <label
                htmlFor="settings-workspace-plan"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Plan
              </label>
              <div className="flex items-center gap-2 h-9">
                <Badge variant="default">{formatTier(workspace?.tier)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {hasByokKey
                    ? "Unlimited (BYOK)"
                    : hasInvalidByokKey
                      ? "BYOK key needs attention"
                    : managedUsageEnabled
                      ? `${allocatedMonthlyEvents} classifications / month`
                      : "Managed quota disabled"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="settings-usage-card" className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Monthly Usage</CardTitle>
          </div>
          <CardDescription>
            Managed classifications used during the current month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold text-foreground">
                {managedClassificationCount}
                <span className="text-base font-medium text-muted-foreground">
                  {" "}
                  / {allocatedMonthlyEvents}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {remainingEvents} classification
                {remainingEvents === 1 ? "" : "s"} remaining
              </p>
            </div>
            <Badge
              variant={
                hasByokKey
                  ? "success"
                  : usagePercent >= 100
                    ? "destructive"
                    : usagePercent >= 80
                      ? "warning"
                      : "secondary"
              }
            >
              {hasByokKey ? "Unlimited (BYOK)" : `${usagePercent}% used`}
            </Badge>
          </div>

          <div
            className="h-3 overflow-hidden rounded-md border border-border/60 bg-muted"
            aria-label={`${usagePercent}% of monthly classification quota used`}
            role="progressbar"
            aria-valuenow={usagePercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full ${usageTone}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">Prompt tokens</p>
              <p className="mt-1 font-medium text-foreground">
                {(usage?.prompt_tokens ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">Completion tokens</p>
              <p className="mt-1 font-medium text-foreground">
                {(usage?.completion_tokens ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">BYOK events</p>
              <p className="mt-1 font-medium text-foreground">
                {(usage?.byok_classification_count ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card id="settings-notifications-card" className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Notifications</CardTitle>
          </div>
          <CardDescription>
            Control how and when ScopeSignal notifies you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <EmailNotificationsForm
            initialEmailAlertsEnabled={emailAlertsEnabled}
          />

          {[
            {
              id: "settings-notif-quota",
              label: "Usage quota warnings",
              description:
                "Slack DMs are sent automatically when your workspace reaches 80% usage or runs out of managed quota.",
              badge: "Always On",
            },
            {
              id: "settings-notif-processing",
              label: "Document processing updates",
              description:
                "Proposal indexing progress appears live in Proposals as documents move from uploaded to indexed or failed.",
              badge: "Live in Proposals",
            },
          ].map(({ id, label, description, badge }) => (
            <div
              key={id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/10 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {description}
                </p>
              </div>
              <Badge id={id} variant="secondary" className="flex-shrink-0">
                {badge}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card id="settings-appearance-card" className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Appearance</CardTitle>
          </div>
          <CardDescription>UI theme and display preferences.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 rounded-lg border border-border/60 bg-muted/10 px-4 py-4">
            <ThemeToggle showLabel />
            <p className="text-xs text-muted-foreground">
              Your preference is saved locally on this device and updates the
              full dashboard shell instantly.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card id="settings-byok-card" className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">API Keys (BYOK)</CardTitle>
            <Badge
              variant={
                hasByokKey
                  ? "success"
                  : hasInvalidByokKey
                    ? "warning"
                    : "secondary"
              }
            >
              {hasByokKey
                ? "Configured"
                : hasInvalidByokKey
                  ? "Needs Attention"
                  : "Managed quota"}
            </Badge>
          </div>
          <CardDescription>
            Bring your own OpenAI API key for managed-quota bypass and higher
            throughput flexibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {hasByokKey
                ? "A validated BYOK key is active for this workspace."
                : hasInvalidByokKey
                  ? "The saved BYOK key was rejected during processing, so ScopeSignal fell back to the managed key."
                  : "No BYOK key is configured for this workspace."}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasByokKey
                ? "Usage is still tracked for transparency in Settings."
                : hasInvalidByokKey
                  ? "Visit API Keys to validate and save a fresh key."
                  : "Add a key from the API Keys page when you want unlimited BYOK processing."}
            </p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href="/settings/byok">Open API Keys</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

