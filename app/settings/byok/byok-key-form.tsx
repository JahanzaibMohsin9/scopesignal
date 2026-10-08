"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearByokKeyAction,
  saveByokKeyAction,
  validateByokKeyAction,
} from "./actions";

type ActionState = {
  success?: string;
  error?: string;
  keyLastFour?: string;
};

type ByokKeyFormProps = {
  currentKeyLastFour: string | null;
};

export function ByokKeyForm({ currentKeyLastFour }: ByokKeyFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<ActionState>({});
  const [isPending, startTransition] = useTransition();

  const canSubmit = apiKey.trim().length > 0 && !isPending;

  function buildFormData() {
    const formData = new FormData();
    formData.set("openai_api_key", apiKey);
    return formData;
  }

  function validateKey() {
    startTransition(async () => {
      const result = await validateByokKeyAction(buildFormData());
      setMessage(result);
    });
  }

  function saveKey() {
    startTransition(async () => {
      const result = await saveByokKeyAction(buildFormData());
      setMessage(result);

      if (result.success) {
        setApiKey("");
      }
    });
  }

  function clearKey() {
    startTransition(async () => {
      const result = await clearByokKeyAction();
      setMessage(result);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="openai_api_key"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          OpenAI API Key
        </label>
        <Input
          id="openai_api_key"
          name="openai_api_key"
          type="password"
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
            setMessage({});
          }}
          placeholder="sk-..."
          autoComplete="off"
          className="border-border/60 bg-muted/30"
        />
        <p className="text-xs text-muted-foreground">
          The key is validated with OpenAI before it is stored in Supabase Vault.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          id="byok-validate-key"
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canSubmit}
          onClick={validateKey}
        >
          {isPending ? "Checking..." : "Validate Key"}
        </Button>
        <Button
          id="byok-save-key"
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={saveKey}
        >
          {isPending ? "Saving..." : "Save Key"}
        </Button>
        {currentKeyLastFour && (
          <Button
            id="byok-clear-key"
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={clearKey}
          >
            Remove Key
          </Button>
        )}
      </div>

      {message.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message.error}
        </p>
      )}
      {message.success && (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          {message.success}
        </p>
      )}
    </div>
  );
}
