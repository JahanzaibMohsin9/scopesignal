import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getSlackSigningSecret,
  verifySlackSignature,
} from "@/lib/slack/signature";

export const runtime = "nodejs";

const ACTION_STATUS_MAP = {
  scopesignal_alert_approve_draft_reply: "sent_draft",
  scopesignal_alert_false_positive: "false_positive",
  scopesignal_alert_ignore: "ignored",
} as const;

type ScopeSignalActionId = keyof typeof ACTION_STATUS_MAP;

type SlackInteractionPayload = {
  type?: string;
  team?: {
    id?: string;
  };
  user?: {
    id?: string;
  };
  actions?: Array<{
    action_id?: string;
    value?: string;
  }>;
  message?: {
    text?: string;
  };
};

function isScopeSignalAction(
  actionId: string | undefined,
): actionId is ScopeSignalActionId {
  return Boolean(
    actionId &&
    Object.prototype.hasOwnProperty.call(ACTION_STATUS_MAP, actionId),
  );
}

function parseInteractionPayload(rawBody: string) {
  const formData = new URLSearchParams(rawBody);
  const encodedPayload = formData.get("payload");

  if (!encodedPayload) {
    throw new Error("Missing Slack interaction payload.");
  }

  return JSON.parse(encodedPayload) as SlackInteractionPayload;
}

export async function POST(request: NextRequest) {
  let signingSecret: string;

  try {
    signingSecret = getSlackSigningSecret();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Slack signing secret is not configured.",
      },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (
    !(await verifySlackSignature({
      body: rawBody,
      signature,
      signingSecret,
      timestamp,
    }))
  ) {
    return NextResponse.json(
      { error: "Invalid Slack request signature." },
      { status: 401 },
    );
  }

  let payload: SlackInteractionPayload;

  try {
    payload = parseInteractionPayload(rawBody);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid Slack interaction payload.",
      },
      { status: 400 },
    );
  }

  const action = payload.actions?.[0];

  if (!isScopeSignalAction(action?.action_id)) {
    return NextResponse.json({ ok: true });
  }

  const alertId = action.value;
  const slackTeamId = payload.team?.id;

  if (!alertId || !slackTeamId) {
    return NextResponse.json(
      { error: "Missing alert id or Slack team id." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slack_team_id", slackTeamId)
    .maybeSingle();

  if (workspaceError) {
    return NextResponse.json(
      { error: workspaceError.message },
      { status: 500 },
    );
  }

  if (!workspace?.id) {
    return NextResponse.json(
      { error: "Slack workspace is not connected to ScopeSignal." },
      { status: 404 },
    );
  }

  const status = ACTION_STATUS_MAP[action.action_id];
  const resolvedAt = new Date().toISOString();

  const { error: alertError } = await supabase
    .from("alerts")
    .update({
      status,
      resolved_at: resolvedAt,
    })
    .eq("id", alertId)
    .eq("workspace_id", workspace.id);

  if (alertError) {
    return NextResponse.json({ error: alertError.message }, { status: 500 });
  }

  console.info("slack_interactivity.alert_status_updated", {
    alertId,
    workspaceId: workspace.id,
    status,
    slackUserId: payload.user?.id ?? null,
  });

  const actionLabel =
    status === "sent_draft"
      ? "Draft reply approved"
      : status === "false_positive"
        ? "Marked false positive"
        : "Ignored";

  return NextResponse.json({
    replace_original: true,
    text: `ScopeSignal triage saved: ${actionLabel}.`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*ScopeSignal triage saved*\n${actionLabel}.`,
        },
      },
    ],
  });
}
