"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Bell,
  Radio,
  Users,
  Settings,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { label: "Proposals", href: "/proposals", icon: FileText },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Channels", href: "/settings/channels", icon: Radio },
  { label: "Contacts", href: "/settings/contacts", icon: Users },
  { label: "Sandbox", href: "/sandbox", icon: FlaskConical },
  // Settings root: exact match so sub-pages don't double-highlight here
  { label: "Settings", href: "/settings", icon: Settings, exact: true },
];

interface SidebarProps {
  accountName?: string;
  workspaceName?: string;
}

function getInitial(value?: string) {
  return value?.trim().charAt(0).toUpperCase() || "U";
}

export function Sidebar({ accountName, workspaceName }: SidebarProps) {
  const pathname = usePathname();
  const resolvedAccountName = accountName?.trim() || "Account";
  const resolvedWorkspaceName = workspaceName?.trim() || "Workspace";

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40">
          <ShieldCheck className="h-4.5 w-4.5 text-accent" strokeWidth={2} />
        </div>
        <span className="font-semibold tracking-tight text-foreground">
          ScopeSignal
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Menu
        </p>
        {navItems.map(({ label, href, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href || (href === "/dashboard" && pathname === "/")
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-colors",
                  active
                    ? "text-accent"
                    : "text-muted-foreground/70 group-hover:text-foreground",
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {label}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border px-4 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors cursor-pointer">
          <div className="h-8 w-8 rounded-full bg-accent/20 ring-1 ring-accent/30 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-accent">
              {getInitial(resolvedAccountName)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {resolvedAccountName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {resolvedWorkspaceName}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
