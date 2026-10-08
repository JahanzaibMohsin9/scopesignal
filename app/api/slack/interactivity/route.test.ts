import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const updateMock = vi.fn();
const alertWorkspaceEqMock = vi.fn();
const alertIdEqMock = vi.fn();
const maybeSingleMock = vi.fn();
const workspaceEqMock = vi.fn();
const workspaceSelectMock = vi.fn();
const alertsFromMock = vi.fn();
const workspacesFromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "workspaces") {
        return workspacesFromMock();
      }

      if (table === "alerts") {
        return alertsFromMock();
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const signingSecret = "test-signing-secret";

function slackSignature(body: string, timestamp: string) {
  return `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
}

function signedInteractionRequest(payload: unknown) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = new URLSearchParams({
    payload: JSON.stringify(payload),
  }).toString();

  return new Request("http://localhost/api/slack/interactivity", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": slackSignature(body, timestamp),
    },
    body,
  });
}

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = signingSecret;
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);

  maybeSingleMock.mockResolvedValue({
    data: { id: "workspace-1" },
    error: null,
  });
  workspaceEqMock.mockReturnValue({
    maybeSingle: maybeSingleMock,
  });
  workspaceSelectMock.mockReturnValue({
    eq: workspaceEqMock,
  });
  workspacesFromMock.mockReturnValue({
    select: workspaceSelectMock,
  });

  alertWorkspaceEqMock.mockResolvedValue({ error: null });
  alertIdEqMock.mockReturnValue({
    eq: alertWorkspaceEqMock,
  });
  updateMock.mockReturnValue({
    eq: alertIdEqMock,
  });
  alertsFromMock.mockReturnValue({
    update: updateMock,
  });
});

describe("Slack interactivity route", () => {
  it("maps false positive actions to alert status updates", async () => {
    const response = await POST(
      signedInteractionRequest({
        type: "block_actions",
        team: { id: "T123" },
        user: { id: "U123" },
        actions: [
          {
            action_id: "scopesignal_alert_false_positive",
            value: "alert-1",
          },
        ],
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      replace_original: true,
      text: "ScopeSignal triage saved: Marked false positive.",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*ScopeSignal triage saved*\nMarked false positive.",
          },
        },
      ],
    });
    expect(updateMock).toHaveBeenCalledWith({
      status: "false_positive",
      resolved_at: expect.any(String),
    });
    expect(alertIdEqMock).toHaveBeenCalledWith("id", "alert-1");
    expect(alertWorkspaceEqMock).toHaveBeenCalledWith(
      "workspace_id",
      "workspace-1",
    );
  });

  it("marks ignored alerts as resolved", async () => {
    const response = await POST(
      signedInteractionRequest({
        type: "block_actions",
        team: { id: "T123" },
        actions: [
          {
            action_id: "scopesignal_alert_ignore",
            value: "alert-2",
          },
        ],
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      status: "ignored",
      resolved_at: expect.any(String),
    });
  });

  it("rejects unsigned requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/slack/interactivity", {
        method: "POST",
        body: new URLSearchParams({
          payload: JSON.stringify({ type: "block_actions" }),
        }),
      }) as never,
    );

    expect(response.status).toBe(401);
  });
});
