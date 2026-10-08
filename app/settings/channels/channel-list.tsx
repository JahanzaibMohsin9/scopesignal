"use client";

import { useState, useTransition } from "react";
import { Lock, Hash } from "lucide-react";
import { toggleChannelTrackedAction } from "./actions";

type Channel = {
  id: string;
  slack_channel_id: string;
  name: string;
  is_private: boolean;
  is_tracked: boolean;
};

// ──────────────────────────────────────────────────────────────
// Minimal toggle switch built with plain HTML + Tailwind so we
// avoid adding the full @radix-ui/react-switch dependency.
// ──────────────────────────────────────────────────────────────

function Switch({
  id,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      role="switch"
      type="button"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
        "transition-colors duration-200 ease-in-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-accent" : "bg-muted-foreground/30",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow ring-0",
          "transition-transform duration-200 ease-in-out",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

// ──────────────────────────────────────────────────────────────

export function ChannelRow({ channel }: { channel: Channel }) {
  const [tracked, setTracked] = useState(channel.is_tracked);
  const [pending, startTransition] = useTransition();

  function handleToggle(value: boolean) {
    setTracked(value); // optimistic update
    startTransition(async () => {
      const result = await toggleChannelTrackedAction(channel.id, value);
      if (result.error) {
        // Roll back optimistic update
        setTracked(!value);
      }
    });
  }

  const Icon = channel.is_private ? Lock : Hash;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:bg-muted/20">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            #{channel.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {channel.is_private ? "Private channel" : "Public channel"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={[
            "text-xs transition-colors",
            tracked ? "text-accent font-medium" : "text-muted-foreground",
          ].join(" ")}
        >
          {tracked ? "Monitoring" : "Off"}
        </span>
        <Switch
          id={`channel-toggle-${channel.id}`}
          checked={tracked}
          onCheckedChange={handleToggle}
          disabled={pending}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

export function ChannelList({ channels }: { channels: Channel[] }) {
  return (
    <div className="space-y-2">
      {channels.map((ch) => (
        <ChannelRow key={ch.id} channel={ch} />
      ))}
    </div>
  );
}
