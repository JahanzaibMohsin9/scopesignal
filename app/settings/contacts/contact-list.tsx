"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toggleContactActiveAction, untagContactAction } from "./actions";

type Contact = {
  id: string;
  slack_user_id: string;
  display_name: string;
  real_name: string | null;
  email: string | null;
  is_active: boolean;
  metadata: { avatar_url?: string } | null;
};

// ─────────────────────────────────────────────────────────────
// Inline Switch (mirrors channel-list.tsx to avoid extra deps)
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────

function Avatar({ src, name }: { src?: string | null; name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border/50"
        onError={(e) => {
          // Fall back to initials div on broken images
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold uppercase text-accent ring-1 ring-accent/25">
      {initials || "?"}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

export function ContactRow({ contact }: { contact: Contact }) {
  const [active, setActive] = useState(contact.is_active);
  const [toggling, startToggle] = useTransition();
  const [removing, startRemove] = useTransition();

  const pending = toggling || removing;

  function handleToggle(value: boolean) {
    setActive(value);
    startToggle(async () => {
      const result = await toggleContactActiveAction(contact.id, value);
      if (result.error) setActive(!value); // roll back
    });
  }

  function handleRemove() {
    startRemove(async () => {
      await untagContactAction(contact.id);
    });
  }

  const avatarUrl =
    contact.metadata && typeof contact.metadata === "object"
      ? contact.metadata.avatar_url
      : undefined;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:bg-muted/20">
      {/* Left — avatar + details */}
      <div className="flex min-w-0 items-center gap-3">
        <Avatar src={avatarUrl} name={contact.display_name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {contact.display_name}
          </p>
          {contact.real_name && contact.real_name !== contact.display_name && (
            <p className="truncate text-xs text-muted-foreground">
              {contact.real_name}
            </p>
          )}
          {contact.email && (
            <p className="truncate text-xs text-muted-foreground">
              {contact.email}
            </p>
          )}
        </div>
      </div>

      {/* Right — active toggle + remove */}
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={[
            "text-xs transition-colors",
            active ? "font-medium text-accent" : "text-muted-foreground",
          ].join(" ")}
        >
          {active ? "Active" : "Paused"}
        </span>
        <Switch
          id={`contact-toggle-${contact.id}`}
          checked={active}
          onCheckedChange={handleToggle}
          disabled={pending}
        />
        <button
          id={`contact-remove-${contact.id}`}
          type="button"
          aria-label={`Remove ${contact.display_name}`}
          disabled={pending}
          onClick={handleRemove}
          className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

export function ContactList({ contacts }: { contacts: Contact[] }) {
  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <ContactRow key={c.id} contact={c} />
      ))}
    </div>
  );
}
