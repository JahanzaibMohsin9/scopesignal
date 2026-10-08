"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateWorkspaceNameAction } from "./actions";

type WorkspaceSettingsFormProps = {
  initialWorkspaceName: string;
};

export function WorkspaceSettingsForm({
  initialWorkspaceName,
}: WorkspaceSettingsFormProps) {
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [message, setMessage] = useState<{ success?: string; error?: string }>(
    {},
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setWorkspaceName(initialWorkspaceName);
  }, [initialWorkspaceName]);

  const trimmedWorkspaceName = workspaceName.trim();
  const hasChanged = trimmedWorkspaceName !== initialWorkspaceName.trim();

  function saveWorkspaceName() {
    startTransition(async () => {
      const result = await updateWorkspaceNameAction(workspaceName);
      setMessage(result);

      if (result.workspaceName) {
        setWorkspaceName(result.workspaceName);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="settings-workspace-name"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Workspace Name
        </label>
        <Input
          id="settings-workspace-name"
          value={workspaceName}
          maxLength={80}
          onChange={(event) => {
            setWorkspaceName(event.target.value);
            setMessage({});
          }}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          id="settings-save-workspace"
          type="button"
          size="sm"
          onClick={saveWorkspaceName}
          disabled={isPending || !hasChanged}
        >
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Update the name shown in your sidebar and workspace header.
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
