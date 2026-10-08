import { Key, ShieldCheck, Gauge, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { getWorkspaceSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ByokKeyForm } from "./byok-key-form";

export const metadata = {
  title: "API Keys - ScopeSignal",
  description: "Bring your own OpenAI API key for ScopeSignal processing.",
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ByokSettingsPage() {
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  const [workspaceResult, usageResult] = workspaceId
    ? await Promise.all([
        adminSupabase
          .from("workspaces")
          .select(
            "openai_api_key_last_four, openai_api_key_status, openai_api_key_validated_at",
          )
          .eq("id", workspaceId)
          .maybeSingle(),
        adminSupabase
          .from("monthly_usage")
          .select("byok_classification_count, total_tokens")
          .eq("workspace_id", workspaceId)
          .eq(
            "month_start",
            new Date(new Date().getFullYear(), new Date().getMonth(), 1)
              .toISOString()
              .slice(0, 10),
          )
          .maybeSingle(),
      ])
    : [{ data: null, error: null }, { data: null, error: null }];

  if (workspaceResult.error) {
    throw new Error(workspaceResult.error.message);
  }

  if (usageResult.error) {
    throw new Error(usageResult.error.message);
  }

  const workspace = workspaceResult.data;
  const hasByokKey = workspace?.openai_api_key_status === "validated";
  const hasInvalidByokKey = workspace?.openai_api_key_status === "invalid";
  const keyLastFour = workspace?.openai_api_key_last_four ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Key}
        title="API Keys"
        description="Use your own OpenAI key when you want ScopeSignal processing outside the managed quota."
      />

      <Card id="byok-status-card" className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">OpenAI BYOK Status</CardTitle>
            <CardDescription className="mt-0.5 text-sm">
              ScopeSignal automatically uses a validated BYOK key for Slack
              message classification.
            </CardDescription>
          </div>
          <Badge
            variant={
              hasByokKey ? "success" : hasInvalidByokKey ? "warning" : "secondary"
            }
          >
            {hasByokKey
              ? "Unlimited (BYOK)"
              : hasInvalidByokKey
                ? "BYOK invalid"
                : "Managed quota"}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">Saved key</p>
              <p className="mt-1 font-medium text-foreground">
                {keyLastFour ? `•••• ${keyLastFour}` : "Not configured"}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">Validated</p>
              <p className="mt-1 font-medium text-foreground">
                {formatDate(workspace?.openai_api_key_validated_at)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">This month</p>
              <p className="mt-1 font-medium text-foreground">
                {(usageResult.data?.byok_classification_count ?? 0).toLocaleString()}{" "}
                BYOK events
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="byok-key-card" className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Validate And Save</CardTitle>
          </div>
          <CardDescription>
            Your key is checked with OpenAI before it becomes active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasInvalidByokKey ? (
            <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
              OpenAI rejected the saved BYOK key during background processing.
              ScopeSignal has already fallen back to the managed key so alert
              processing can continue while you validate and save a new key.
            </div>
          ) : null}
          <ByokKeyForm currentKeyLastFour={keyLastFour} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Quota Behavior</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            BYOK workspaces bypass the managed classification limit. ScopeSignal
            still logs event counts and token usage so you can see processing
            volume clearly.
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Invalid Keys</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            If OpenAI rejects a saved key during processing, ScopeSignal marks
            it invalid, falls back to the managed key path, and surfaces the
            issue here so the workspace can replace the key.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
