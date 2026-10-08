import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseBrowserConfig } from "@/lib/supabase/config";
import { ensureUserWorkspace } from "@/lib/auth/workspace";

function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(next, request.url);
  const response = NextResponse.redirect(redirectUrl);

  if (!code) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseBrowserConfig();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(
        `/auth/sign-in?error=${encodeURIComponent(
          error?.message ?? "Unable to confirm your session.",
        )}`,
        request.url,
      ),
    );
  }

  await ensureUserWorkspace({ user: data.user });

  return response;
}
