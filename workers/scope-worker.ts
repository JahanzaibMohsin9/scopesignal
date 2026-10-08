import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { retrieveRelevantChunks } from "@/lib/retrieval/vector-retriever";
import {
  classifyScopeForAlert,
  persistClassificationAlert,
} from "@/lib/openai/classification-result";
import { sendScopeAlertEmail } from "@/lib/email/alert-notifications";
import { buildSlackThreadContextForJob } from "@/lib/slack/thread-context";
import { sendScopeAlertSlackDm } from "@/lib/slack/alert-notifications";
import { sendQuotaThresholdSlackDm } from "@/lib/slack/quota-notifications";
import type { SlackAnalysisJobPayload } from "@/lib/slack/event-queue";
import {
  QuotaExhaustedError,
  releaseManagedClassificationQuota,
  recordByokClassificationUsage,
  recordManagedClassificationUsage,
  reserveManagedClassificationQuota,
  type ManagedUsageRecord,
} from "@/lib/usage/quota";
import {
  isInvalidOpenAiApiKeyError,
  markWorkspaceOpenAiApiKeyInvalid,
  resolveWorkspaceOpenAiCredentials,
} from "@/lib/openai/byok";
import { classifyScope } from "@/lib/openai/classification";
import {
  createEmbeddings,
  createOpenAiEmbeddingClient,
} from "@/lib/openai/embeddings";

const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 30;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_IDLE_DELAY_MS = 2_000;

export type ScopeWorkerJob = {
  message_id: number;
  read_count: number;
  enqueued_at: string;
  visibility_until: string;
  payload: SlackAnalysisJobPayload;
};

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export type ScopeWorkerSupabaseClient = {
  rpc(
    functionName: "read_scopesignal_job",
    args: { visibility_timeout_seconds: number },
  ): Promise<RpcResult<ScopeWorkerJob[]>>;
  rpc(
    functionName: "complete_scopesignal_job",
    args: { p_message_id: number },
  ): Promise<RpcResult<boolean>>;
  rpc(
    functionName: "fail_scopesignal_job",
    args: {
      p_message_id: number;
      p_payload: SlackAnalysisJobPayload;
      p_read_count: number;
      p_error: string;
      p_max_attempts: number;
    },
  ): Promise<
    RpcResult<{ action: "retry" | "dlq"; dlq_message_id: number | null }[]>
  >;
};

export type ScopeJobProcessor = (job: ScopeWorkerJob) => Promise<void>;

export type ProcessNextJobOptions = {
  supabase?: ScopeWorkerSupabaseClient;
  processor?: ScopeJobProcessor;
  visibilityTimeoutSeconds?: number;
  maxAttempts?: number;
};

export type ProcessNextJobResult =
  | { status: "idle" }
  | { status: "completed"; messageId: number }
  | {
      status: "quota_exhausted";
      messageId: number;
      workspaceId: string;
      used: number;
      allocated: number;
    }
  | { status: "retry"; messageId: number; error: string }
  | {
      status: "dlq";
      messageId: number;
      dlqMessageId: number | null;
      error: string;
    };

function getSupabaseClient(supabase?: ScopeWorkerSupabaseClient) {
  return (
    supabase ??
    (createSupabaseAdminClient() as unknown as ScopeWorkerSupabaseClient)
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function shouldLogSensitiveWorkerDetails() {
  return process.env.SCOPESIGNAL_VERBOSE_WORKER_LOGS === "true";
}

export async function processScopeJob(job: ScopeWorkerJob) {
  const context = await buildSlackThreadContextForJob({
    jobPayload: job.payload,
  });
  let credentials = await resolveWorkspaceOpenAiCredentials({
    workspaceId: job.payload.workspace_id,
  });
  let quotaReservation: ManagedUsageRecord | null = null;
  let hasManagedQuotaReservation = false;
  let byokFallback:
    | {
        previousKeyLastFour: string | null;
        error: string;
      }
    | null = null;

  const runAnalysis = async () => {
    if (credentials.source === "managed" && !quotaReservation) {
      quotaReservation = await reserveManagedClassificationQuota({
        workspaceId: job.payload.workspace_id,
      });
      hasManagedQuotaReservation = true;
    }

    const embeddingClient = createOpenAiEmbeddingClient(credentials.apiKey);
    const retrieval = await retrieveRelevantChunks({
      workspaceId: job.payload.workspace_id,
      message: job.payload.text,
      embedder: (input) => createEmbeddings(input, embeddingClient),
      usageSource: credentials.source,
    });
    const classification = await classifyScopeForAlert({
      workspaceId: job.payload.workspace_id,
      clientMessage: job.payload.text,
      threadContext: context.transcript,
      chunks: retrieval.chunks,
      classifier: ({ input }) =>
        classifyScope({
          input,
          apiKey: credentials.apiKey,
          usageSource: credentials.source,
        }),
    });

    return { retrieval, classification };
  };

  try {
    let retrieval;
    let classification;

    try {
      ({ retrieval, classification } = await runAnalysis());
    } catch (error) {
      if (credentials.source !== "byok" || !isInvalidOpenAiApiKeyError(error)) {
        throw error;
      }

      byokFallback = {
        previousKeyLastFour: credentials.keyLastFour,
        error: getErrorMessage(error),
      };

      const invalidation = await markWorkspaceOpenAiApiKeyInvalid({
        workspaceId: job.payload.workspace_id,
      });

      if (!invalidation.ok) {
        throw new Error(invalidation.error);
      }

      console.warn("scope_worker.byok_fallback_to_managed", {
        messageId: job.message_id,
        workspaceId: job.payload.workspace_id,
        previousKeyLastFour: credentials.keyLastFour,
        error: byokFallback.error,
      });

      credentials = await resolveWorkspaceOpenAiCredentials({
        workspaceId: job.payload.workspace_id,
      });

      ({ retrieval, classification } = await runAnalysis());
    }

    const alertValues = await persistClassificationAlert({
      jobPayload: job.payload,
      outcome: classification,
      chunks: retrieval.chunks,
      retrievalTrace: retrieval.trace,
    });
    const usageRecord =
      credentials.source === "byok"
        ? await recordByokClassificationUsage({
            workspaceId: job.payload.workspace_id,
            usage: classification.usage,
          })
        : await recordManagedClassificationUsage({
            workspaceId: job.payload.workspace_id,
            usage: classification.usage,
          });

    if (credentials.source === "managed") {
      hasManagedQuotaReservation = false;
    }

    const quotaUsageForDelivery = quotaReservation as ManagedUsageRecord | null;
    const quotaNotificationToSend = quotaUsageForDelivery
      ? quotaUsageForDelivery.notification_to_send
      : null;
    const quotaDelivery = quotaNotificationToSend
      ? await sendQuotaThresholdSlackDm({
          usage: quotaUsageForDelivery as ManagedUsageRecord,
        })
      : null;
    const alertDelivery = await (async () => {
      if (alertValues.verdict === "in_scope") {
        console.info("slack_alert_delivery.skipped", {
          alertId: alertValues.id,
          workspaceId: alertValues.workspace_id,
          verdict: alertValues.verdict,
        });
        return null;
      }

      if (!alertValues.id) {
        console.warn("slack_alert_delivery.skipped_missing_alert_id", {
          workspaceId: alertValues.workspace_id,
          verdict: alertValues.verdict,
        });
        return null;
      }

      return sendScopeAlertSlackDm({
        alert: alertValues,
        chunks: retrieval.chunks,
      });
    })();
    const emailDelivery = await (async () => {
      if (alertValues.verdict === "in_scope" || !alertValues.id) {
        return null;
      }

      const trigger =
        alertDelivery && !alertDelivery.ok ? "slack_failed" : "opt_in";

      return sendScopeAlertEmail({
        alert: alertValues,
        chunks: retrieval.chunks,
        trigger,
      });
    })();

    if (classification.edgeCases.length > 0) {
      console.info("scope_worker.classification.edge_case", {
        messageId: job.message_id,
        workspaceId: job.payload.workspace_id,
        edgeCases: classification.edgeCases,
        verdict: classification.output.verdict,
      });
    }

    const verboseWorkerLogs = shouldLogSensitiveWorkerDetails();

    console.info("scope_worker.processing.result", {
      messageId: job.message_id,
      workspaceId: job.payload.workspace_id,
      slackChannelId: job.payload.slack_channel_id,
      messageTs: job.payload.message_ts,
      contextSource: context.source,
      contextMessageCount: context.messages.length,
      targetFound: context.targetFound,
      warning: context.warning,
      transcript: verboseWorkerLogs ? context.transcript : "[redacted]",
      retrievedChunkCount: retrieval.chunks.length,
      retrievedChunkIds: verboseWorkerLogs
        ? retrieval.chunks.map((chunk) => chunk.id)
        : "[redacted]",
      retrievalTrace: verboseWorkerLogs ? retrieval.trace : "[redacted]",
      classification: verboseWorkerLogs
        ? classification.output
        : {
            verdict: classification.output.verdict,
            confidence: classification.output.confidence,
            needsHumanReview: classification.output.needs_human_review,
          },
      classificationModel: classification.model,
      openAiCredentialSource: credentials.source,
      byokFallback,
      classificationUsage: classification.usage
        ? {
            promptTokens: classification.usage.promptTokens,
            completionTokens: classification.usage.completionTokens,
            totalTokens: classification.usage.totalTokens,
            requestId: classification.usage.requestId,
          }
        : null,
      persistedAlert: {
        id: alertValues.id,
        verdict: alertValues.verdict,
        confidence: alertValues.confidence,
        matchedChunkIds: alertValues.matched_chunk_ids,
      },
      alertDelivery,
      emailDelivery,
      quotaUsage: {
        managedClassificationCount: usageRecord.managed_classification_count,
        allocatedMonthlyEvents: usageRecord.allocated_monthly_events,
        remainingEvents:
          "remaining_events" in usageRecord ? usageRecord.remaining_events : null,
        byokClassificationCount:
          "byok_classification_count" in usageRecord
            ? usageRecord.byok_classification_count
            : null,
        notificationToSend: quotaNotificationToSend,
        quotaDelivery,
      },
    });
  } catch (error) {
    if (hasManagedQuotaReservation) {
      try {
        await releaseManagedClassificationQuota({
          workspaceId: job.payload.workspace_id,
        });
      } catch (releaseError) {
        console.error("scope_worker.quota_release_failed", {
          messageId: job.message_id,
          workspaceId: job.payload.workspace_id,
          error: getErrorMessage(releaseError),
        });
      }
      hasManagedQuotaReservation = false;
    }

    throw error;
  }
}

export async function processNextScopeJob({
  supabase,
  processor = processScopeJob,
  visibilityTimeoutSeconds = DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: ProcessNextJobOptions = {}): Promise<ProcessNextJobResult> {
  const client = getSupabaseClient(supabase);
  const { data: jobs, error: readError } = await client.rpc(
    "read_scopesignal_job",
    {
      visibility_timeout_seconds: visibilityTimeoutSeconds,
    },
  );

  if (readError) {
    throw new Error(readError.message ?? "Failed to read scope worker job.");
  }

  const job = jobs?.[0];

  if (!job) {
    console.info("scope_worker.idle");
    return { status: "idle" };
  }

  console.info("scope_worker.picked_up", {
    messageId: job.message_id,
    readCount: job.read_count,
    visibilityUntil: job.visibility_until,
    workspaceId: job.payload.workspace_id,
    messageTs: job.payload.message_ts,
  });

  try {
    console.info("scope_worker.processing", {
      messageId: job.message_id,
      workspaceId: job.payload.workspace_id,
    });
    await processor(job);

    const { error: completeError } = await client.rpc(
      "complete_scopesignal_job",
      { p_message_id: job.message_id },
    );

    if (completeError) {
      throw new Error(
        completeError.message ?? "Failed to acknowledge completed job.",
      );
    }

    console.info("scope_worker.completed", {
      messageId: job.message_id,
    });
    return { status: "completed", messageId: job.message_id };
  } catch (error) {
    if (error instanceof QuotaExhaustedError) {
      const { error: completeError } = await client.rpc(
        "complete_scopesignal_job",
        { p_message_id: job.message_id },
      );

      if (completeError) {
        throw new Error(
          completeError.message ?? "Failed to acknowledge quota-exhausted job.",
        );
      }

      console.warn("scope_worker.quota_exhausted", {
        messageId: job.message_id,
        workspaceId: job.payload.workspace_id,
        managedClassificationCount: error.quota.managed_classification_count,
        allocatedMonthlyEvents: error.quota.allocated_monthly_events,
      });

      return {
        status: "quota_exhausted",
        messageId: job.message_id,
        workspaceId: job.payload.workspace_id,
        used: error.quota.managed_classification_count,
        allocated: error.quota.allocated_monthly_events,
      };
    }

    const errorMessage = getErrorMessage(error);
    const { data: failureRows, error: failError } = await client.rpc(
      "fail_scopesignal_job",
      {
        p_message_id: job.message_id,
        p_payload: job.payload,
        p_read_count: job.read_count,
        p_error: errorMessage,
        p_max_attempts: maxAttempts,
      },
    );

    if (failError) {
      throw new Error(failError.message ?? "Failed to nack failed job.");
    }

    const failure = failureRows?.[0];
    const action = failure?.action ?? "retry";

    if (action === "dlq") {
      console.error("scope_worker.dlq", {
        messageId: job.message_id,
        dlqMessageId: failure?.dlq_message_id ?? null,
        readCount: job.read_count,
        error: errorMessage,
      });
      return {
        status: "dlq",
        messageId: job.message_id,
        dlqMessageId: failure?.dlq_message_id ?? null,
        error: errorMessage,
      };
    }

    console.warn("scope_worker.failed_retry", {
      messageId: job.message_id,
      readCount: job.read_count,
      maxAttempts,
      error: errorMessage,
    });
    return {
      status: "retry",
      messageId: job.message_id,
      error: errorMessage,
    };
  }
}

export async function runScopeWorkerLoop({
  supabase,
  processor,
  visibilityTimeoutSeconds = DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  once = false,
}: ProcessNextJobOptions & {
  idleDelayMs?: number;
  once?: boolean;
} = {}) {
  do {
    const result = await processNextScopeJob({
      supabase,
      processor,
      visibilityTimeoutSeconds,
      maxAttempts,
    });

    if (once) {
      return result;
    }

    if (result.status === "idle") {
      await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
    }
  } while (true);
}

if (process.argv[1]?.endsWith("scope-worker.ts")) {
  const once = process.argv.includes("--once");

  runScopeWorkerLoop({ once }).catch((error) => {
    console.error("scope_worker.crashed", {
      error: getErrorMessage(error),
    });
    process.exitCode = 1;
  });
}
