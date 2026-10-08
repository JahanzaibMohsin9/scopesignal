import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  KeyRound,
  MessageSquare,
  Upload,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type SetupChecklistStep = {
  id: string;
  label: string;
  href: string;
  complete: boolean;
  optional?: boolean;
  icon: typeof MessageSquare;
};

export function SetupChecklist({ steps }: { steps: SetupChecklistStep[] }) {
  const completedCount = steps.filter((step) => step.complete).length;
  const requiredSteps = steps.filter((step) => !step.optional);
  const requiredCompletedCount = requiredSteps.filter(
    (step) => step.complete,
  ).length;
  const allRequiredComplete = requiredCompletedCount === requiredSteps.length;

  return (
    <Card id="dashboard-setup-checklist" className="border-border/60">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Setup Checklist</CardTitle>
          <Badge variant={allRequiredComplete ? "success" : "secondary"}>
            {completedCount} / {steps.length} complete
          </Badge>
        </div>
        <CardDescription>
          {allRequiredComplete
            ? "Everything required for alerting is connected. Nice work."
            : "Finish these steps to move from a blank workspace to your first alert."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step) => {
          const Icon = step.icon;
          const StatusIcon = step.complete ? CheckCircle2 : Circle;

          return (
            <Link
              key={step.id}
              href={step.href}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/10 px-4 py-3 transition hover:border-accent/40 hover:bg-accent/5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <StatusIcon
                  className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                    step.complete ? "text-emerald-400" : "text-muted-foreground"
                  }`}
                />
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {step.label}
                  </p>
                  {step.optional ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Optional
                    </p>
                  ) : null}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </Link>
          );
        })}

        {allRequiredComplete ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            ScopeSignal is ready to monitor tracked Slack channels and raise
            alerts against your uploaded proposal set.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export const setupChecklistIcons = {
  slack: MessageSquare,
  channels: MessageSquare,
  contacts: Users,
  proposals: Upload,
  byok: KeyRound,
};
