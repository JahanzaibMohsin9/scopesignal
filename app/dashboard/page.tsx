import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck,
  FileText,
  Bell,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import {
  SetupChecklist,
  setupChecklistIcons,
} from "@/app/dashboard/setup-checklist";
import { getWorkspaceSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AlertRow = {
  id: string;
  client_message: string;
  verdict: "in_scope" | "out_of_scope" | "needs_review";
  confidence: number | null;
  status: string;
  created_at: string;
  proposals:
    | {
        name: string | null;
        client_name: string | null;
      }
    | {
        name: string | null;
        client_name: string | null;
      }[]
    | null;
};

type DocumentRow = {
  status: string;
  kind: "proposal" | "addendum";
};

function getProposal(alert: AlertRow) {
  return Array.isArray(alert.proposals) ? alert.proposals[0] : alert.proposals;
}

function formatVerdict(verdict: AlertRow["verdict"]) {
  if (verdict === "out_of_scope") return "Out of scope";
  if (verdict === "needs_review") return "Needs review";
  return "In scope";
}

function verdictVariant(verdict: AlertRow["verdict"]) {
  if (verdict === "out_of_scope") return "destructive" as const;
  if (verdict === "needs_review") return "warning" as const;
  return "success" as const;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function truncateText(value: string, maxLength = 120) {
  const text = value.replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function getMonthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function getAccuracyLabel(alerts: AlertRow[]) {
  const reviewedAlerts = alerts.filter((alert) =>
    ["sent_draft", "ignored", "resolved", "false_positive"].includes(
      alert.status,
    ),
  );

  if (reviewedAlerts.length === 0) {
    return {
      value: "Pending",
      subtext: "Review alerts to train accuracy",
    };
  }

  const falsePositiveCount = reviewedAlerts.filter(
    (alert) => alert.status === "false_positive",
  ).length;
  const accuracy = Math.round(
    ((reviewedAlerts.length - falsePositiveCount) / reviewedAlerts.length) *
      100,
  );

  return {
    value: `${accuracy}%`,
    subtext: `${reviewedAlerts.length} reviewed alert${reviewedAlerts.length === 1 ? "" : "s"}`,
  };
}

export default async function DashboardPage() {
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  const [
    documentsResult,
    alertsResult,
    workspaceResult,
    trackedChannelsResult,
    contactsResult,
  ] = workspaceId
    ? await Promise.all([
        adminSupabase
          .from("documents")
          .select("status, kind")
          .eq("workspace_id", workspaceId)
          .is("deleted_at", null),
        adminSupabase
          .from("alerts")
          .select(
            "id, client_message, verdict, confidence, status, created_at, proposals(name, client_name)",
          )
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(100),
        adminSupabase
          .from("workspaces")
          .select("slack_team_id, openai_api_key_status")
          .eq("id", workspaceId)
          .maybeSingle(),
        adminSupabase
          .from("channels")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("is_tracked", true),
        adminSupabase
          .from("client_contacts")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("is_active", true),
      ])
    : [
        { data: [] as DocumentRow[], error: null },
        { data: [] as AlertRow[], error: null },
        { data: null, error: null },
        { data: [] as { id: string }[], error: null },
        { data: [] as { id: string }[], error: null },
      ];

  if (documentsResult.error) {
    throw new Error(documentsResult.error.message);
  }

  if (alertsResult.error) {
    throw new Error(alertsResult.error.message);
  }
  if (workspaceResult.error) {
    throw new Error(workspaceResult.error.message);
  }
  if (trackedChannelsResult.error) {
    throw new Error(trackedChannelsResult.error.message);
  }
  if (contactsResult.error) {
    throw new Error(contactsResult.error.message);
  }

  const documents = (documentsResult.data ?? []) as DocumentRow[];
  const alerts = (alertsResult.data ?? []) as unknown as AlertRow[];
  const workspace = workspaceResult.data;
  const trackedChannelCount = trackedChannelsResult.data?.length ?? 0;
  const activeContactCount = contactsResult.data?.length ?? 0;
  const recentAlerts = alerts.slice(0, 5);
  const indexedProposals = documents.filter(
    (document) => document.kind === "proposal" && document.status === "indexed",
  ).length;
  const activeProposals = documents.filter(
    (document) => document.kind === "proposal",
  ).length;
  const alertsThisMonth = alerts.filter(
    (alert) => alert.created_at >= getMonthStartIso(),
  ).length;
  const openAlerts = alerts.filter((alert) => alert.status === "open").length;
  const resolvedAlerts = alerts.filter(
    (alert) => alert.status === "resolved",
  ).length;
  const accuracy = getAccuracyLabel(alerts);
  const checklistSteps = [
    {
      id: "connect-slack",
      label: "Connect your Slack workspace",
      href: "/settings/channels",
      complete: Boolean(workspace?.slack_team_id),
      icon: setupChecklistIcons.slack,
    },
    {
      id: "select-channels",
      label: "Select channels to monitor",
      href: "/settings/channels",
      complete: trackedChannelCount > 0,
      icon: setupChecklistIcons.channels,
    },
    {
      id: "tag-client-contact",
      label: "Tag at least one client contact",
      href: "/settings/contacts",
      complete: activeContactCount > 0,
      icon: setupChecklistIcons.contacts,
    },
    {
      id: "upload-proposal",
      label: "Upload your first proposal",
      href: "/proposals",
      complete: activeProposals > 0,
      icon: setupChecklistIcons.proposals,
    },
    {
      id: "add-byok-key",
      label: "Add your OpenAI API key for unlimited use",
      href: "/settings/byok",
      complete: workspace?.openai_api_key_status === "validated",
      optional: true,
      icon: setupChecklistIcons.byok,
    },
  ];
  const allRequiredChecklistStepsComplete = checklistSteps
    .filter((step) => !step.optional)
    .every((step) => step.complete);

  const statCards = [
    {
      id: "stat-proposals",
      label: "Active Proposals",
      value: String(activeProposals),
      subtext:
        indexedProposals === 0
          ? "No indexed proposals"
          : `${indexedProposals} indexed`,
      icon: FileText,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      id: "stat-alerts",
      label: "Alerts This Month",
      value: String(alertsThisMonth),
      subtext:
        openAlerts === 0
          ? "No open alerts"
          : `${openAlerts} open alert${openAlerts === 1 ? "" : "s"}`,
      icon: Bell,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      id: "stat-accuracy",
      label: "Classification Accuracy",
      value: accuracy.value,
      subtext: accuracy.subtext,
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
    },
    {
      id: "stat-scope",
      label: "Scope Flags Resolved",
      value: String(resolvedAlerts),
      subtext:
        alerts.length === 0
          ? "No alerts yet"
          : `${alerts.length} total alert${alerts.length === 1 ? "" : "s"}`,
      icon: ShieldCheck,
      color: "text-violet-400",
      bg: "bg-violet-400/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Welcome to ScopeSignal - your contract monitoring hub.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(
          ({ id, label, value, subtext, icon: Icon, color, bg }) => (
            <Card key={id} id={id} className="border-border/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription className="text-xs font-medium uppercase tracking-wider">
                  {label}
                </CardDescription>
                <div className={`rounded-md p-1.5 ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <SetupChecklist steps={checklistSteps} />

      <Card id="dashboard-recent-alerts" className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Alerts</CardTitle>
            <CardDescription className="mt-0.5 text-sm">
              Client requests flagged by ScopeSignal
            </CardDescription>
          </div>
          <Button
            id="dashboard-view-all-alerts"
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/alerts">
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-accent/10 p-4">
                <Bell className="h-7 w-7 text-accent/60" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No alerts yet
              </p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Once you connect Slack and upload a proposal, ScopeSignal will
                monitor client messages and surface alerts here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAlerts.map((alert) => {
                  const proposal = getProposal(alert);

                  return (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">
                        {proposal?.client_name ?? "Client"}
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">
                        <Link
                          href={`/alerts/${alert.id}`}
                          className="hover:text-foreground"
                        >
                          {truncateText(alert.client_message)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={verdictVariant(alert.verdict)}>
                          {formatVerdict(alert.verdict)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(alert.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-accent" />
        <span className="font-medium text-accent">
          {allRequiredChecklistStepsComplete
            ? "Setup complete"
            : "Ready for setup"}
        </span>
        <span className="text-muted-foreground">
          {allRequiredChecklistStepsComplete
            ? "Your workspace is configured for live monitoring. New client messages will surface here as alerts."
            : "Connect Slack, tag client contacts, and upload a proposal to begin monitoring client requests."}
        </span>
      </div>
    </div>
  );
}
