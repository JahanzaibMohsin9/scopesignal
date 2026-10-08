import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceConfig } from "@/lib/supabase/config";

export function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
