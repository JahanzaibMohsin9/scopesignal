# Slack App Setup

ScopeSignal connects to Slack through a standard OAuth install, receives messages through the Events API, and handles alert buttons through an interactivity endpoint.

## 1. Create the Slack app

Create an app at https://api.slack.com/apps ("From scratch") and note the **Client ID**, **Client Secret** and **Signing Secret** from Basic Information.

### Bot token scopes

Under **OAuth & Permissions**, add these bot scopes (the same list is in `lib/slack/config.ts`):

```text
channels:read
groups:read
users:read
users:read.email
chat:write
channels:history
groups:history
```

### Redirect URL

```text
https://<your-app-url>/api/slack/oauth/callback
```

### Event subscriptions

Enable **Event Subscriptions** and set the request URL to:

```text
https://<your-app-url>/api/slack/events
```

Subscribe to the bot events `message.channels` and `message.groups`. Slack verifies the URL immediately, so the app must already be deployed (or tunnelled) and have `SLACK_SIGNING_SECRET` set.

### Interactivity

Enable **Interactivity & Shortcuts** and set the request URL to:

```text
https://<your-app-url>/api/slack/interactivity
```

This handles the *Approve draft reply*, *False positive* and *Ignore* buttons on alert DMs.

## 2. Environment variables

```text
NEXT_PUBLIC_APP_URL=https://<your-app-url>
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_TOKEN_ENCRYPTION_KEY=          # any strong random secret
SLACK_OAUTH_REDIRECT_URL=https://<your-app-url>/api/slack/oauth/callback
SLACK_EVENTS_REQUEST_URL=https://<your-app-url>/api/slack/events
```

`SLACK_BOT_TOKEN` is only needed for single-workspace testing. Normal installs store a per-workspace bot token, encrypted with `SLACK_TOKEN_ENCRYPTION_KEY`. If that key isn't set, the app falls back to `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Install flow

```text
/settings/channels → Connect Slack
  → /api/slack/oauth/install
  → Slack approval screen
  → /api/slack/oauth/callback   (stores team metadata + encrypted bot token)
  → /settings/channels?success=...
```

After connecting:

1. Sync channels and pick the client channels to watch.
2. Tag the Slack users who are client contacts. Messages from anyone else are ignored.
3. Post a request in a watched channel as a client contact and check that an alert appears.

In the `workspaces` table, `slack_access_token_ciphertext` should hold an encrypted value, never a raw `xoxb-` token.

## Local development

Slack needs a public HTTPS URL. Expose the local server with a tunnel and use the tunnel host in the URLs above:

```bash
ngrok http 3000
# or
cloudflared tunnel --url http://localhost:3000
```

## How the events endpoint behaves

- Verifies `x-slack-signature` against the raw request body and rejects timestamps older than 5 minutes.
- Answers Slack's `url_verification` challenge.
- Acknowledges message events with HTTP 200 straight away. Filtering (watched channel, client contact) and classification happen in the queue and the scope worker, so Slack never waits on the model.
