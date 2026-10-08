import { NextResponse, type NextRequest } from "next/server";
import {
  getSlackSigningSecret,
  isFreshSlackTimestamp,
  verifySlackSignature,
} from "@/lib/slack/signature";
import {
  recordSlackEventReceived,
  getSlackEventMetricsSnapshot,
} from "@/lib/slack/event-metrics";
import {
  prefilterSlackMessageEvent,
  type SlackEventCallbackPayload,
} from "@/lib/slack/event-prefilter";
import {
  buildSlackAnalysisJobPayload,
  enqueueSlackAnalysisJob,
} from "@/lib/slack/event-queue";

export const runtime = "nodejs";

type SlackUrlVerificationPayload = {
  type: "url_verification";
  challenge?: string;
};

type SlackEventsPayload =
  | SlackUrlVerificationPayload
  | SlackEventCallbackPayload
  | { type?: string };

export { isFreshSlackTimestamp, verifySlackSignature };

function isUrlVerificationPayload(
  payload: SlackEventsPayload,
): payload is SlackUrlVerificationPayload {
  return payload.type === "url_verification";
}

function isEventCallbackPayload(
  payload: SlackEventsPayload,
): payload is SlackEventCallbackPayload {
  return payload.type === "event_callback";
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: SlackEventsPayload;

  try {
    payload = JSON.parse(rawBody) as SlackEventsPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

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

  if (isUrlVerificationPayload(payload)) {
    if (!payload.challenge) {
      return NextResponse.json(
        { error: "Missing Slack challenge." },
        { status: 400 },
      );
    }

    return new NextResponse(payload.challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if (isEventCallbackPayload(payload)) {
    recordSlackEventReceived();
    const prefilterResult = await prefilterSlackMessageEvent(payload);

    if (prefilterResult.accepted) {
      const jobPayload = buildSlackAnalysisJobPayload({
        payload,
        prefilterResult,
        receivedAt: new Date().toISOString(),
      });

      await enqueueSlackAnalysisJob({ jobPayload });
    }

    console.info("slack_event_gateway.metrics", getSlackEventMetricsSnapshot());

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
