import Link from "next/link";
import { FileText, CornerDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getWorkspaceSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProposalUploadDialog } from "./proposal-upload-dialog";
import {
  formatProposalDate,
  formatProposalFileSize,
  formatProposalStatus,
  getProposalDocumentStats,
  getProposalForDocument,
  proposalStatusVariant,
  organizeDocuments,
  type ProposalDocumentRow,
} from "./proposal-table-helpers";
import { DocumentStatusRealtime } from "./document-status-realtime";
import { DeleteFailedDocumentButton } from "./delete-failed-document-button";

export const metadata = {
  title: "Proposals - ScopeSignal",
  description: "Manage your uploaded contract proposals and addendums.",
};

export const runtime = "nodejs";

export default async function ProposalsPage() {
  const { workspaceId } = await getWorkspaceSession();
  const adminSupabase = createSupabaseAdminClient();
  const { data } = workspaceId
    ? await adminSupabase
        .from("documents")
        .select(
          "id, proposal_id, parent_document_id, title, file_name, file_size_bytes, status, kind, effective_date, created_at, proposals(name, client_name)",
        )
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  const rawDocuments = (data ?? []) as unknown as ProposalDocumentRow[];
  const documents = organizeDocuments(rawDocuments);
  const { proposalCount, addendumCount, indexedCount } =
    getProposalDocumentStats(documents);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Proposals"
        description="Upload and manage contract proposals that ScopeSignal monitors against."
        actions={<ProposalUploadDialog />}
      />
      {workspaceId && <DocumentStatusRealtime workspaceId={workspaceId} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            id: "proposals-stat-total",
            label: "Total Proposals",
            value: proposalCount.toString(),
          },
          {
            id: "proposals-stat-indexed",
            label: "Indexed",
            value: indexedCount.toString(),
          },
          {
            id: "proposals-stat-addendums",
            label: "Addendums",
            value: addendumCount.toString(),
          },
        ].map(({ id, label, value }) => (
          <Card key={id} id={id} className="border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider">
                {label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card id="proposals-table-card" className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">All Proposals</CardTitle>
            <CardDescription className="mt-0.5 text-sm">
              PDFs uploaded for scope monitoring
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {documents.length} document{documents.length === 1 ? "" : "s"}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="p-6">
              <EmptyState
                id="proposals-empty"
                icon={FileText}
                title="No proposals uploaded yet"
                description="Create a proposal and upload its contract PDF to start monitoring client messages against agreed scope."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <ProposalDocumentTableRow
                    key={document.id}
                    document={document}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProposalDocumentTableRow({
  document,
}: {
  document: ProposalDocumentRow;
}) {
  const proposal = getProposalForDocument(document);
  const isAddendum = document.kind === "addendum";

  return (
    <TableRow className={isAddendum ? "bg-muted/10 group" : ""}>
      <TableCell className={isAddendum ? "pl-8 relative" : ""}>
        {isAddendum && (
          <div className="absolute left-3 top-4">
            <CornerDownRight className="h-4 w-4 text-muted-foreground/60" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <div>
            <Link
              href={`/proposals/${document.proposal_id}`}
              className="font-medium text-foreground hover:underline"
            >
              {isAddendum ? document.title : (proposal?.name ?? document.title)}
            </Link>
            {!isAddendum && (
              <div className="text-xs text-muted-foreground">
                {document.title}
              </div>
            )}
            {isAddendum && (
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Addendum
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>{proposal?.client_name ?? "-"}</TableCell>
      <TableCell>{formatProposalDate(document.effective_date)}</TableCell>
      <TableCell>{formatProposalDate(document.created_at)}</TableCell>
      <TableCell>
        <div className="max-w-48 truncate text-sm">{document.file_name}</div>
        <div className="text-xs text-muted-foreground">
          {formatProposalFileSize(document.file_size_bytes)}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={proposalStatusVariant(document.status)}>
          {formatProposalStatus(document.status)}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {document.status === "failed" ? (
          <DeleteFailedDocumentButton documentId={document.id} />
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  );
}
