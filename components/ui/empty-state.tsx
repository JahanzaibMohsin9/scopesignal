import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional CTA */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  id?: string;
}

/**
 * EmptyState is displayed when a data list has zero items.
 * Designed to be consistent across /proposals, /alerts, /settings/*.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  id,
}: EmptyStateProps) {
  return (
    <div
      id={id}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-card/30 py-20 text-center backdrop-blur-md motion-safe:animate-[empty-state-rise_450ms_ease-out]"
    >
      {/* Icon blob */}
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/20 motion-safe:animate-[empty-state-pop_520ms_ease-out]">
        <Icon className="h-7 w-7 text-accent/70" strokeWidth={1.5} />
      </div>

      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      {action && (
        <div className="mt-6">
          {action.href ? (
            <Button id={`${id}-cta`} asChild size="sm">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button id={`${id}-cta`} size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
