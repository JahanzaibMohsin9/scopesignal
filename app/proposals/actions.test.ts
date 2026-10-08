import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFailedDocumentAction, uploadProposalAction } from "./actions";

const {
  revalidatePathMock,
  createSupabaseServerClientMock,
  createSupabaseAdminClientMock,
  ensureUserWorkspaceMock,
  enqueueDocumentIndexingJobMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  ensureUserWorkspaceMock: vi.fn(),
  enqueueDocumentIndexingJobMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/auth/workspace", () => ({
  ensureUserWorkspace: ensureUserWorkspaceMock,
}));

vi.mock("@/lib/pdf/document-queue", () => ({
  enqueueDocumentIndexingJob: enqueueDocumentIndexingJobMock,
}));

type AdminClientOptions = {
  proposalError?: { message: string } | null;
  uploadError?: { message: string } | null;
  documentError?: { message: string } | null;
};

type DeleteAdminClientOptions = {
  document?: {
    id: string;
    proposal_id: string;
    kind: "proposal" | "addendum";
    status: string;
    storage_path: string;
  } | null;
  documentError?: { message: string } | null;
  proposalDocuments?: Array<{ storage_path: string; status?: string }>;
  proposalStoragePaths?: string[];
  proposalStorageError?: { message: string } | null;
  storageRemoveError?: { message: string } | null;
  deleteError?: { message: string } | null;
};

function pdfFile({
  name = "Proposal Draft.pdf",
  type = "application/pdf",
  body = "%PDF-1.7\nbody",
}: {
  name?: string;
  type?: string;
  body?: string;
} = {}) {
  return new File([body], name, { type });
}

function formData(overrides: Record<string, FormDataEntryValue | null> = {}) {
  const data = new FormData();
  data.set("proposalName", "Master Services Agreement");
  data.set("clientName", "Acme Co.");
  data.set("description", "Main scope contract");
  data.set("effectiveDate", "2026-04-11");
  data.set("pdf", pdfFile());

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      data.delete(key);
    } else {
      data.set(key, value);
    }
  }

  return data;
}

function configureAuthenticatedUser(
  workspaceId: string | null = "workspace-1",
) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: workspaceId
            ? { id: "user-1", email: "owner@example.com" }
            : null,
        },
      }),
    },
  });
  ensureUserWorkspaceMock.mockResolvedValue(workspaceId);
}

function createAdminClient(options: AdminClientOptions = {}) {
  const proposalDeleteEqMock = vi.fn().mockResolvedValue({ error: null });
  const proposalDeleteMock = vi.fn(() => ({ eq: proposalDeleteEqMock }));
  const proposalSingleMock = vi.fn().mockResolvedValue({
    data: options.proposalError ? null : { id: "proposal-1" },
    error: options.proposalError ?? null,
  });
  const proposalSelectMock = vi.fn(() => ({ single: proposalSingleMock }));
  const proposalInsertMock = vi.fn(() => ({ select: proposalSelectMock }));

  const documentSingleMock = vi.fn().mockResolvedValue({
    data: options.documentError ? null : { id: "document-1" },
    error: options.documentError ?? null,
  });
  const documentSelectMock = vi.fn(() => ({ single: documentSingleMock }));
  const documentInsertMock = vi.fn(() => ({ select: documentSelectMock }));
  const documentUpdateEqMock = vi.fn().mockResolvedValue({ error: null });
  const documentUpdateMock = vi.fn(() => ({ eq: documentUpdateEqMock }));

  const storageUploadMock = vi.fn().mockResolvedValue({
    error: options.uploadError ?? null,
  });
  const storageRemoveMock = vi.fn().mockResolvedValue({ error: null });
  const storageFromMock = vi.fn(() => ({
    upload: storageUploadMock,
    remove: storageRemoveMock,
  }));

  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === "proposals") {
        return {
          insert: proposalInsertMock,
          delete: proposalDeleteMock,
        };
      }
      if (table === "documents") {
        return {
          insert: documentInsertMock,
          update: documentUpdateMock,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    storage: {
      from: storageFromMock,
    },
  };

  createSupabaseAdminClientMock.mockReturnValue(adminClient);

  return {
    adminClient,
    proposalInsertMock,
    proposalDeleteMock,
    proposalDeleteEqMock,
    documentInsertMock,
    documentUpdateMock,
    documentUpdateEqMock,
    documentSelectMock,
    documentSingleMock,
    storageFromMock,
    storageUploadMock,
    storageRemoveMock,
  };
}

function createDeleteAdminClient(options: DeleteAdminClientOptions = {}) {
  const document = options.document ?? {
    id: "document-1",
    proposal_id: "proposal-1",
    kind: "proposal" as const,
    status: "failed",
    storage_path: "workspace-1/proposal-1/failed.pdf",
  };

  const documentSingleMock = vi.fn().mockResolvedValue({
    data: options.documentError ? null : document,
    error: options.documentError ?? null,
  });
  const documentLookupQuery = {
    eq: vi.fn(() => documentLookupQuery),
    is: vi.fn(() => documentLookupQuery),
    single: documentSingleMock,
  };

  const proposalDocumentsQuery = {
    eq: vi.fn(() => proposalDocumentsQuery),
    is: vi.fn().mockResolvedValue({
      data:
        options.proposalDocuments ??
        (options.proposalStoragePaths ?? [
          "workspace-1/proposal-1/failed.pdf",
        ]).map((storage_path) => ({ storage_path, status: "failed" })),
      error: options.proposalStorageError ?? null,
    }),
  };

  const documentUpdateQuery = {
    eq: vi.fn(() => documentUpdateQuery),
    is: vi.fn().mockResolvedValue({ error: null }),
  };
  const documentUpdateMock = vi.fn(() => documentUpdateQuery);

  const documentDeleteQuery = {
    eq: vi.fn(() => documentDeleteQuery),
    then: vi.fn((resolve) =>
      Promise.resolve({ error: options.deleteError ?? null }).then(resolve),
    ),
  };
  const documentDeleteMock = vi.fn(() => documentDeleteQuery);

  const proposalDeleteQuery = {
    eq: vi.fn(() => proposalDeleteQuery),
    then: vi.fn((resolve) =>
      Promise.resolve({ error: options.deleteError ?? null }).then(resolve),
    ),
  };
  const proposalDeleteMock = vi.fn(() => proposalDeleteQuery);

  const documentSelectMock = vi.fn((columns: string) =>
    columns === "storage_path, status"
      ? proposalDocumentsQuery
      : documentLookupQuery,
  );

  const storageRemoveMock = vi.fn().mockResolvedValue({
    error: options.storageRemoveError ?? null,
  });
  const storageFromMock = vi.fn(() => ({
    remove: storageRemoveMock,
  }));

  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: documentSelectMock,
          update: documentUpdateMock,
          delete: documentDeleteMock,
        };
      }
      if (table === "proposals") {
        return {
          delete: proposalDeleteMock,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    storage: {
      from: storageFromMock,
    },
  };

  createSupabaseAdminClientMock.mockReturnValue(adminClient);

  return {
    documentLookupQuery,
    proposalDocumentsQuery,
    documentDeleteMock,
    documentDeleteQuery,
    documentUpdateMock,
    documentUpdateQuery,
    proposalDeleteMock,
    proposalDeleteQuery,
    storageFromMock,
    storageRemoveMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(1_776_000_000_000);
  configureAuthenticatedUser();
  enqueueDocumentIndexingJobMock.mockResolvedValue({
    idempotencyKey: "workspace-1:document-1",
    messageId: 1,
  });
  createAdminClient();
});

describe("uploadProposalAction", () => {
  it("rejects unauthenticated users", async () => {
    configureAuthenticatedUser(null);

    await expect(uploadProposalAction({}, formData())).resolves.toEqual({
      error: "You must be signed in to upload proposals.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing proposal metadata", async () => {
    await expect(
      uploadProposalAction({}, formData({ proposalName: "" })),
    ).resolves.toEqual({
      error: "Proposal name and client name are required.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing files", async () => {
    await expect(
      uploadProposalAction({}, formData({ pdf: null })),
    ).resolves.toEqual({
      error: "Choose a PDF proposal to upload.",
    });
  });

  it("rejects files over 20MB", async () => {
    const oversizedPdf = new File(
      ["%PDF-", new Uint8Array(20 * 1024 * 1024)],
      "big.pdf",
      {
        type: "application/pdf",
      },
    );

    await expect(
      uploadProposalAction({}, formData({ pdf: oversizedPdf })),
    ).resolves.toEqual({
      error: "PDF must be 20MB or smaller.",
    });
  });

  it("rejects non-PDF MIME types", async () => {
    await expect(
      uploadProposalAction(
        {},
        formData({
          pdf: pdfFile({ name: "proposal.txt", type: "text/plain" }),
        }),
      ),
    ).resolves.toEqual({
      error: "Upload a valid PDF file.",
    });
  });

  it("rejects PDF MIME types without a PDF extension", async () => {
    await expect(
      uploadProposalAction(
        {},
        formData({ pdf: pdfFile({ name: "proposal" }) }),
      ),
    ).resolves.toEqual({
      error: "Upload a valid PDF file.",
    });
  });

  it("rejects files without PDF magic bytes", async () => {
    await expect(
      uploadProposalAction(
        {},
        formData({ pdf: pdfFile({ body: "not a pdf" }) }),
      ),
    ).resolves.toEqual({
      error: "Upload a valid PDF file.",
    });
  });

  it("creates proposal, uploads PDF, queues processing, and revalidates on success", async () => {
    const mocks = createAdminClient();

    await expect(uploadProposalAction({}, formData())).resolves.toEqual({
      success: "Proposal uploaded. Processing will continue in the background.",
    });

    expect(mocks.proposalInsertMock).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      name: "Master Services Agreement",
      client_name: "Acme Co.",
      description: "Main scope contract",
      effective_date: "2026-04-11",
    });
    expect(mocks.storageFromMock).toHaveBeenCalledWith("proposal-documents");
    expect(mocks.storageUploadMock).toHaveBeenCalledWith(
      "workspace-1/proposal-1/1776000000000-proposal-draft.pdf",
      expect.any(Uint8Array),
      {
        contentType: "application/pdf",
        upsert: false,
      },
    );
    expect(mocks.documentInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "workspace-1",
        proposal_id: "proposal-1",
        kind: "proposal",
        status: "uploaded",
        title: "Master Services Agreement",
        storage_bucket: "proposal-documents",
        storage_path: "workspace-1/proposal-1/1776000000000-proposal-draft.pdf",
        file_name: "Proposal Draft.pdf",
        mime_type: "application/pdf",
        effective_date: "2026-04-11",
        parsed_text: null,
        parse_error: null,
      }),
    );
    expect(enqueueDocumentIndexingJobMock).toHaveBeenCalledWith({
      supabase: mocks.adminClient,
      jobPayload: {
        workspace_id: "workspace-1",
        proposal_id: "proposal-1",
        document_id: "document-1",
        storage_bucket: "proposal-documents",
        storage_path: "workspace-1/proposal-1/1776000000000-proposal-draft.pdf",
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
  });

  it("returns proposal insert errors before storage upload", async () => {
    createAdminClient({ proposalError: { message: "insert failed" } });

    await expect(uploadProposalAction({}, formData())).resolves.toEqual({
      error: "insert failed",
    });
  });

  it("deletes the proposal record if storage upload fails", async () => {
    const mocks = createAdminClient({
      uploadError: { message: "bucket missing" },
    });

    await expect(uploadProposalAction({}, formData())).resolves.toEqual({
      error: "bucket missing",
    });
    expect(mocks.proposalDeleteMock).toHaveBeenCalled();
    expect(mocks.proposalDeleteEqMock).toHaveBeenCalledWith("id", "proposal-1");
  });

  it("removes uploaded storage and deletes proposal if document insert fails", async () => {
    const mocks = createAdminClient({
      documentError: { message: "document insert failed" },
    });

    await expect(uploadProposalAction({}, formData())).resolves.toEqual({
      error: "document insert failed",
    });
    expect(mocks.storageRemoveMock).toHaveBeenCalledWith([
      "workspace-1/proposal-1/1776000000000-proposal-draft.pdf",
    ]);
    expect(mocks.proposalDeleteEqMock).toHaveBeenCalledWith("id", "proposal-1");
  });

  it("keeps the uploaded document when queueing fails so failed status can be reviewed", async () => {
    const mocks = createAdminClient();
    enqueueDocumentIndexingJobMock.mockRejectedValue(
      new Error("pgmq unavailable"),
    );

    await expect(uploadProposalAction({}, formData())).resolves.toEqual({
      error:
        "Proposal uploaded, but processing could not be queued: pgmq unavailable",
    });
    expect(mocks.storageRemoveMock).not.toHaveBeenCalled();
    expect(mocks.proposalDeleteEqMock).not.toHaveBeenCalled();
    expect(mocks.documentUpdateMock).toHaveBeenCalledWith({
      status: "failed",
      parse_error: "Failed to queue PDF processing: pgmq unavailable",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
  });
});

describe("deleteFailedDocumentAction", () => {
  it("rejects unauthenticated users", async () => {
    configureAuthenticatedUser(null);

    const data = new FormData();
    data.set("documentId", "document-1");

    await expect(deleteFailedDocumentAction({}, data)).resolves.toEqual({
      error: "You must be signed in to delete documents.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing document ids", async () => {
    await expect(
      deleteFailedDocumentAction({}, new FormData()),
    ).resolves.toEqual({
      error: "Choose a failed document to delete.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("only deletes failed documents", async () => {
    const mocks = createDeleteAdminClient({
      document: {
        id: "document-1",
        proposal_id: "proposal-1",
        kind: "proposal",
        status: "indexed",
        storage_path: "workspace-1/proposal-1/indexed.pdf",
      },
    });
    const data = new FormData();
    data.set("documentId", "document-1");

    await expect(deleteFailedDocumentAction({}, data)).resolves.toEqual({
      error: "Only failed documents can be deleted from this view.",
    });
    expect(mocks.storageRemoveMock).not.toHaveBeenCalled();
    expect(mocks.proposalDeleteMock).not.toHaveBeenCalled();
  });

  it("removes all proposal files and deletes the proposal for failed base documents", async () => {
    const mocks = createDeleteAdminClient({
      proposalStoragePaths: [
        "workspace-1/proposal-1/failed.pdf",
        "workspace-1/proposal-1/addendum.pdf",
      ],
    });
    const data = new FormData();
    data.set("documentId", "document-1");

    await expect(deleteFailedDocumentAction({}, data)).resolves.toEqual({
      success: "Failed document deleted.",
    });
    expect(mocks.storageFromMock).toHaveBeenCalledWith("proposal-documents");
    expect(mocks.storageRemoveMock).toHaveBeenCalledWith([
      "workspace-1/proposal-1/failed.pdf",
      "workspace-1/proposal-1/addendum.pdf",
    ]);
    expect(mocks.proposalDeleteMock).toHaveBeenCalled();
    expect(mocks.proposalDeleteQuery.eq).toHaveBeenCalledWith(
      "id",
      "proposal-1",
    );
    expect(mocks.proposalDeleteQuery.eq).toHaveBeenCalledWith(
      "workspace_id",
      "workspace-1",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-1");
  });

  it("does not remove proposal files while a sibling document is processing", async () => {
    const mocks = createDeleteAdminClient({
      proposalDocuments: [
        {
          storage_path: "workspace-1/proposal-1/failed.pdf",
          status: "failed",
        },
        {
          storage_path: "workspace-1/proposal-1/addendum.pdf",
          status: "processing",
        },
      ],
    });
    const data = new FormData();
    data.set("documentId", "document-1");

    await expect(deleteFailedDocumentAction({}, data)).resolves.toEqual({
      error:
        "This proposal still has a document processing. Wait for it to finish before deleting.",
    });
    expect(mocks.documentUpdateMock).not.toHaveBeenCalled();
    expect(mocks.storageRemoveMock).not.toHaveBeenCalled();
    expect(mocks.proposalDeleteMock).not.toHaveBeenCalled();
  });

  it("marks sibling documents failed before removing base proposal storage", async () => {
    const mocks = createDeleteAdminClient();
    const data = new FormData();
    data.set("documentId", "document-1");

    await expect(deleteFailedDocumentAction({}, data)).resolves.toEqual({
      success: "Failed document deleted.",
    });
    expect(mocks.documentUpdateMock).toHaveBeenCalledWith({
      status: "failed",
      parse_error: "Deleted after base proposal processing failed.",
    });
    expect(mocks.documentUpdateQuery.eq).toHaveBeenCalledWith(
      "workspace_id",
      "workspace-1",
    );
    expect(mocks.documentUpdateQuery.eq).toHaveBeenCalledWith(
      "proposal_id",
      "proposal-1",
    );
  });

  it("removes one file and deletes the document for failed addendums", async () => {
    const mocks = createDeleteAdminClient({
      document: {
        id: "document-2",
        proposal_id: "proposal-1",
        kind: "addendum",
        status: "failed",
        storage_path: "workspace-1/proposal-1/addendum.pdf",
      },
    });
    const data = new FormData();
    data.set("documentId", "document-2");

    await expect(deleteFailedDocumentAction({}, data)).resolves.toEqual({
      success: "Failed document deleted.",
    });
    expect(mocks.storageRemoveMock).toHaveBeenCalledWith([
      "workspace-1/proposal-1/addendum.pdf",
    ]);
    expect(mocks.documentDeleteMock).toHaveBeenCalled();
    expect(mocks.documentDeleteQuery.eq).toHaveBeenCalledWith(
      "id",
      "document-2",
    );
    expect(mocks.documentDeleteQuery.eq).toHaveBeenCalledWith(
      "workspace_id",
      "workspace-1",
    );
    expect(mocks.proposalDeleteMock).not.toHaveBeenCalled();
  });
});
