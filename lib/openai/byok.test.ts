import { describe, expect, it, vi } from "vitest";
import {
  getOpenAiKeyLastFour,
  isInvalidOpenAiApiKeyError,
  markWorkspaceOpenAiApiKeyInvalid,
  resolveWorkspaceOpenAiCredentials,
  validateOpenAiApiKey,
  type OpenAiByokSupabaseClient,
} from "@/lib/openai/byok";

function createSupabaseClient(data: unknown[]) {
  const rpc = vi.fn(async () => ({ data, error: null }));

  return {
    client: { rpc } as unknown as OpenAiByokSupabaseClient,
    rpc,
  };
}

describe("validateOpenAiApiKey", () => {
  it("rejects keys that do not look like OpenAI API keys", async () => {
    await expect(
      validateOpenAiApiKey({ apiKey: "not-a-key" }),
    ).resolves.toEqual({
      ok: false,
      error: "Enter a valid OpenAI API key that starts with sk-.",
    });
  });

  it("calls models.list and returns the key suffix", async () => {
    const list = vi.fn(async () => ({ data: [] }));

    await expect(
      validateOpenAiApiKey({
        apiKey: "sk-test-123456",
        openai: { models: { list } } as never,
      }),
    ).resolves.toEqual({
      ok: true,
      keyLastFour: "3456",
    });

    expect(list).toHaveBeenCalled();
  });
});

describe("resolveWorkspaceOpenAiCredentials", () => {
  it("uses a stored BYOK key when one is available", async () => {
    const { client, rpc } = createSupabaseClient([
      {
        api_key: "sk-live-workspace",
        key_last_four: "pace",
        validated_at: "2026-04-19T10:00:00.000Z",
      },
    ]);

    await expect(
      resolveWorkspaceOpenAiCredentials({
        workspaceId: "workspace-1",
        supabase: client,
      }),
    ).resolves.toEqual({
      apiKey: "sk-live-workspace",
      source: "byok",
      keyLastFour: "pace",
    });

    expect(rpc).toHaveBeenCalledWith("get_workspace_openai_api_key", {
      p_workspace_id: "workspace-1",
    });
  });

  it("returns the last four characters of a key", () => {
    expect(getOpenAiKeyLastFour("sk-test-abcdef")).toBe("cdef");
  });
});

describe("isInvalidOpenAiApiKeyError", () => {
  it("detects OpenAI authentication failures", () => {
    expect(
      isInvalidOpenAiApiKeyError({
        status: 401,
        message: "Incorrect API key provided",
      }),
    ).toBe(true);
  });

  it("does not flag unrelated errors", () => {
    expect(
      isInvalidOpenAiApiKeyError({
        status: 500,
        message: "Temporary outage",
      }),
    ).toBe(false);
  });
});

describe("markWorkspaceOpenAiApiKeyInvalid", () => {
  it("marks the saved key invalid via RPC", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = { rpc } as unknown as OpenAiByokSupabaseClient;

    await expect(
      markWorkspaceOpenAiApiKeyInvalid({
        workspaceId: "workspace-1",
        supabase: client,
      }),
    ).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledWith("mark_workspace_openai_api_key_invalid", {
      p_workspace_id: "workspace-1",
    });
  });
});
