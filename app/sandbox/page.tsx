import {
  BadgeCheck,
  Bell,
  FileText,
  Hash,
  Lock,
  Radio,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  sandboxAlerts,
  sandboxChannels,
  sandboxChunks,
  sandboxContacts,
  sandboxDocuments,
  sandboxProposal,
  sandboxWorkspace,
  type SandboxAlertStatus,
  type SandboxVerdict,
} from "@/lib/sandbox/demo-data";
import { SandboxSimulation } from "./sandbox-simulation";

export const metadata = {
  title: "Sandbox - ScopeSignal",
  description:
    "Explore ScopeSignal with realistic read-only demo data, no Slack workspace or PDF upload required.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

function formatVerdict(verdict: SandboxVerdict) {
  if (verdict === "out_of_scope") return "Out of scope";
  if (verdict === "needs_review") return "Needs review";
  return "In scope";
}

function verdictVariant(verdict: SandboxVerdict) {
  if (verdict === "out_of_scope") return "destructive" as const;
  if (verdict === "needs_review") return "warning" as const;
  return "success" as const;
}

function formatStatus(status: SandboxAlertStatus) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusVariant(status: SandboxAlertStatus) {
  if (status === "open") return "info" as const;
  if (status === "resolved" || status === "sent_draft")
    return "success" as const;
  return "secondary" as const;
}

function truncateText(value: string, maxLength = 120) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function getContactName(contactId: string) {
  return (
    sandboxContacts.find((contact) => contact.id === contactId)?.displayName ??
    "Client"
  );
}

function getChannelName(channelId: string) {
  return (
    sandboxChannels.find((channel) => channel.id === channelId)?.name ??
    "unknown-channel"
  );
}

export default function SandboxPage() {
  const outOfScopeCount = sandboxAlerts.filter(
    (alert) => alert.verdict === "out_of_scope",
  ).length;
  const needsReviewCount = sandboxAlerts.filter(
    (alert) => alert.verdict === "needs_review",
  ).length;
  const trackedChannelCount = sandboxChannels.filter(
    (channel) => channel.isTracked,
  ).length;
  const activeContactCount = sandboxContacts.filter(
    (contact) => contact.isActive,
  ).length;

  const stats = [
    {
      id: "sandbox-stat-proposals",
      label: "Indexed documents",
      value: String(sandboxDocuments.length),
      subtext: `${sandboxChunks.length} embedded chunks ready`,
      icon: FileText,
      color: "text-sky-400",
      bg: "bg-sky-400/10",
    },
    {
      id: "sandbox-stat-alerts",
      label: "Demo alerts",
      value: String(sandboxAlerts.length),
      subtext: `${outOfScopeCount} out of scope, ${needsReviewCount} needs review`,
      icon: Bell,
      color: "text-rose-400",
      bg: "bg-rose-400/10",
    },
    {
      id: "sandbox-stat-channels",
      label: "Tracked channels",
      value: String(trackedChannelCount),
      subtext: `${sandboxChannels.length} synced channels`,
      icon: Radio,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      id: "sandbox-stat-usage",
      label: "Usage this month",
      value: String(sandboxWorkspace.managedClassifications),
      subtext: `${sandboxWorkspace.totalTokens.toLocaleString()} managed tokens`,
      icon: Zap,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Sandbox"
        description="A read-only Acme Digital Agency workspace with proposals, alerts, channels, contacts, and usage already loaded."
        actions={
          <Badge variant="success" className="rounded-md">
            No Slack setup required
          </Badge>
        }
      />

      <div className="rounded-lg border border-accent/25 bg-accent/8 px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <span className="font-medium text-accent">{sandboxWorkspace.name}</span>{" "}
        is isolated from your real workspace. The simulation runs in your
        browser with pre-computed results, so demo actions never write into
        production tables.
      </div>

      <SandboxSimulation />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ id, label, value, subtext, icon: Icon, color, bg }) => (
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
        ))}
      </div>

      <Card id="sandbox-proposal" className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">{sandboxProposal.name}</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              {sandboxProposal.description}
            </CardDescription>
          </div>
          <Badge variant="default">Indexed</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Chunks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sandboxDocuments.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>
                    <p className="font-medium">{document.title}</p>
                    {document.parentDocumentId ? (
                      <p className="text-xs text-muted-foreground">
                        Addendum to master proposal
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {document.kind === "proposal" ? "Proposal" : "Addendum"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(document.effectiveDate)}
                  </TableCell>
                  <TableCell>
                    <p>{document.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(document.fileSizeBytes)}
                    </p>
                  </TableCell>
                  <TableCell>{document.chunkCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card id="sandbox-alerts" className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Pre-generated Alerts</CardTitle>
          <CardDescription>
            Three out-of-scope examples, one in-scope example, and one
            needs-review edge case.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client message</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sandboxAlerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="max-w-md">
                    <p className="font-medium">
                      {truncateText(alert.clientMessage)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(alert.createdAt)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={verdictVariant(alert.verdict)}>
                      {formatVerdict(alert.verdict)}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.round(alert.confidence * 100)}% confidence
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(alert.status)}>
                      {formatStatus(alert.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p>{getContactName(alert.contactId)}</p>
                    <p className="text-xs text-muted-foreground">
                      #{getChannelName(alert.channelId)}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {alert.matchedSection}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="sandbox-channels" className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Demo Channels</CardTitle>
              <CardDescription>
                Synced Slack channels for the sandbox workspace.
              </CardDescription>
            </div>
            <Badge variant="secondary">{sandboxChannels.length} channels</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {sandboxChannels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {channel.isPrivate ? (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Hash className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">{channel.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Synced {formatDate(channel.lastSyncedAt)}
                    </p>
                  </div>
                </div>
                <Badge variant={channel.isTracked ? "default" : "secondary"}>
                  {channel.isTracked ? "Monitoring" : "Paused"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="sandbox-contacts" className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Demo Contacts</CardTitle>
              <CardDescription>
                Client contacts whose messages are eligible for classification.
              </CardDescription>
            </div>
            <Badge variant="secondary">{activeContactCount} active</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {sandboxContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground">
                    {contact.displayName
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="font-medium">{contact.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {contact.title} - {contact.email}
                    </p>
                  </div>
                </div>
                <Badge variant={contact.isActive ? "success" : "secondary"}>
                  {contact.isActive ? "Active" : "Paused"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card id="sandbox-usage" className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Usage</CardTitle>
          <CardDescription>
            Managed AI classification activity for the sandbox billing month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 divide-y divide-border/60 rounded-md border border-border/60 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {[
              {
                label: "Plan quota",
                value: sandboxWorkspace.allocatedMonthlyEvents.toLocaleString(),
              },
              {
                label: "Classifications",
                value: sandboxWorkspace.managedClassifications.toLocaleString(),
              },
              {
                label: "Prompt tokens",
                value: sandboxWorkspace.promptTokens.toLocaleString(),
              },
              {
                label: "Completion tokens",
                value: sandboxWorkspace.completionTokens.toLocaleString(),
              },
            ].map((metric) => (
              <div key={metric.label} className="px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <BadgeCheck className="h-4 w-4 text-emerald-400" />
            Demo usage is preloaded and cannot consume real quota.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
