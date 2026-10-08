"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const appRoutes = [
  "/dashboard",
  "/proposals",
  "/alerts",
  "/settings",
  "/settings/channels",
  "/settings/contacts",
];

export function RoutePreloader() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      appRoutes.forEach((route) => {
        router.prefetch(route);
      });
    }, 250);

    return () => window.clearTimeout(id);
  }, [router]);

  return null;
}
