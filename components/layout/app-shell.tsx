"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RoutePreloader } from "@/components/layout/route-preloader";
import type { TopbarAlertItem } from "@/components/layout/topbar";
import { ThemeProvider } from "@/components/theme/theme-provider";

interface AppShellProps {
  children: ReactNode;
  accountName?: string;
  recentAlerts?: TopbarAlertItem[];
  workspaceName?: string;
}

export function AppShell({
  children,
  accountName,
  recentAlerts,
  workspaceName,
}: AppShellProps) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/sandbox" ||
    pathname === "/privacy" ||
    pathname === "/terms";

  return (
    <ThemeProvider>
      {isAuthRoute || isPublicRoute ? (
        <>{children}</>
      ) : (
        <div className="flex h-screen overflow-hidden bg-background">
          <RoutePreloader />
          <Sidebar accountName={accountName} workspaceName={workspaceName} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar recentAlerts={recentAlerts} />
            <main id="main-content" className="flex-1 overflow-y-auto px-6 py-6">
              {children}
            </main>
          </div>
        </div>
      )}
    </ThemeProvider>
  );
}
