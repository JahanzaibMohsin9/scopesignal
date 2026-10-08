"use client";

import { useEffect, useState } from "react";

type AuthToastProps = {
  error?: string;
  success?: string;
};

export function AuthToast({ error, success }: AuthToastProps) {
  const message = error ?? success;
  const variant = error ? "error" : "success";
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("success");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    const timeout = window.setTimeout(() => setVisible(false), 4_500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  if (!message || !visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed right-4 top-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-md",
        variant === "error"
          ? "border-destructive/40 bg-destructive/15 text-destructive-foreground"
          : "border-accent/40 bg-accent/15 text-accent",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
