import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import { getSlackOAuthConfig } from "@/lib/slack/config";

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/settings/channels", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("next", "/settings/channels");
    return NextResponse.redirect(signInUrl);
  }

  let config: ReturnType<typeof getSlackOAuthConfig>;
  let workspaceId: string;

  try {
    config = getSlackOAuthConfig();
    workspaceId = await ensureUserWorkspace({ user });
  } catch (error) {
    return redirectWithError(
      request,
      error instanceof Error
        ? error.message
        : "Unable to start Slack installation.",
    );
  }

  const state = randomUUID();
  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("scope", config.scopes.join(","));
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUrl);
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set("slack_oauth_workspace_id", workspaceId, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
