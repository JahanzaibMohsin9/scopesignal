import Link from "next/link";
import { MessageSquare, SlidersHorizontal } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getWorkspaceSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Feedback - ScopeSignal",
  description: "Review false positive feedback from Slack triage actions.",
};

const PAGE_SIZE = 10;

const verdictFilters = [
  { label: "All", value: "all" },
  { label: "Out of scope", value: "out_of_scope" },
  { label: "Needs review", value: "needs_review" },
  { label: "In scope", value: "in_scope" },
] as const;

type VerdictFilter = (typeof verdictFilters)[number]["value"];

type FeedbackSearchParams = {
  verdict?: string;
  page?: string;
};

type FeedbackPageProps = {
  searchParams?: Promise<FeedbackSearchParams>;
};

type FeedbackAlertRow = {
  id: string;
  client_message: string;
  verdict: "in_scope" | "out_of_scope" | "needs_review";
  confidence: number | null;
  reason: string | null;
  matched_section: string | null;
  slack_channel_id: string;
  slack_message_ts: string;
  created_at: string;
  updated_at: string;
  proposals: {
    name: string | null;
    client_name: string | null;
  } | null;
};

function normalizeVerdictFilter(value: string | undefined): VerdictFilter {
  const allowed = new Set<string>(verdictFilters.map((filter) => filter.value));

  if (value && allowed.has(value)) {
    return value as VerdictFilter;
  }

  return "all";
}

function normalizePage(value: string | undefined) {
  const page = Number(value);

  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return page;
}

function formatVerdict(verdict: FeedbackAlertRow["verdict"]) {
  if (verdict === "out_of_scope") return "Out of scope";
  if (verdict === "needs_review") return "Needs review";
  return "In scope";
}

function verdictVariant(verdict: FeedbackAlertRow["verdict"]) {
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

function truncateText(value: string | null, maxLength = 140) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function feedbackHref({
  verdict,
  page,
}: {
  verdict: VerdictFilter;
  page: number;
}) {
  const params = new URLSearchParams();

  if (verdict !== "all") {
    params.set("verdict", verdict);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/settings/feedback?${query}` : "/settings/feedback";
}

export default async function FeedbackPage({
  searchParams,
}: FeedbackPageProps) {
  const params = await searchParams;
  const activeVerdict = normalizeVerdictFilter(params?.verdict);
  const currentPage = normalizePage(params?.page);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  let query = adminSupabase
    .from("alerts")
    .select(
      "id, client_message, verdict, confidence, reason, matched_section, slack_channel_id, slack_message_ts, created_at, updated_at, proposals(name, client_name)",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId ?? "")
    .eq("status", "false_positive")
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (activeVerdict !== "all") {
    query = query.eq("verdict", activeVerdict);
  }

  const { data, count, error } = workspaceId
    ? await query
    : { data: [], count: 0, error: null };

  if (error) {
    throw new Error(error.message);
  }

  const feedbackAlerts = (data ?? []) as FeedbackAlertRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageSquare}
        title="Feedback"
        description="False positives marked from Slack triage actions."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">
              False positives
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 sm:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              Filter by verdict
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {verdictFilters.map((filter) => (
                <Button
                  key={filter.value}
                  variant={
                    activeVerdict === filter.value ? "default" : "outline"
                  }
                  size="sm"
                  asChild
                >
                  <Link
                    href={feedbackHref({
                      verdict: filter.value,
                      page: 1,
                    })}
                  >
                    {filter.label}
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">False Positive Review</CardTitle>
          <CardDescription>
            Use these examples to tune pre-filters, retrieval, and prompt rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feedbackAlerts.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No false positives yet"
              description="When a teammate clicks False Positive in Slack, the alert will appear here for review."
            />
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client message</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Proposal</TableHead>
                    <TableHead>Marked</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedbackAlerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="max-w-md">
                        <p className="font-medium text-foreground">
                          {truncateText(alert.client_message)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {alert.slack_channel_id} - {alert.slack_message_ts}
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
                        <p className="font-medium">
                          {alert.proposals?.name ?? "No proposal linked"}
                        </p>
                        {alert.proposals?.client_name ? (
                          <p className="text-xs text-muted-foreground">
                            {alert.proposals.client_name}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDate(alert.updated_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/alerts/${alert.id}`}>Review</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <p>
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasPreviousPage}
                    asChild={hasPreviousPage}
                  >
                    {hasPreviousPage ? (
                      <Link
                        href={feedbackHref({
                          verdict: activeVerdict,
                          page: currentPage - 1,
                        })}
                      >
                        Previous
                      </Link>
                    ) : (
                      "Previous"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasNextPage}
                    asChild={hasNextPage}
                  >
                    {hasNextPage ? (
                      <Link
                        href={feedbackHref({
                          verdict: activeVerdict,
                          page: currentPage + 1,
                        })}
                      >
                        Next
                      </Link>
                    ) : (
                      "Next"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
