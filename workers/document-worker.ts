import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { indexDocumentChunks } from "@/lib/pdf/document-indexer";
import { parsePdfForReview } from "@/lib/pdf/document-text";
import type { DocumentIndexingJobPayload } from "@/lib/pdf/document-queue";
import { resolveWorkspaceOpenAiCredentials } from "@/lib/openai/byok";

const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 120;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_IDLE_DELAY_MS = 2_000;

export type DocumentWorkerJob = {
  message_id: number;
  read_count: number;
  enqueued_at: string;
  visibility_until: string;
  payload: DocumentIndexingJobPayload;
};

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export type DocumentWorkerSupabaseClient = Pick<SupabaseClient, "from"> & {
  rpc(
    functionName: "read_document_indexing_job",
    args: { visibility_timeout_seconds: number },
  ): Promise<RpcResult<DocumentWorkerJob[]>>;
  rpc(
    functionName: "complete_document_indexing_job",
    args: { p_message_id: number },
  ): Promise<RpcResult<boolean>>;
  rpc(
    functionName: "fail_document_indexing_job",
    args: {
      p_message_id: number;
      p_payload: DocumentIndexingJobPayload;
      p_read_count: number;
      p_error: string;
      p_max_attempts: number;
    },
  ): Promise<
    RpcResult<{ action: "retry" | "dlq"; dlq_message_id: number | null }[]>
  >;
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{
        data: Blob | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export type DocumentJobProcessor = (job: DocumentWorkerJob) => Promise<void>;

export type ProcessNextDocumentJobOptions = {
  supabase?: DocumentWorkerSupabaseClient;
  processor?: DocumentJobProcessor;
  visibilityTimeoutSeconds?: number;
  maxAttempts?: number;
};

export type ProcessNextDocumentJobResult =
  | { status: "idle" }
  | { status: "completed"; messageId: number }
  | { status: "retry"; messageId: number; error: string }
  | {
      status: "dlq";
      messageId: number;
      dlqMessageId: number | null;
      error: string;
    };

function getSupabaseClient(supabase?: DocumentWorkerSupabaseClient) {
  return (
    supabase ??
    (createSupabaseAdminClient() as unknown as DocumentWorkerSupabaseClient)
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function updateDocumentFailure(
  supabase: DocumentWorkerSupabaseClient,
  documentId: string,
  errorMessage: string,
) {
  const { error } = await supabase
    .from("documents")
    .update({ status: "failed", parse_error: errorMessage })
    .eq("id", documentId);

  if (error) {
    throw new Error(error.message ?? "Failed to mark document as failed.");
  }
}

async function updateDocumentProcessing(
  supabase: DocumentWorkerSupabaseClient,
  documentId: string,
) {
  const { error } = await supabase
    .from("documents")
    .update({ status: "processing", parse_error: null })
    .eq("id", documentId);

  if (error) {
    throw new Error(error.message ?? "Failed to mark document as processing.");
  }
}

async function processDocumentIndexingJob(
  job: DocumentWorkerJob,
  supabase: DocumentWorkerSupabaseClient,
) {
  const { payload } = job;
  await updateDocumentProcessing(supabase, payload.document_id);

  const { data: file, error: downloadError } = await supabase.storage
    .from(payload.storage_bucket)
    .download(payload.storage_path);

  if (downloadError || !file) {
    throw new Error(
      downloadError?.message ?? "Could not download document from storage.",
    );
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const parsedDocument = await parsePdfForReview(fileBytes);
  const credentials = await resolveWorkspaceOpenAiCredentials({
    workspaceId: payload.workspace_id,
  });

  if (!parsedDocument.parsedText) {
    throw new Error(
      parsedDocument.parseError
        ? `Could not extract readable text from PDF: ${parsedDocument.parseError}`
        : "Could not extract readable text from PDF.",
    );
  }

  const { error: updateError } = await supabase
    .from("documents")
    .update({
      parsed_text: parsedDocument.parsedText,
      parse_error: parsedDocument.parseError,
    })
    .eq("id", payload.document_id);

  if (updateError) {
    throw new Error(
      updateError.message ?? "Failed to save parsed document text.",
    );
  }

  await indexDocumentChunks({
    supabase,
    workspaceId: payload.workspace_id,
    proposalId: payload.proposal_id,
    documentId: payload.document_id,
    text: parsedDocument.parsedText,
    credentialSource: credentials.source,
    apiKey: credentials.apiKey,
  });
}

export async function processNextDocumentJob({
  supabase,
  processor,
  visibilityTimeoutSeconds = DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: ProcessNextDocumentJobOptions = {}): Promise<ProcessNextDocumentJobResult> {
  const client = getSupabaseClient(supabase);
  const { data: jobs, error: readError } = await client.rpc(
    "read_document_indexing_job",
    {
      visibility_timeout_seconds: visibilityTimeoutSeconds,
    },
  );

  if (readError) {
    throw new Error(
      readError.message ?? "Failed to read document indexing job.",
    );
  }

  const job = jobs?.[0];

  if (!job) {
    console.info("document_worker.idle");
    return { status: "idle" };
  }

  console.info("document_worker.picked_up", {
    messageId: job.message_id,
    readCount: job.read_count,
    visibilityUntil: job.visibility_until,
    workspaceId: job.payload.workspace_id,
    documentId: job.payload.document_id,
  });

  try {
    await (
      processor ??
      ((pickedJob) => processDocumentIndexingJob(pickedJob, client))
    )(job);

    const { error: completeError } = await client.rpc(
      "complete_document_indexing_job",
      { p_message_id: job.message_id },
    );

    if (completeError) {
      throw new Error(
        completeError.message ?? "Failed to acknowledge completed job.",
      );
    }

    console.info("document_worker.completed", {
      messageId: job.message_id,
    });
    return { status: "completed", messageId: job.message_id };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    if (job.read_count >= maxAttempts) {
      await updateDocumentFailure(
        client,
        job.payload.document_id,
        errorMessage,
      );
    }

    const { data: failureRows, error: failError } = await client.rpc(
      "fail_document_indexing_job",
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
      console.error("document_worker.dlq", {
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

    console.warn("document_worker.failed_retry", {
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

export async function runDocumentWorkerLoop({
  supabase,
  processor,
  visibilityTimeoutSeconds = DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  once = false,
}: ProcessNextDocumentJobOptions & {
  idleDelayMs?: number;
  once?: boolean;
} = {}) {
  do {
    const result = await processNextDocumentJob({
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

if (process.argv[1]?.endsWith("document-worker.ts")) {
  const once = process.argv.includes("--once");

  runDocumentWorkerLoop({ once }).catch((error) => {
    console.error("document_worker.crashed", {
      error: getErrorMessage(error),
    });
    process.exitCode = 1;
  });
}
