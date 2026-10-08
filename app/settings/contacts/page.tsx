import { Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceSession } from "@/lib/auth/session";
import { ContactList } from "./contact-list";
import { UserSearchBox } from "./user-search";

export const metadata = {
  title: "Contacts – ScopeSignal",
  description:
    "Tag Slack users as client contacts to restrict scope monitoring.",
};

export default async function ContactsPage() {
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  const [workspaceResult, contactsResult] = workspaceId
    ? await Promise.all([
        adminSupabase
          .from("workspaces")
          .select("slack_team_id")
          .eq("id", workspaceId)
          .maybeSingle(),
        adminSupabase
          .from("client_contacts")
          .select(
            "id, slack_user_id, display_name, real_name, email, is_active, metadata",
          )
          .eq("workspace_id", workspaceId)
          .order("display_name", { ascending: true }),
      ])
    : [{ data: null }, { data: null }];

  const workspace = workspaceResult.data;
  const slackConnected = Boolean(workspace?.slack_team_id);

  const contacts = contactsResult.data ?? [];
  const activeCount = contacts.filter((c) => c.is_active).length;
  const taggedSlackUserIds = new Set(contacts.map((c) => c.slack_user_id));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Client Contacts"
        description="Tag specific Slack users as clients. ScopeSignal only analyses messages from tagged contacts."
      />

      {/* Why tag contacts info card */}
      <Card id="contacts-howto-card" className="border-border/60 bg-accent/5">
        <CardContent className="flex items-start gap-4 pt-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/25">
            <Users className="h-4.5 w-4.5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Why tag contacts?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              ScopeSignal only processes messages from people you designate as
              client contacts. This dramatically reduces noise and token usage —
              internal team messages are never analyzed.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats bar — only shown once Slack is connected */}
      {slackConnected && contacts.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-border/50 rounded-lg border border-border/50 bg-muted/20 text-center text-sm">
          <div className="px-4 py-3">
            <p className="text-2xl font-semibold text-foreground">
              {contacts.length}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Total Tagged</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xl font-semibold text-accent">{activeCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Active</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xl font-semibold text-foreground">
              {contacts.length - activeCount}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Paused</p>
          </div>
        </div>
      )}

      {/* Search bar — only enabled when Slack is connected */}
      {slackConnected ? (
        <UserSearchBox taggedSlackUserIds={taggedSlackUserIds} />
      ) : (
        <div className="relative max-w-sm">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Users className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <input
            id="contacts-search-disabled"
            disabled
            placeholder="Connect Slack first to search users…"
            className="w-full rounded-md border border-border/60 bg-muted/20 py-2 pl-9 pr-3 text-sm text-muted-foreground/50 cursor-not-allowed"
          />
        </div>
      )}

      {/* Tagged contacts list */}
      <Card id="contacts-list-card" className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Tagged Contacts</CardTitle>
            <CardDescription className="mt-0.5 text-sm">
              Slack users whose messages ScopeSignal actively monitors. Toggle
              &ldquo;Active&rdquo; to pause monitoring without removing the tag.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
          </Badge>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <EmptyState
              id="contacts-empty"
              icon={Users}
              title={
                slackConnected
                  ? "No contacts tagged yet"
                  : "Slack not connected"
              }
              description={
                slackConnected
                  ? "Search for a Slack user above and click the tag button to start monitoring their messages."
                  : "Connect your Slack workspace first, then come back here to tag client contacts."
              }
              action={
                slackConnected
                  ? undefined
                  : { label: "Connect Slack", href: "/settings/channels" }
              }
            />
          ) : (
            <ContactList contacts={contacts} />
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      {contacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-accent" />
            Active — messages are analysed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground/40" />
            Paused — temporarily excluded
          </span>
        </div>
      )}
    </div>
  );
}
