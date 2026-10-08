import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSlackOAuthConfig } from "@/lib/slack/config";
import { encryptSlackToken } from "@/lib/slack/token-vault";

type SlackOAuthResponse = {
  ok: boolean;
  access_token?: string;
  bot_user_id?: string;
  error?: string;
  team?: {
    id?: string;
    name?: string;
  };
};

type UserWorkspaceRow = {
  workspace_id: string | null;
};

function channelsRedirect(
  request: NextRequest,
  type: "error" | "success",
  message: string,
) {
  const url = new URL("/settings/channels", request.url);
  url.searchParams.set(type, message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");
  const storedState = request.cookies.get("slack_oauth_state")?.value;
  const workspaceId = request.cookies.get("slack_oauth_workspace_id")?.value;

  const clearCookies = (response: NextResponse) => {
    response.cookies.delete("slack_oauth_state");
    response.cookies.delete("slack_oauth_workspace_id");
    return response;
  };

  if (requestUrl.searchParams.get("error")) {
    return clearCookies(
      channelsRedirect(
        request,
        "error",
        `Slack authorization was cancelled: ${requestUrl.searchParams.get("error")}`,
      ),
    );
  }

  if (
    !code ||
    !returnedState ||
    !storedState ||
    returnedState !== storedState
  ) {
    return clearCookies(
      channelsRedirect(
        request,
        "error",
        "Slack authorization state was invalid.",
      ),
    );
  }

  if (!workspaceId) {
    return clearCookies(
      channelsRedirect(
        request,
        "error",
        "Slack authorization session expired.",
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("next", "/settings/channels");
    return clearCookies(NextResponse.redirect(signInUrl));
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await adminSupabase
    .from("users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle<UserWorkspaceRow>();

  if (profileError) {
    return clearCookies(
      channelsRedirect(request, "error", profileError.message),
    );
  }

  if (!profile?.workspace_id || profile.workspace_id !== workspaceId) {
    return clearCookies(
      channelsRedirect(
        request,
        "error",
        "Slack authorization workspace was invalid.",
      ),
    );
  }

  let config: ReturnType<typeof getSlackOAuthConfig>;

  try {
    config = getSlackOAuthConfig();
  } catch (error) {
    return clearCookies(
      channelsRedirect(
        request,
        "error",
        error instanceof Error
          ? error.message
          : "Slack OAuth configuration is incomplete.",
      ),
    );
  }

  let tokenData: SlackOAuthResponse;

  try {
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUrl,
      }),
    });

    if (!tokenResponse.ok) {
      return clearCookies(
        channelsRedirect(
          request,
          "error",
          `Slack token exchange failed with HTTP ${tokenResponse.status}.`,
        ),
      );
    }

    tokenData = (await tokenResponse.json()) as SlackOAuthResponse;
  } catch (error) {
    return clearCookies(
      channelsRedirect(
        request,
        "error",
        error instanceof Error
          ? `Slack token exchange failed: ${error.message}`
          : "Slack token exchange failed.",
      ),
    );
  }

  if (!tokenData.ok || !tokenData.access_token || !tokenData.team?.id) {
    return clearCookies(
      channelsRedirect(
        request,
        "error",
        tokenData.error ?? "Slack did not return a bot token.",
      ),
    );
  }

  const { error: workspaceError } = await adminSupabase
    .from("workspaces")
    .update({
      slack_team_id: tokenData.team.id,
      slack_team_name: tokenData.team.name ?? null,
      slack_bot_user_id: tokenData.bot_user_id ?? null,
      slack_access_token_ciphertext: encryptSlackToken(tokenData.access_token),
    })
    .eq("id", workspaceId);

  if (workspaceError) {
    return clearCookies(
      channelsRedirect(request, "error", workspaceError.message),
    );
  }

  return clearCookies(
    channelsRedirect(request, "success", "Slack workspace connected."),
  );
}
