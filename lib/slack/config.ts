const DEFAULT_BOT_SCOPES = [
  "channels:read",
  "groups:read",
  "users:read",
  "users:read.email",
  "chat:write",
  "channels:history",
  "groups:history",
];

export function getSlackOAuthConfig() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUrl = process.env.SLACK_OAUTH_REDIRECT_URL;

  if (!clientId || !clientSecret || !redirectUrl) {
    throw new Error(
      "Missing SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, or SLACK_OAUTH_REDIRECT_URL.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUrl,
    scopes: DEFAULT_BOT_SCOPES,
  };
}
