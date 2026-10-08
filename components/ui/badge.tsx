import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent/15 text-accent ring-1 ring-accent/30",
        destructive:
          "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
        secondary: "bg-muted text-muted-foreground ring-1 ring-border",
        success:
          "bg-emerald-400/15 text-emerald-400 ring-1 ring-emerald-400/30",
        warning: "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/30",
        info: "bg-sky-400/15 text-sky-400 ring-1 ring-sky-400/30",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
