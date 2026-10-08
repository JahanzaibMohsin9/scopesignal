import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Slot for header-level action buttons */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader provides a consistent title / subtitle section
 * at the top of every major dashboard page.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/25">
            <Icon className="h-5 w-5 text-accent" strokeWidth={1.8} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
