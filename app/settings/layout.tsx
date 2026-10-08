import Link from "next/link";
import {
  Settings,
  Radio,
  Users,
  Key,
  MessageSquare,
  TicketCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const settingsTabs: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  disabled?: boolean;
}> = [
  {
    href: "/settings",
    label: "General",
    icon: Settings,
    exact: true,
  },
  {
    href: "/settings/channels",
    label: "Channels",
    icon: Radio,
  },
  {
    href: "/settings/contacts",
    label: "Contacts",
    icon: Users,
  },
  {
    href: "/settings/feedback",
    label: "Feedback",
    icon: MessageSquare,
  },
  {
    href: "/settings/byok",
    label: "API Keys",
    icon: Key,
  },
  {
    href: "/settings/license",
    label: "License",
    icon: TicketCheck,
  },
];

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="space-y-6">
      {/* Settings nav tabs */}
      <div className="flex items-center gap-1 border-b border-border/60 pb-0">
        {settingsTabs.map(({ href, label, icon: Icon, disabled }) => (
          <Link
            key={href}
            href={disabled ? "#" : href}
            className={cn(
              "group flex items-center gap-2 border-b-2 border-transparent px-4 pb-3 text-sm font-medium transition-colors",
              disabled
                ? "pointer-events-none cursor-not-allowed text-muted-foreground/40"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-disabled={disabled}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
