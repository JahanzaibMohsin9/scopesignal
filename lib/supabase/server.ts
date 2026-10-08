import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseBrowserConfig } from "@/lib/supabase/config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getSupabaseBrowserConfig();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Middleware refreshes sessions.
        }
      },
    },
  });
}
