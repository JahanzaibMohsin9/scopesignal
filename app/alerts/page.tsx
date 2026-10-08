import Link from "next/link";
import { Bell, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getWorkspaceSession } from "@/lib/auth/session";
import {
  formatSlackChannelName,
  formatSlackMessageTimestamp,
} from "@/lib/slack/display";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Alerts - ScopeSignal",
  description:
    "Review and triage scope violation alerts flagged by ScopeSignal AI.",
};

type AlertRow = {
  id: string;
  client_message: string;
  verdict: "in_scope" | "out_of_scope" | "needs_review";
  confidence: number | null;
  reason: string | null;
  status: string;
  slack_channel_id: string;
  slack_message_ts: string;
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

type ChannelRow = {
  slack_channel_id: string;
  name: string;
};

type AlertsFilter = "all" | "out_of_scope" | "needs_review" | "resolved";

type AlertsPageProps = {
  searchParams?: Promise<{
    filter?: string;
  }>;
};

const FILTERS = new Set<AlertsFilter>([
  "all",
  "out_of_scope",
  "needs_review",
  "resolved",
]);

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

function formatConfidence(confidence: number | null) {
  if (typeof confidence !== "number") {
    return "Unknown";
  }

  return `${Math.round(confidence * 100)}%`;
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusVariant(status: string) {
  if (status === "open") return "info" as const;
  if (status === "resolved") return "success" as const;
  if (status === "false_positive" || status === "ignored") {
    return "secondary" as const;
  }
  return "warning" as const;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function truncateText(value: string, maxLength = 160) {
  const text = value.replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function normalizeFilter(value: string | undefined): AlertsFilter {
  return value && FILTERS.has(value as AlertsFilter)
    ? (value as AlertsFilter)
    : "all";
}

function isAlertVisible(alert: AlertRow, filter: AlertsFilter) {
  if (filter === "out_of_scope") {
    return alert.verdict === "out_of_scope";
  }

  if (filter === "needs_review") {
    return alert.verdict === "needs_review";
  }

  if (filter === "resolved") {
    return alert.status === "resolved";
  }

  return true;
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const activeFilter = normalizeFilter((await searchParams)?.filter);
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  const { data, error } = workspaceId
    ? await adminSupabase
        .from("alerts")
        .select(
          "id, client_message, verdict, confidence, reason, status, slack_channel_id, slack_message_ts, created_at, proposals(name, client_name)",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };

  if (error) {
    throw new Error(error.message);
  }

  const alerts = (data ?? []) as unknown as AlertRow[];
  const slackChannelIds = [...new Set(alerts.map((alert) => alert.slack_channel_id))];
  const { data: channelsData, error: channelsError } =
    workspaceId && slackChannelIds.length > 0
      ? await adminSupabase
          .from("channels")
          .select("slack_channel_id, name")
          .eq("workspace_id", workspaceId)
          .in("slack_channel_id", slackChannelIds)
      : { data: [], error: null };

  if (channelsError) {
    throw new Error(channelsError.message);
  }

  const channels = (channelsData ?? []) as ChannelRow[];
  const channelNameById = new Map(
    channels.map((channel) => [channel.slack_channel_id, channel.name]),
  );
  const totalCount = alerts.length;
  const outOfScopeCount = alerts.filter(
    (alert) => alert.verdict === "out_of_scope",
  ).length;
  const needsReviewCount = alerts.filter(
    (alert) => alert.verdict === "needs_review",
  ).length;
  const resolvedCount = alerts.filter(
    (alert) => alert.status === "resolved",
  ).length;
  const filteredAlerts = alerts.filter((alert) =>
    isAlertVisible(alert, activeFilter),
  );

  const filterTabs = [
    {
      id: "alerts-filter-all",
      label: "All",
      count: totalCount,
      filter: "all" as const,
      href: "/alerts",
    },
    {
      id: "alerts-filter-out-of-scope",
      label: "Out of Scope",
      count: outOfScopeCount,
      filter: "out_of_scope" as const,
      href: "/alerts?filter=out_of_scope",
    },
    {
      id: "alerts-filter-ambiguous",
      label: "Needs Review",
      count: needsReviewCount,
      filter: "needs_review" as const,
      href: "/alerts?filter=needs_review",
    },
    {
      id: "alerts-filter-resolved",
      label: "Resolved",
      count: resolvedCount,
      filter: "resolved" as const,
      href: "/alerts?filter=resolved",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bell}
        title="Alerts"
        description="Scope violation flags raised by ScopeSignal across all monitored Slack channels."
        actions={
          <Button
            id="alerts-refresh-btn"
            variant="ghost"
            size="sm"
            className="gap-2"
            asChild
          >
            <Link href="/alerts">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          {
            id: "alerts-stat-total",
            label: "Total Alerts",
            value: String(totalCount),
            color: "text-foreground",
          },
          {
            id: "alerts-stat-out-of-scope",
            label: "Out of Scope",
            value: String(outOfScopeCount),
            color: "text-destructive",
          },
          {
            id: "alerts-stat-ambiguous",
            label: "Needs Review",
            value: String(needsReviewCount),
            color: "text-amber-400",
          },
          {
            id: "alerts-stat-resolved",
            label: "Resolved",
            value: String(resolvedCount),
            color: "text-emerald-400",
          },
        ].map(({ id, label, value, color }) => (
          <Card key={id} id={id} className="border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider">
                {label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 border-b border-border/60 pb-0">
        {filterTabs.map(({ id, label, count, filter, href }) => (
          <Link
            key={id}
            id={id}
            href={href}
            className="flex items-center gap-1.5 border-b-2 border-transparent px-3 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active]:border-accent data-[active]:text-accent"
            data-active={activeFilter === filter ? true : undefined}
          >
            {label}
            <Badge variant="secondary" className="text-[10px]">
              {count}
            </Badge>
          </Link>
        ))}
      </div>

      <Card id="alerts-list-card" className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Recent Alerts</CardTitle>
          <CardDescription className="mt-0.5 text-sm">
            Flagged client messages and their AI-determined verdicts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAlerts.length === 0 ? (
            <EmptyState
              id="alerts-empty"
              icon={Bell}
              title={
                alerts.length === 0
                  ? "No alerts triggered yet"
                  : "No alerts match this filter"
              }
              description={
                alerts.length === 0
                  ? "Once you connect Slack channels and upload a proposal, ScopeSignal will surface out-of-scope requests here in real time."
                  : "Try another alert filter or refresh after new Slack messages are processed."
              }
              action={
                alerts.length === 0
                  ? { label: "Connect Slack", href: "/settings/channels" }
                  : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client message</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Proposal</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.map((alert) => {
                  const proposal = getProposal(alert);
                  const channelLabel = formatSlackChannelName(
                    channelNameById.get(alert.slack_channel_id),
                  );
                  const messageTimestamp = formatSlackMessageTimestamp(
                    alert.slack_message_ts,
                  );

                  return (
                    <TableRow key={alert.id}>
                      <TableCell className="max-w-md">
                        <p className="font-medium text-foreground">
                          {truncateText(alert.client_message)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {channelLabel} - {messageTimestamp}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant={verdictVariant(alert.verdict)}>
                            {formatVerdict(alert.verdict)}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {formatConfidence(alert.confidence)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(alert.status)}>
                          {formatStatus(alert.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {proposal?.name ?? "No proposal linked"}
                        </p>
                        {proposal?.client_name ? (
                          <p className="text-xs text-muted-foreground">
                            {proposal.client_name}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(alert.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/alerts/${alert.id}`}>Review</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
