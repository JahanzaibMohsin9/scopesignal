"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import {
  enqueueDocumentIndexingJob,
  type DocumentQueueSupabaseClient,
} from "@/lib/pdf/document-queue";

const PROPOSAL_DOCUMENTS_BUCKET = "proposal-documents";
const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

export type UploadProposalState = {
  success?: string;
  error?: string;
};

export type DeleteDocumentState = {
  success?: string;
  error?: string;
};

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureUserWorkspace({ user });
}

function getStringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "proposal.pdf";
}

function isPdfFile(file: File, fileBytes: Uint8Array): boolean {
  if (file.type !== "application/pdf") {
    return false;
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return false;
  }

  const header = fileBytes.slice(0, 5);
  const pdfMagic = [0x25, 0x50, 0x44, 0x46, 0x2d];

  return pdfMagic.every((byte, index) => header[index] === byte);
}

export async function uploadProposalAction(
  _previousState: UploadProposalState,
  formData: FormData,
): Promise<UploadProposalState> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to upload proposals." };
  }

  const proposalName = getStringField(formData, "proposalName");
  const clientName = getStringField(formData, "clientName");
  const description = getStringField(formData, "description");
  const effectiveDate = getStringField(formData, "effectiveDate");
  const file = formData.get("pdf");

  if (!proposalName || !clientName) {
    return { error: "Proposal name and client name are required." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF proposal to upload." };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return { error: "PDF must be 20MB or smaller." };
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());

  if (!isPdfFile(file, fileBytes)) {
    return { error: "Upload a valid PDF file." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: proposal, error: proposalError } = await adminSupabase
    .from("proposals")
    .insert({
      workspace_id: workspaceId,
      name: proposalName,
      client_name: clientName,
      description: description || null,
      effective_date: effectiveDate || null,
    })
    .select("id")
    .single();

  if (proposalError || !proposal?.id) {
    return {
      error: proposalError?.message ?? "Failed to create proposal record.",
    };
  }

  const proposalId = proposal.id as string;
  const safeFileName = sanitizeFileName(file.name);
  const storagePath = `${workspaceId}/${proposalId}/${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await adminSupabase.storage
    .from(PROPOSAL_DOCUMENTS_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    await adminSupabase.from("proposals").delete().eq("id", proposalId);
    return { error: uploadError.message };
  }

  const { data: document, error: documentError } = await adminSupabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      proposal_id: proposalId,
      kind: "proposal",
      status: "uploaded",
      title: proposalName,
      storage_bucket: PROPOSAL_DOCUMENTS_BUCKET,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: "application/pdf",
      file_size_bytes: file.size,
      effective_date: effectiveDate || null,
      parsed_text: null,
      parse_error: null,
    })
    .select("id")
    .single();

  if (documentError || !document?.id) {
    await adminSupabase.storage
      .from(PROPOSAL_DOCUMENTS_BUCKET)
      .remove([storagePath]);
    await adminSupabase.from("proposals").delete().eq("id", proposalId);
    return {
      error: documentError?.message ?? "Failed to create document record.",
    };
  }

  try {
    await enqueueDocumentIndexingJob({
      supabase: adminSupabase as unknown as DocumentQueueSupabaseClient,
      jobPayload: {
        workspace_id: workspaceId,
        proposal_id: proposalId,
        document_id: document.id as string,
        storage_bucket: PROPOSAL_DOCUMENTS_BUCKET,
        storage_path: storagePath,
      },
    });
  } catch (error) {
    await adminSupabase
      .from("documents")
      .update({
        status: "failed",
        parse_error:
          error instanceof Error
            ? `Failed to queue PDF processing: ${error.message}`
            : "Failed to queue PDF processing.",
      })
      .eq("id", document.id as string);
    revalidatePath("/proposals");
    return {
      error:
        error instanceof Error
          ? `Proposal uploaded, but processing could not be queued: ${error.message}`
          : "Proposal uploaded, but processing could not be queued.",
    };
  }

  revalidatePath("/proposals");
  return {
    success: "Proposal uploaded. Processing will continue in the background.",
  };
}

export async function uploadAddendumAction(
  _previousState: UploadProposalState,
  formData: FormData,
): Promise<UploadProposalState> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to upload addendums." };
  }

  const proposalId = getStringField(formData, "proposalId");
  const parentDocumentId = getStringField(formData, "parentDocumentId");
  const addendumName = getStringField(formData, "addendumName");
  const effectiveDate = getStringField(formData, "effectiveDate");
  const file = formData.get("pdf");

  if (!proposalId || !parentDocumentId || !addendumName || !effectiveDate) {
    return {
      error: "All addendum fields are required, including effective date.",
    };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF addendum to upload." };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return { error: "PDF must be 20MB or smaller." };
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());

  if (!isPdfFile(file, fileBytes)) {
    return { error: "Upload a valid PDF file." };
  }

  const adminSupabase = createSupabaseAdminClient();

  // Verify access to parent proposal
  const { data: proposal } = await adminSupabase
    .from("proposals")
    .select("id")
    .eq("id", proposalId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!proposal) {
    return { error: "Invalid proposal or unauthorized." };
  }

  const { data: parentDocument } = await adminSupabase
    .from("documents")
    .select("id")
    .eq("id", parentDocumentId)
    .eq("proposal_id", proposalId)
    .eq("workspace_id", workspaceId)
    .eq("kind", "proposal")
    .is("deleted_at", null)
    .single();

  if (!parentDocument) {
    return { error: "Invalid parent proposal document." };
  }

  const safeFileName = sanitizeFileName(file.name);
  const storagePath = `${workspaceId}/${proposalId}/${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await adminSupabase.storage
    .from(PROPOSAL_DOCUMENTS_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: document, error: documentError } = await adminSupabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      proposal_id: proposalId,
      parent_document_id: parentDocumentId,
      kind: "addendum",
      status: "uploaded",
      title: addendumName,
      storage_bucket: PROPOSAL_DOCUMENTS_BUCKET,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: "application/pdf",
      file_size_bytes: file.size,
      effective_date: effectiveDate, // Addendum effective date is crucial for recency checks
      parsed_text: null,
      parse_error: null,
    })
    .select("id")
    .single();

  if (documentError || !document?.id) {
    await adminSupabase.storage
      .from(PROPOSAL_DOCUMENTS_BUCKET)
      .remove([storagePath]);
    return {
      error: documentError?.message ?? "Failed to create document record.",
    };
  }

  try {
    await enqueueDocumentIndexingJob({
      supabase: adminSupabase as unknown as DocumentQueueSupabaseClient,
      jobPayload: {
        workspace_id: workspaceId,
        proposal_id: proposalId,
        document_id: document.id as string,
        storage_bucket: PROPOSAL_DOCUMENTS_BUCKET,
        storage_path: storagePath,
      },
    });
  } catch (error) {
    await adminSupabase
      .from("documents")
      .update({
        status: "failed",
        parse_error:
          error instanceof Error
            ? `Failed to queue PDF processing: ${error.message}`
            : "Failed to queue PDF processing.",
      })
      .eq("id", document.id as string);
    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposalId}`);
    return {
      error:
        error instanceof Error
          ? `Addendum uploaded, but processing could not be queued: ${error.message}`
          : "Addendum uploaded, but processing could not be queued.",
    };
  }

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposalId}`);
  return {
    success: "Addendum uploaded. Processing will continue in the background.",
  };
}

export async function deleteFailedDocumentAction(
  _previousState: DeleteDocumentState,
  formData: FormData,
): Promise<DeleteDocumentState> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: "You must be signed in to delete documents." };
  }

  const documentId = getStringField(formData, "documentId");
  if (!documentId) {
    return { error: "Choose a failed document to delete." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: document, error: documentError } = await adminSupabase
    .from("documents")
    .select("id, proposal_id, kind, status, storage_path")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (documentError || !document) {
    return {
      error: documentError?.message ?? "Failed document was not found.",
    };
  }

  if (document.status !== "failed") {
    return { error: "Only failed documents can be deleted from this view." };
  }

  const proposalId = document.proposal_id as string;
  const isBaseProposal = document.kind === "proposal";

  let storagePaths: string[];
  try {
    if (isBaseProposal) {
      const proposalDocuments = await getActiveProposalDocuments(
        adminSupabase,
        workspaceId,
        proposalId,
      );
      if (
        proposalDocuments.some(
          (proposalDocument) => proposalDocument.status === "processing",
        )
      ) {
        return {
          error:
            "This proposal still has a document processing. Wait for it to finish before deleting.",
        };
      }

      const { error: markFailedError } = await adminSupabase
        .from("documents")
        .update({
          status: "failed",
          parse_error: "Deleted after base proposal processing failed.",
        })
        .eq("workspace_id", workspaceId)
        .eq("proposal_id", proposalId)
        .is("deleted_at", null);

      if (markFailedError) {
        return { error: markFailedError.message };
      }

      storagePaths = proposalDocuments
        .map((proposalDocument) => proposalDocument.storage_path)
        .filter((storagePath): storagePath is string => Boolean(storagePath));
    } else {
      storagePaths = [document.storage_path as string].filter(Boolean);
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to find proposal files to delete.",
    };
  }

  if (storagePaths.length > 0) {
    const { error: removeError } = await adminSupabase.storage
      .from(PROPOSAL_DOCUMENTS_BUCKET)
      .remove(storagePaths);

    if (removeError) {
      return { error: removeError.message };
    }
  }

  const deleteQuery = isBaseProposal
    ? adminSupabase
        .from("proposals")
        .delete()
        .eq("id", proposalId)
        .eq("workspace_id", workspaceId)
    : adminSupabase
        .from("documents")
        .delete()
        .eq("id", documentId)
        .eq("workspace_id", workspaceId);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    return { error: deleteError.message };
  }

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposalId}`);

  return { success: "Failed document deleted." };
}

async function getActiveProposalDocuments(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
  proposalId: string,
) {
  const { data, error } = await adminSupabase
    .from("documents")
    .select("storage_path, status")
    .eq("workspace_id", workspaceId)
    .eq("proposal_id", proposalId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return (data ?? []).map((document) => ({
    storage_path: document.storage_path as string | null,
    status: document.status as string,
  }));
}
