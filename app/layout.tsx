import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import type { TopbarAlertItem } from "@/components/layout/topbar";
import { getWorkspaceSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ScopeSignal - Contract-Aware Monitoring",
  description:
    "Contract-aware client request monitoring for agencies. Protect your scope, protect your margins.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <RootLayoutContent>{children}</RootLayoutContent>;
}

async function RootLayoutContent({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const shellAccount = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();

  const { data: recentAlertsData } = shellAccount.workspaceId
    ? await adminSupabase
        .from("alerts")
        .select(
          "id, client_message, verdict, status, created_at, proposals(name, client_name)",
        )
        .eq("workspace_id", shellAccount.workspaceId)
        .order("created_at", { ascending: false })
        .limit(6)
    : { data: [] };

  const recentAlerts: TopbarAlertItem[] = (
    (recentAlertsData ?? []) as Array<{
      id: string;
      client_message: string;
      verdict: TopbarAlertItem["verdict"];
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
    }>
  ).map((alert) => {
    const proposal = Array.isArray(alert.proposals)
      ? alert.proposals[0]
      : alert.proposals;

    return {
      id: alert.id,
      clientName: proposal?.client_name ?? null,
      createdAt: alert.created_at,
      message: alert.client_message,
      proposalName: proposal?.name ?? null,
      status: alert.status,
      verdict: alert.verdict,
    };
  });

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key="scopesignal.theme";var stored=localStorage.getItem(key);var theme=(stored==="light"||stored==="dark")?stored:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme="dark";}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <AppShell
          accountName={shellAccount.accountName}
          recentAlerts={recentAlerts}
          workspaceName={shellAccount.workspaceName}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
