"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserConfig } from "@/lib/supabase/config";

export function DocumentStatusRealtime({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseBrowserConfig();
    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
    const channel = supabase
      .channel(`document-status:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "documents",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, workspaceId]);

  return null;
}
