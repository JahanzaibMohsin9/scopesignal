import { describe, expect, it } from "vitest";
import {
  formatProposalDate,
  formatProposalFileSize,
  formatProposalStatus,
  getProposalDocumentStats,
  getProposalForDocument,
  organizeDocuments,
  proposalStatusVariant,
  type ProposalDocumentRow,
} from "./proposal-table-helpers";

function document(
  overrides: Partial<ProposalDocumentRow> = {},
): ProposalDocumentRow {
  return {
    id: "document-1",
    proposal_id: "proposal-1",
    parent_document_id: null,
    title: "Master Services Agreement",
    file_name: "msa.pdf",
    file_size_bytes: 1_572_864,
    status: "uploaded",
    kind: "proposal",
    effective_date: "2026-04-11",
    created_at: "2026-04-11T00:00:00.000Z",
    proposals: { name: "MSA", client_name: "Acme Co." },
    ...overrides,
  };
}

describe("proposal table helpers", () => {
  it("formats file sizes for proposal documents", () => {
    expect(formatProposalFileSize(null)).toBe("-");
    expect(formatProposalFileSize(1_572_864)).toBe("1.5 MB");
    expect(formatProposalFileSize(12 * 1024 * 1024)).toBe("12 MB");
  });

  it("formats upload dates consistently", () => {
    expect(formatProposalDate("2026-04-11T00:00:00.000Z")).toBe("Apr 11, 2026");
    expect(formatProposalDate(null)).toBe("-");
  });

  it("maps document statuses to badge variants", () => {
    expect(proposalStatusVariant("indexed")).toBe("success");
    expect(proposalStatusVariant("processing")).toBe("warning");
    expect(proposalStatusVariant("uploaded")).toBe("info");
    expect(proposalStatusVariant("failed")).toBe("destructive");
  });

  it("formats document statuses for display", () => {
    expect(formatProposalStatus("uploaded")).toBe("Uploaded");
    expect(formatProposalStatus("processing")).toBe("Processing");
    expect(formatProposalStatus("indexed")).toBe("Indexed");
    expect(formatProposalStatus("failed")).toBe("Failed");
  });

  it("normalizes joined proposal data from object or array shapes", () => {
    expect(getProposalForDocument(document())?.client_name).toBe("Acme Co.");
    expect(
      getProposalForDocument(
        document({ proposals: [{ name: "Retainer", client_name: "Globex" }] }),
      )?.name,
    ).toBe("Retainer");
  });

  it("counts proposals, addendums, and indexed documents", () => {
    expect(
      getProposalDocumentStats([
        document({ id: "1", kind: "proposal", status: "uploaded" }),
        document({ id: "2", kind: "proposal", status: "indexed" }),
        document({ id: "3", kind: "addendum", status: "indexed" }),
      ]),
    ).toEqual({
      proposalCount: 2,
      addendumCount: 1,
      indexedCount: 2,
    });
  });

  it("nests addendums beneath their parent proposal by effective date", () => {
    const baseProposal = document({ id: "base", kind: "proposal" });
    const laterAddendum = document({
      id: "later",
      kind: "addendum",
      parent_document_id: "base",
      effective_date: "2026-05-01",
      created_at: "2026-04-12T00:00:00.000Z",
    });
    const earlierAddendum = document({
      id: "earlier",
      kind: "addendum",
      parent_document_id: "base",
      effective_date: "2026-04-15",
      created_at: "2026-04-13T00:00:00.000Z",
    });

    expect(
      organizeDocuments([laterAddendum, earlierAddendum, baseProposal]),
    ).toEqual([baseProposal, earlierAddendum, laterAddendum]);
  });
});
