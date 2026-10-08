import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClassificationUsage } from "@/lib/openai/classification";

export type QuotaNotificationKind = "warning_80" | "paused_100";

export type WorkspaceQuotaStatus = {
  workspace_id: string;
  month_start: string;
  managed_usage_enabled: boolean;
  allocated_monthly_events: number;
  managed_classification_count: number;
  remaining_events: number | null;
  has_quota: boolean;
};

export type ManagedUsageRecord = WorkspaceQuotaStatus & {
  notification_to_send: QuotaNotificationKind | null;
};

export type ByokUsageRecord = Omit<
  WorkspaceQuotaStatus,
  "remaining_events" | "has_quota"
> & {
  byok_classification_count: number;
};

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export type QuotaSupabaseClient = {
  rpc(
    functionName: "check_workspace_quota",
    args: { p_workspace_id: string },
  ): Promise<RpcResult<WorkspaceQuotaStatus[]>>;
  rpc(
    functionName: "record_managed_classification_usage",
    args: {
      p_workspace_id: string;
      p_prompt_tokens: number;
      p_completion_tokens: number;
      p_total_tokens: number;
    },
  ): Promise<RpcResult<ManagedUsageRecord[]>>;
  rpc(
    functionName: "reserve_managed_classification_quota",
    args: { p_workspace_id: string },
  ): Promise<RpcResult<ManagedUsageRecord[]>>;
  rpc(
    functionName: "release_managed_classification_quota",
    args: { p_workspace_id: string },
  ): Promise<RpcResult<ManagedUsageRecord[]>>;
  rpc(
    functionName: "record_byok_classification_usage",
    args: {
      p_workspace_id: string;
      p_prompt_tokens: number;
      p_completion_tokens: number;
      p_total_tokens: number;
    },
  ): Promise<RpcResult<ByokUsageRecord[]>>;
};

export class QuotaExhaustedError extends Error {
  readonly quota: WorkspaceQuotaStatus;

  constructor(quota: WorkspaceQuotaStatus) {
    super("Workspace monthly classification quota is exhausted.");
    this.name = "QuotaExhaustedError";
    this.quota = quota;
  }
}

function getSupabaseClient(supabase?: QuotaSupabaseClient) {
  return (
    supabase ??
    (createSupabaseAdminClient() as unknown as QuotaSupabaseClient)
  );
}

function assertQuotaRow<
  T extends WorkspaceQuotaStatus | ManagedUsageRecord | ByokUsageRecord,
>(
  row: T | undefined,
  fallbackMessage: string,
) {
  if (!row) {
    throw new Error(fallbackMessage);
  }

  return row;
}

export async function checkWorkspaceQuota({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: QuotaSupabaseClient;
}) {
  const client = getSupabaseClient(supabase);
  const { data, error } = await client.rpc("check_workspace_quota", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to check workspace quota.");
  }

  return assertQuotaRow(data?.[0], "Workspace quota status was not returned.");
}

export async function assertWorkspaceQuotaAvailable({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: QuotaSupabaseClient;
}) {
  const quota = await checkWorkspaceQuota({ workspaceId, supabase });

  if (!quota.has_quota) {
    throw new QuotaExhaustedError(quota);
  }

  return quota;
}

export async function recordManagedClassificationUsage({
  workspaceId,
  usage,
  supabase,
}: {
  workspaceId: string;
  usage: ClassificationUsage | null;
  supabase?: QuotaSupabaseClient;
}) {
  const client = getSupabaseClient(supabase);
  const { data, error } = await client.rpc(
    "record_managed_classification_usage",
    {
      p_workspace_id: workspaceId,
      p_prompt_tokens: usage?.promptTokens ?? 0,
      p_completion_tokens: usage?.completionTokens ?? 0,
      p_total_tokens: usage?.totalTokens ?? 0,
    },
  );

  if (error) {
    throw new Error(
      error.message ?? "Failed to record managed classification usage.",
    );
  }

  return assertQuotaRow(data?.[0], "Managed usage record was not returned.");
}

export async function reserveManagedClassificationQuota({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: QuotaSupabaseClient;
}) {
  const client = getSupabaseClient(supabase);
  const { data, error } = await client.rpc(
    "reserve_managed_classification_quota",
    {
      p_workspace_id: workspaceId,
    },
  );

  if (error) {
    throw new Error(
      error.message ?? "Failed to reserve managed classification quota.",
    );
  }

  const quota = assertQuotaRow(
    data?.[0],
    "Managed quota reservation was not returned.",
  );

  if (!quota.has_quota) {
    throw new QuotaExhaustedError(quota);
  }

  return quota;
}

export async function releaseManagedClassificationQuota({
  workspaceId,
  supabase,
}: {
  workspaceId: string;
  supabase?: QuotaSupabaseClient;
}) {
  const client = getSupabaseClient(supabase);
  const { data, error } = await client.rpc(
    "release_managed_classification_quota",
    {
      p_workspace_id: workspaceId,
    },
  );

  if (error) {
    throw new Error(
      error.message ?? "Failed to release managed classification quota.",
    );
  }

  return assertQuotaRow(
    data?.[0],
    "Managed quota release result was not returned.",
  );
}

export async function recordByokClassificationUsage({
  workspaceId,
  usage,
  supabase,
}: {
  workspaceId: string;
  usage: ClassificationUsage | null;
  supabase?: QuotaSupabaseClient;
}) {
  const client = getSupabaseClient(supabase);
  const { data, error } = await client.rpc("record_byok_classification_usage", {
    p_workspace_id: workspaceId,
    p_prompt_tokens: usage?.promptTokens ?? 0,
    p_completion_tokens: usage?.completionTokens ?? 0,
    p_total_tokens: usage?.totalTokens ?? 0,
  });

  if (error) {
    throw new Error(
      error.message ?? "Failed to record BYOK classification usage.",
    );
  }

  return assertQuotaRow(data?.[0], "BYOK usage record was not returned.");
}

export function getUsagePercent({
  used,
  allocated,
}: {
  used: number;
  allocated: number;
}) {
  if (allocated <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((used / allocated) * 100));
}
