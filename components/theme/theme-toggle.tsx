"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme, type AppTheme } from "./theme-provider";

type ThemeToggleProps = {
  compact?: boolean;
  showLabel?: boolean;
};

function ThemeOption({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function ThemeToggle({
  compact = false,
  showLabel = false,
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={
          resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
        title={
          resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
        onClick={toggleTheme}
      >
        {resolvedTheme === "dark" ? (
          <Sun className="h-4.5 w-4.5" />
        ) : (
          <Moon className="h-4.5 w-4.5" />
        )}
      </Button>
    );
  }

  const setResolvedTheme = (theme: AppTheme) => setTheme(theme);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {showLabel ? (
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Theme</p>
          <p className="text-xs text-muted-foreground">
            Choose the shell appearance that is easiest on your eyes.
          </p>
        </div>
      ) : null}

      <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/20 p-1">
        <ThemeOption
          label="Dark"
          active={resolvedTheme === "dark"}
          onClick={() => setResolvedTheme("dark")}
        />
        <ThemeOption
          label="Light"
          active={resolvedTheme === "light"}
          onClick={() => setResolvedTheme("light")}
        />
      </div>
    </div>
  );
}
