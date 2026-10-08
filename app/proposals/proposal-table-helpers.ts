export type ProposalDocumentRow = {
  id: string;
  proposal_id: string;
  parent_document_id: string | null;
  title: string;
  file_name: string;
  file_size_bytes: number | null;
  status: string;
  kind: "proposal" | "addendum";
  effective_date: string | null;
  created_at: string;
  proposals:
    | { name: string; client_name: string }
    | { name: string; client_name: string }[]
    | null;
};

export type ProposalStatusVariant =
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "info";

const proposalStatusLabels: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  indexed: "Indexed",
  failed: "Failed",
};

export function organizeDocuments(
  documents: ProposalDocumentRow[],
): ProposalDocumentRow[] {
  const proposals = documents
    .filter((document) => document.kind === "proposal")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const addendums = documents
    .filter((document) => document.kind === "addendum")
    .sort(compareDocumentsByEffectiveDate);

  const organized: ProposalDocumentRow[] = [];
  for (const parent of proposals) {
    organized.push(parent);
    organized.push(
      ...addendums.filter((a) => a.parent_document_id === parent.id),
    );
  }

  // push any orphaned addendums at the bottom just in case
  for (const addendum of addendums) {
    if (!organized.some((d) => d.id === addendum.id)) {
      organized.push(addendum);
    }
  }

  return organized;
}

function compareDocumentsByEffectiveDate(
  a: ProposalDocumentRow,
  b: ProposalDocumentRow,
) {
  const aDate = a.effective_date ?? a.created_at;
  const bDate = b.effective_date ?? b.created_at;
  const dateComparison = new Date(aDate).getTime() - new Date(bDate).getTime();

  if (dateComparison !== 0) {
    return dateComparison;
  }

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function formatProposalFileSize(bytes: number | null) {
  if (!bytes) return "-";

  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function formatProposalDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function proposalStatusVariant(status: string): ProposalStatusVariant {
  if (status === "indexed") return "success";
  if (status === "processing") return "warning";
  if (status === "failed") return "destructive";
  if (status === "uploaded") return "info";
  return "secondary";
}

export function formatProposalStatus(status: string) {
  return proposalStatusLabels[status] ?? status;
}

export function getProposalForDocument(document: ProposalDocumentRow) {
  return Array.isArray(document.proposals)
    ? document.proposals[0]
    : document.proposals;
}

export function getProposalDocumentStats(documents: ProposalDocumentRow[]) {
  return {
    proposalCount: documents.filter((document) => document.kind === "proposal")
      .length,
    addendumCount: documents.filter((document) => document.kind === "addendum")
      .length,
    indexedCount: documents.filter((document) => document.status === "indexed")
      .length,
  };
}
