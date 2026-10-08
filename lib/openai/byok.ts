import OpenAI from "openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOpenAiApiKey } from "@/lib/openai/config";

export type OpenAiCredentialSource = "managed" | "byok";

export type OpenAiCredentials = {
  apiKey: string;
  source: OpenAiCredentialSource;
  keyLastFour: string | null;
};

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type ByokKeyRow = {
  api_key: string;
  key_last_four: string | null;
  validated_at: string | null;
};

type UpsertByokKeyRow = {
  workspace_id: string;
  key_last_four: string;
  validated_at: string;
  status: "validated";
};

export type OpenAiByokSupabaseClient = {
  rpc(
    functionName: "get_workspace_openai_api_key",
    args: { p_workspace_id: string },
  ): Promise<RpcResult<ByokKeyRow[]>>;
  rpc(
    functionName: "upsert_workspace_openai_api_key",
    args: {
      p_workspace_id: string;
      p_api_key: string;
      p_key_last_four: string;
    },
  ): Promise<RpcResult<UpsertByokKeyRow[]>>;
  rpc(
    functionName: "clear_workspace_openai_api_key",
    args: { p_workspace_id: string },
  ): Promise<RpcResult<boolean>>;
  rpc(
    functionName: "mark_workspace_openai_api_key_invalid",
    args: { p_workspace_id: string },
  ): Promise<RpcResult<boolean>>;
};

export function getOpenAiKeyLastFour(apiKey: string) {
  return apiKey.trim().slice(-4);
}

export function isInvalidOpenAiApiKeyError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    status?: number;
    code?: string;
    type?: string;
    message?: string;
  };
  const message = candidate.message?.toLowerCase() ?? "";

  return (
    candidate.status === 401 ||
    candidate.code === "invalid_api_key" ||
    message.includes("invalid api key") ||
    message.includes("incorrect api key") ||
    message.includes("authentication") ||
    message.includes("unauthorized")
  );
}

function getSupabaseClient(supabase?: OpenAiByokSupabaseClient) {
  return (
    supabase ??
    (createSupabaseAdminClient() as unknown as OpenAiByokSupabaseClient)
  );
}

function normalizeApiKey(apiKey: string) {
  return apiKey.trim();
}

export async function validateOpenAiApiKey({
  apiKey,
  openai,
}: {
  apiKey: string;
  openai?: Pick<OpenAI, "models">;
}) {
  const normalizedKey = normalizeApiKey(apiKey);

  if (!normalizedKey || !normalizedKey.startsWith("sk-")) {
    return {
      ok: false as const,
      error: "Enter a valid OpenAI API key that starts with sk-.",
    };
  }

  try {
    const client = openai ?? new OpenAI({ apiKey: normalizedKey });
    await client.models.list();

    return {
      ok: true as const,
      keyLastFour: getOpenAiKeyLastFour(normalizedKey),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false as const,
      error: `OpenAI rejected this API key: ${message}`,
    };
  }
}

export async function saveWorkspaceOpenAiApiKey({
  workspaceId,
  apiKey,
  supabase,
}: {
  workspaceId: string;
  apiKey: string;
  supabase?: OpenAiByokSupabaseClient;
}) {
  const normalizedKey = normalizeApiKey(apiKey);
  const validation = await validateOpenAiApiKey({ apiKey: normalizedKey });

  if (!validation.ok) {
    return validation;
  }

  const client = getSupabaseClient(supabase);
  const { data, error } = await client.rpc("upsert_workspace_openai_api_key", {
    p_workspace_id: workspaceId,
    p_api_key: normalizedKey,
    p_key_last_four: validation.keyLastFour,
  });

  if (error) {
    return {
      ok: false as const,
      error: error.message ?? "Failed to store the OpenAI API key.",
    };
  }

  const row = data?.[0];

  return {
    ok: true as const,
    keyLastFour: row?.key_last_four ?? validation.keyLastFour,
    validatedAt: row?.validated_at ?? new Date().toISOString(),
  };
}

export async function clearWorkspaceOpenAiApiKey({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: OpenAiByokSupabaseClient;
}) {
  const client = getSupabaseClient(supabase);
  const { error } = await client.rpc("clear_workspace_openai_api_key", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    return {
      ok: false as const,
      error: error.message ?? "Failed to remove the OpenAI API key.",
    };
  }

  return { ok: true as const };
}

export async function markWorkspaceOpenAiApiKeyInvalid({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: OpenAiByokSupabaseClient;
}) {
  const client = getSupabaseClient(supabase);
  const { error } = await client.rpc("mark_workspace_openai_api_key_invalid", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    return {
      ok: false as const,
      error: error.message ?? "Failed to mark the OpenAI API key as invalid.",
    };
  }

  return { ok: true as const };
}

export async function resolveWorkspaceOpenAiCredentials({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: OpenAiByokSupabaseClient;
}): Promise<OpenAiCredentials> {
  const client = getSupabaseClient(supabase);
  const { data, error } = await client.rpc("get_workspace_openai_api_key", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace OpenAI key.");
  }

  const byok = data?.[0];

  if (byok?.api_key) {
    return {
      apiKey: byok.api_key,
      source: "byok",
      keyLastFour: byok.key_last_four,
    };
  }

  return {
    apiKey: getOpenAiApiKey(),
    source: "managed",
    keyLastFour: null,
  };
}
