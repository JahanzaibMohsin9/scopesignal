import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const DOCUMENT_INDEXING_QUEUE_NAME = "document_indexing_jobs";

export type DocumentIndexingJobPayload = {
  workspace_id: string;
  proposal_id: string;
  document_id: string;
  storage_bucket: string;
  storage_path: string;
};

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

export type DocumentQueueSupabaseClient = {
  rpc(
    functionName: "enqueue_document_indexing_job",
    args: {
      job_payload: DocumentIndexingJobPayload;
      p_idempotency_key: string;
    },
  ): Promise<RpcResult>;
};

export function getDocumentIndexingJobIdempotencyKey(
  payload: Pick<DocumentIndexingJobPayload, "workspace_id" | "document_id">,
) {
  return [payload.workspace_id, payload.document_id].join(":");
}

export async function enqueueDocumentIndexingJob({
  jobPayload,
  supabase,
}: {
  jobPayload: DocumentIndexingJobPayload;
  supabase?: DocumentQueueSupabaseClient;
}) {
  const client =
    supabase ??
    (createSupabaseAdminClient() as unknown as DocumentQueueSupabaseClient);
  const idempotencyKey = getDocumentIndexingJobIdempotencyKey(jobPayload);

  const { data, error } = await client.rpc("enqueue_document_indexing_job", {
    job_payload: jobPayload,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    throw new Error(
      error.message ?? "Failed to enqueue document indexing job.",
    );
  }

  const messageId =
    Array.isArray(data) && data.length > 0 && typeof data[0] === "object"
      ? (data[0] as { message_id?: unknown }).message_id
      : data;

  console.info("document_indexing_queue.enqueued", {
    queue: DOCUMENT_INDEXING_QUEUE_NAME,
    idempotencyKey,
    messageId,
  });

  return {
    idempotencyKey,
    messageId,
  };
}
