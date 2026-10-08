"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VIEWED_ALERTS_STORAGE_KEY = "scopesignal.viewed-alert-ids";

export type TopbarAlertItem = {
  id: string;
  clientName: string | null;
  createdAt: string;
  proposalName: string | null;
  status: string;
  verdict: "in_scope" | "out_of_scope" | "needs_review";
  message: string;
};

function formatVerdict(verdict: TopbarAlertItem["verdict"]) {
  if (verdict === "out_of_scope") return "Out of scope";
  if (verdict === "needs_review") return "Needs review";
  return "In scope";
}

function verdictVariant(verdict: TopbarAlertItem["verdict"]) {
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

function truncateText(value: string, maxLength = 96) {
  const text = value.replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function getInitialViewedAlertIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(VIEWED_ALERTS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    return Array.isArray(parsedValue)
      ? parsedValue.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function Topbar({
  recentAlerts = [],
}: {
  recentAlerts?: TopbarAlertItem[];
}) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [viewedAlertIds, setViewedAlertIds] = useState(getInitialViewedAlertIds);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const unreadAlertCount = useMemo(
    () => recentAlerts.filter((alert) => !viewedAlertIds.includes(alert.id)).length,
    [recentAlerts, viewedAlertIds],
  );
  const actionableAlertCount = useMemo(
    () => recentAlerts.filter((alert) => alert.status === "open").length,
    [recentAlerts],
  );
  const unreadOpenAlertCount = useMemo(
    () =>
      recentAlerts.filter(
        (alert) => alert.status === "open" && !viewedAlertIds.includes(alert.id),
      ).length,
    [recentAlerts, viewedAlertIds],
  );

  function persistViewedAlertIds(nextViewedAlertIds: string[]) {
    setViewedAlertIds(nextViewedAlertIds);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        VIEWED_ALERTS_STORAGE_KEY,
        JSON.stringify(nextViewedAlertIds),
      );
    }
  }

  function markAlertsViewed(alertIds: string[]) {
    if (alertIds.length === 0) {
      return;
    }

    const nextViewedAlertIds = Array.from(
      new Set([...viewedAlertIds, ...alertIds]),
    );
    persistViewedAlertIds(nextViewedAlertIds);
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">
          Stay on top of scope alerts and contract changes.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Review recent flags, triage them quickly, and keep delivery aligned.
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle compact />

        <div className="relative" ref={notificationsRef}>
          <Button
            id="topbar-notifications"
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground"
            aria-label="Recent alerts"
            aria-expanded={isNotificationsOpen}
            aria-haspopup="dialog"
            onClick={() => setIsNotificationsOpen((open) => !open)}
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadAlertCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-foreground ring-2 ring-background">
                {unreadAlertCount > 9 ? "9+" : unreadAlertCount}
              </span>
            ) : null}
          </Button>

          {isNotificationsOpen ? (
            <div className="absolute right-0 top-12 z-30 w-[24rem] rounded-xl border border-border/70 bg-background p-3 shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-border/60 px-1 pb-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Recent alerts
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Latest scope flags from monitored Slack conversations.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="bg-muted/50 text-muted-foreground ring-0">
                    {actionableAlertCount} OPEN
                  </Badge>
                  <Badge
                    variant={unreadOpenAlertCount > 0 ? "default" : "secondary"}
                    className={cn(
                      "ring-0",
                      unreadOpenAlertCount > 0 ? "" : "bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {unreadAlertCount} UNREAD
                  </Badge>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {recentAlerts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center">
                    <p className="text-sm font-medium text-foreground">
                      No recent alerts
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      New scope flags will appear here after Slack messages are
                      processed.
                    </p>
                  </div>
                ) : (
                  recentAlerts.map((alert) => (
                    <Link
                      key={alert.id}
                      href={`/alerts/${alert.id}`}
                      className={cn(
                        "group block rounded-lg border px-3 py-3 transition-all duration-200",
                        viewedAlertIds.includes(alert.id)
                          ? "border-border/40 bg-transparent hover:border-border/80 hover:bg-muted/30"
                          : "border-accent/20 bg-accent/5 hover:border-accent/40 hover:bg-accent/[0.08]",
                      )}
                      onClick={() => {
                        markAlertsViewed([alert.id]);
                        setIsNotificationsOpen(false);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {alert.clientName ?? "Client"}{" "}
                            <span className="text-muted-foreground">
                              {alert.proposalName
                                ? `- ${alert.proposalName}`
                                : ""}
                            </span>
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {truncateText(alert.message)}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-2">
                          <div className="flex -space-x-1">
                            {!viewedAlertIds.includes(alert.id) ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-background" />
                            ) : null}
                          </div>
                          <Badge variant={verdictVariant(alert.verdict)}>
                            {formatVerdict(alert.verdict)}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            alert.status === "open"
                              ? "text-accent"
                              : "text-muted-foreground",
                          )}
                        >
                          {alert.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground/70">
                          {formatDate(alert.createdAt)}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => markAlertsViewed(recentAlerts.map((alert) => alert.id))}
                  disabled={unreadAlertCount === 0}
                >
                  Mark all viewed
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  asChild
                >
                  <Link href="/alerts" onClick={() => setIsNotificationsOpen(false)}>
                    View all alerts
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <form action={signOutAction}>
          <Button
            id="topbar-sign-out"
            variant="outline"
            size="sm"
            type="submit"
          >
            Log out
          </Button>
        </form>
      </div>
    </header>
  );
}
