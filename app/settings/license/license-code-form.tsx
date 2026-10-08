"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  redeemLicenseCodeAction,
  type RedeemLicenseCodeState,
} from "./actions";

export function LicenseCodeForm() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<RedeemLicenseCodeState>({});
  const [isPending, startTransition] = useTransition();
  const canSubmit = code.trim().length >= 8 && !isPending;

  function redeemCode() {
    const formData = new FormData();
    formData.set("code", code);

    startTransition(async () => {
      const result = await redeemLicenseCodeAction({}, formData);
      setMessage(result);

      if (result.success) {
        setCode("");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="license-code"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          License Code
        </label>
        <Input
          id="license-code"
          name="code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setMessage({});
          }}
          placeholder="Enter your license code"
          autoComplete="off"
          className="border-border/60 bg-muted/30 uppercase"
        />
      </div>

      <Button
        id="license-redeem-code"
        type="button"
        size="sm"
        disabled={!canSubmit}
        onClick={redeemCode}
      >
        {isPending ? "Redeeming..." : "Redeem Code"}
      </Button>

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
