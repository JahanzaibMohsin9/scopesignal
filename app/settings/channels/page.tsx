import Link from "next/link";
import { Radio, Plus, Hash, Lock } from "lucide-react";
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
import { AuthMessage } from "@/app/auth/auth-message";
import { getWorkspaceSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ChannelList } from "./channel-list";
import { SyncChannelsButton } from "./sync-button";

export const metadata = {
  title: "Channels - ScopeSignal",
  description:
    "Select which Slack channels ScopeSignal monitors for scope violations.",
};

type ChannelsPageProps = {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function ChannelsPage({
  searchParams,
}: ChannelsPageProps) {
  const params = await searchParams;
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  const [workspaceResult, channelsResult] = workspaceId
    ? await Promise.all([
        adminSupabase
          .from("workspaces")
          .select("slack_team_id, slack_team_name")
          .eq("id", workspaceId)
          .maybeSingle(),
        adminSupabase
          .from("channels")
          .select(
            "id, slack_channel_id, name, is_private, is_tracked, last_synced_at",
          )
          .eq("workspace_id", workspaceId)
          .order("is_tracked", { ascending: false })
          .order("name", { ascending: true }),
      ])
    : [{ data: null }, { data: null }];

  const workspace = workspaceResult.data;
  const slackConnected = Boolean(workspace?.slack_team_id);
  const slackTeamName = workspace?.slack_team_name ?? "Slack workspace";

  const channels = channelsResult.data ?? [];
  const trackedCount = channels.filter((ch) => ch.is_tracked).length;
  const lastSynced = channels[0]?.last_synced_at
    ? new Date(channels[0].last_synced_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-6">
      <AuthMessage searchParams={Promise.resolve(params ?? {})} />

      <PageHeader
        icon={Radio}
        title="Monitored Channels"
        description="Choose the Slack channels ScopeSignal listens to for client messages."
        actions={
          <>
            {slackConnected && <SyncChannelsButton />}
            <Button
              id="channels-connect-slack-btn"
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/api/slack/oauth/install">
                <Plus className="h-4 w-4" />
                {slackConnected ? "Reconnect Slack" : "Connect Slack"}
              </Link>
            </Button>
          </>
        }
      />

      {/* Slack connection status */}
      <Card id="channels-slack-status-card" className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Slack Workspace</CardTitle>
            <CardDescription className="mt-0.5 text-sm">
              {slackConnected
                ? `Connected to ${slackTeamName}. Sync channels to start monitoring.`
                : "Connect your Slack workspace to begin monitoring channels."}
            </CardDescription>
          </div>
          <Badge
            id="channels-slack-badge"
            variant={slackConnected ? "default" : "secondary"}
          >
            {slackConnected ? "Connected" : "Not Connected"}
          </Badge>
        </CardHeader>
        {slackConnected && (
          <CardContent>
            <div className="grid grid-cols-3 divide-x divide-border/50 rounded-lg border border-border/50 bg-muted/20 text-center text-sm">
              <div className="px-4 py-3">
                <p className="text-2xl font-semibold text-foreground">
                  {channels.length}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Total Channels
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-2xl font-semibold text-accent">
                  {trackedCount}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Monitored
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="truncate text-sm font-medium text-foreground">
                  {lastSynced ?? "-"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Last Synced
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Channel list */}
      <Card id="channels-list-card" className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Available Channels</CardTitle>
            <CardDescription className="mt-0.5 text-sm">
              Toggle monitoring on or off for each Slack channel. ScopeSignal
              only analyses messages in channels set to Monitoring.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {channels.length} channel{channels.length !== 1 ? "s" : ""}
          </Badge>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <EmptyState
              id="channels-empty"
              icon={Radio}
              title={
                slackConnected
                  ? "No channels synced yet"
                  : "Slack not connected"
              }
              description={
                slackConnected
                  ? `Click 'Sync Channels' above to fetch all public and private channels your bot has access to.`
                  : "Connect your Slack workspace first, then sync to see available channels."
              }
              action={{
                label: slackConnected ? "Sync Channels" : "Connect Slack",
                href: slackConnected ? "#" : "/api/slack/oauth/install",
              }}
            />
          ) : (
            <ChannelList channels={channels} />
          )}
        </CardContent>
      </Card>

      {/* Quick legend */}
      {channels.length > 0 && (
        <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" /> Public channel
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Private channel
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-accent" />
            Monitoring active
          </span>
        </div>
      )}
    </div>
  );
}

