"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, UserPlus, Loader2 } from "lucide-react";
import { searchSlackUsersAction, tagContactAction } from "./actions";
import type { SlackUser } from "@/lib/slack/users";

// ─────────────────────────────────────────────────────────────
// Tiny avatar for the dropdown results
// ─────────────────────────────────────────────────────────────

function ResultAvatar({ src, name }: { src?: string; name: string }) {
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
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold uppercase text-accent">
      {initials || "?"}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

type Props = {
  /** IDs of users already tagged — these are greyed out in results */
  taggedSlackUserIds: Set<string>;
};

export function UserSearchBox({ taggedSlackUserIds }: Props) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SlackUser[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const [fetching, startFetch] = useTransition();
  const [tagging, startTag] = useTransition();

  function handleFocus() {
    setFocused(true);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setUsers([]);
      setFetchError(null);
    }
  }

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!focused || trimmedQuery.length < 2) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setFetchError(null);
      startFetch(async () => {
        const result = await searchSlackUsersAction(trimmedQuery);
        if (cancelled) {
          return;
        }
        if (result.error) {
          setFetchError(result.error);
        } else {
          setUsers(result.users ?? []);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [focused, query]);

  const showDropdown = focused && query.trim().length >= 2;

  function handleTag(user: SlackUser) {
    setTaggingId(user.id);
    setTagError(null);
    startTag(async () => {
      const result = await tagContactAction(user.id);
      if (result.error) {
        setTagError(result.error);
      } else {
        // Clear search after successful tag
        setQuery("");
      }
      setTaggingId(null);
    });
  }

  return (
    <div className="relative max-w-sm">
      {/* Search input */}
      <div className="relative">
        {fetching ? (
          <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          id="contacts-search"
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={() => setFocused(false)}
          placeholder="Search Slack users..."
          autoComplete="off"
          className={[
            "w-full rounded-md border border-border/60 bg-muted/40 py-2 pl-9 pr-3",
            "text-sm text-foreground placeholder:text-muted-foreground/70",
            "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20",
            "transition-colors",
          ].join(" ")}
        />
      </div>

      {/* Error banners */}
      {fetchError && (
        <p className="mt-1.5 text-xs text-destructive">{fetchError}</p>
      )}
      {tagError && (
        <p className="mt-1.5 text-xs text-destructive">{tagError}</p>
      )}

      {/* Dropdown results */}
      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {fetching ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              Searching Slack...
            </p>
          ) : users.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              No users match your search.
            </p>
          ) : (
            <ul className="max-h-60 overflow-y-auto divide-y divide-border/30">
              {users.map((user) => {
                const alreadyTagged = taggedSlackUserIds.has(user.id);
                const isTagging = taggingId === user.id && tagging;

                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      disabled={alreadyTagged || isTagging || tagging}
                      onClick={() => handleTag(user)}
                      className={[
                        "flex w-full items-center gap-3 px-3 py-2 text-left",
                        "transition-colors",
                        alreadyTagged
                          ? "cursor-default opacity-50"
                          : "hover:bg-muted/40 focus:bg-muted/40 focus:outline-none",
                      ].join(" ")}
                    >
                      <ResultAvatar
                        src={user.avatar_url}
                        name={user.display_name}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {user.display_name}
                        </p>
                        {user.email && (
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        )}
                      </div>
                      {alreadyTagged ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Tagged
                        </span>
                      ) : isTagging ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
