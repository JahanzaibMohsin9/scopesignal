import { TicketCheck } from "lucide-react";
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
import { LICENSE_TIER_CONFIG } from "@/lib/license/entitlements";
import { LicenseCodeForm } from "./license-code-form";

export const metadata = {
  title: "License - ScopeSignal",
  description: "Redeem a lifetime license code for ScopeSignal.",
};

function formatTier(value: string | null | undefined) {
  return value === "ltd" ? "Lifetime" : "Not Redeemed";
}

export default async function LicenseSettingsPage() {
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  const workspaceResult = workspaceId
    ? await adminSupabase
        .from("workspaces")
        .select("tier, allocated_monthly_events")
        .eq("id", workspaceId)
        .maybeSingle()
    : { data: null, error: null };

  if (workspaceResult.error) {
    throw new Error(workspaceResult.error.message);
  }

  const workspace = workspaceResult.data;
  const isLtd = workspace?.tier === "ltd";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={TicketCheck}
        title="License Redemption"
        description="Activate a lifetime license code and apply the matching managed monthly quota to this workspace."
      />

      <Card id="license-current-plan" className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Current Entitlement</CardTitle>
            <Badge variant={isLtd ? "success" : "secondary"}>
              {formatTier(workspace?.tier)}
            </Badge>
          </div>
          <CardDescription>
            License codes are one-time redemptions and attach to the current
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground">
            {isLtd
              ? `This workspace has ${workspace.allocated_monthly_events.toLocaleString()} managed classifications per month. BYOK usage remains available for higher-volume processing.`
              : "Redeem a code to convert this workspace to a lifetime plan."}
          </p>
          <LicenseCodeForm />
        </CardContent>
      </Card>

      <Card id="license-tier-reference" className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Tier Reference</CardTitle>
          <CardDescription>
            These are the limits ScopeSignal enforces after redemption.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(LICENSE_TIER_CONFIG).map(([tier, config]) => (
              <div
                key={tier}
                className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Tier {tier}
                  </p>
                  <Badge variant="default">{config.name}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {config.summary}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
