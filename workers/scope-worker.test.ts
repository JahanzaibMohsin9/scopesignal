import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  processNextScopeJob,
  type ScopeWorkerJob,
  type ScopeWorkerSupabaseClient,
} from "./scope-worker";
import { QuotaExhaustedError } from "@/lib/usage/quota";

const job: ScopeWorkerJob = {
  message_id: 101,
  read_count: 1,
  enqueued_at: "2026-04-12T10:00:00.000Z",
  visibility_until: "2026-04-12T10:00:30.000Z",
  payload: {
    workspace_id: "workspace-1",
    slack_channel_id: "C123",
    slack_user_id: "U123",
    message_ts: "1710000000.000100",
    thread_ts: null,
    text: "Can we expand the deliverables for launch next week?",
    received_at: "2026-04-12T10:00:00.000Z",
  },
};

function createWorkerClient({
  jobs = [job],
  failAction = "retry",
}: {
  jobs?: ScopeWorkerJob[];
  failAction?: "retry" | "dlq";
} = {}) {
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === "read_scopesignal_job") {
      return { data: jobs, error: null };
    }

    if (functionName === "complete_scopesignal_job") {
      return { data: true, error: null };
    }

    if (functionName === "fail_scopesignal_job") {
      return {
        data: [
          {
            action: failAction,
            dlq_message_id: failAction === "dlq" ? 202 : null,
          },
        ],
        error: null,
      };
    }

    return { data: null, error: { message: `Unexpected RPC ${functionName}` } };
  });

  return {
    client: { rpc } as unknown as ScopeWorkerSupabaseClient,
    rpc,
  };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("processNextScopeJob", () => {
  it("returns idle when no job is available", async () => {
    const { client } = createWorkerClient({ jobs: [] });

    await expect(processNextScopeJob({ supabase: client })).resolves.toEqual({
      status: "idle",
    });
  });

  it("processes and acknowledges a successful job", async () => {
    const { client, rpc } = createWorkerClient();
    const processor = vi.fn(async () => undefined);

    await expect(
      processNextScopeJob({ supabase: client, processor }),
    ).resolves.toEqual({
      status: "completed",
      messageId: 101,
    });

    expect(processor).toHaveBeenCalledWith(job);
    expect(rpc).toHaveBeenCalledWith("complete_scopesignal_job", {
      p_message_id: 101,
    });
  });

  it("nacks failed jobs for retry before max attempts", async () => {
    const { client, rpc } = createWorkerClient({ failAction: "retry" });

    await expect(
      processNextScopeJob({
        supabase: client,
        processor: async () => {
          throw new Error("temporary outage");
        },
      }),
    ).resolves.toEqual({
      status: "retry",
      messageId: 101,
      error: "temporary outage",
    });

    expect(rpc).toHaveBeenCalledWith("fail_scopesignal_job", {
      p_message_id: 101,
      p_payload: job.payload,
      p_read_count: 1,
      p_error: "temporary outage",
      p_max_attempts: 3,
    });
  });

  it("moves permanently failed jobs to the DLQ", async () => {
    const { client } = createWorkerClient({
      jobs: [{ ...job, read_count: 3 }],
      failAction: "dlq",
    });

    await expect(
      processNextScopeJob({
        supabase: client,
        processor: async () => {
          throw new Error("bad payload");
        },
      }),
    ).resolves.toEqual({
      status: "dlq",
      messageId: 101,
      dlqMessageId: 202,
      error: "bad payload",
    });
  });

  it("acknowledges quota-exhausted jobs without retrying them", async () => {
    const { client, rpc } = createWorkerClient();

    await expect(
      processNextScopeJob({
        supabase: client,
        processor: async () => {
          throw new QuotaExhaustedError({
            workspace_id: "workspace-1",
            month_start: "2026-04-01",
            managed_usage_enabled: true,
            allocated_monthly_events: 100,
            managed_classification_count: 100,
            remaining_events: 0,
            has_quota: false,
          });
        },
      }),
    ).resolves.toEqual({
      status: "quota_exhausted",
      messageId: 101,
      workspaceId: "workspace-1",
      used: 100,
      allocated: 100,
    });

    expect(rpc).toHaveBeenCalledWith("complete_scopesignal_job", {
      p_message_id: 101,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "fail_scopesignal_job",
      expect.anything(),
    );
  });
});
