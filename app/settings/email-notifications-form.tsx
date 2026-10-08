"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateEmailAlertsAction } from "./actions";

type EmailNotificationsFormProps = {
  initialEmailAlertsEnabled: boolean;
};

export function EmailNotificationsForm({
  initialEmailAlertsEnabled,
}: EmailNotificationsFormProps) {
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(
    initialEmailAlertsEnabled,
  );
  const [message, setMessage] = useState<{ success?: string; error?: string }>(
    {},
  );
  const [isPending, startTransition] = useTransition();

  function savePreference() {
    startTransition(async () => {
      const result = await updateEmailAlertsAction(emailAlertsEnabled);
      setMessage(result);
    });
  }

  return (
    <div className="space-y-4">
      <label
        htmlFor="settings-email-alerts-enabled"
        className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/10 px-4 py-3"
      >
        <input
          id="settings-email-alerts-enabled"
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border bg-background accent-[var(--accent)]"
          checked={emailAlertsEnabled}
          onChange={(event) => {
            setEmailAlertsEnabled(event.target.checked);
            setMessage({});
          }}
          disabled={isPending}
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Email me alert summaries
          </p>
          <p className="text-xs text-muted-foreground">
            ScopeSignal always falls back to email if Slack DM delivery fails.
            Turning this on also sends an email copy when Slack succeeds.
          </p>
        </div>
      </label>

      <div className="flex items-center gap-3">
        <Button
          id="settings-save-email-alerts"
          type="button"
          size="sm"
          onClick={savePreference}
          disabled={isPending}
        >
          {isPending ? "Saving..." : "Save Preference"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Delivery goes to the assigned teammate or workspace owner email.
        </p>
      </div>

      {message.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message.error}
        </p>
      ) : null}

      {message.success ? (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          {message.success}
        </p>
      ) : null}
    </div>
  );
}
