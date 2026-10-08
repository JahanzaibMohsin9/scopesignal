"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncChannelsAction } from "./actions";

export function SyncChannelsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const router = useRouter();

  function handleSync() {
    startTransition(async () => {
      setMessage(null);
      const result = await syncChannelsAction();
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      if (result.success) {
        setMessage({ type: "success", text: result.success });
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        id="channels-sync-btn"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleSync}
        disabled={pending}
      >
        <RefreshCw
          className={["h-4 w-4", pending ? "animate-spin" : ""].join(" ")}
        />
        {pending ? "Syncing..." : "Sync Channels"}
      </Button>
      {message && (
        <p
          aria-live="polite"
          className={[
            "max-w-64 text-right text-xs",
            message.type === "error" ? "text-destructive" : "text-accent",
          ].join(" ")}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
