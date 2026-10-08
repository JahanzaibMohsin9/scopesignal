import { notFound } from "next/navigation";
import Link from "next/link";
import { FileText, ChevronLeft, CornerDownRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ensureUserWorkspace } from "@/lib/auth/workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AddendumUploadDialog } from "./addendum-upload-dialog";
import { DeleteFailedDocumentButton } from "../delete-failed-document-button";
import {
  formatProposalDate,
  formatProposalFileSize,
  formatProposalStatus,
  organizeDocuments,
  proposalStatusVariant,
  type ProposalDocumentRow,
} from "../proposal-table-helpers";

export const metadata = {
  title: "Proposal Details - ScopeSignal",
  description: "View proposal details and manage addendums.",
};

export const runtime = "nodejs";

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureUserWorkspace({ user });
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProposalDetailPage({ params }: Props) {
  const { id } = await params;
  const workspaceId = await getWorkspaceId();

  if (!workspaceId) {
    return notFound();
  }

  const adminSupabase = createSupabaseAdminClient();

  const { data: proposal } = await adminSupabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!proposal) {
    return notFound();
  }

  const { data } = await adminSupabase
    .from("documents")
    .select(
      "id, proposal_id, parent_document_id, title, file_name, file_size_bytes, status, kind, effective_date, created_at, proposals(name, client_name)",
    )
    .eq("proposal_id", id)
    .is("deleted_at", null);

  const rawDocuments = (data ?? []) as unknown as ProposalDocumentRow[];
  const documents = organizeDocuments(rawDocuments);

  // The primary logic: the base document is the one with kind='proposal'
  const baseDocument = documents.find((doc) => doc.kind === "proposal");

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 gap-1 text-muted-foreground"
        >
          <Link href="/proposals">
            <ChevronLeft className="h-4 w-4" />
            Back to Proposals
          </Link>
        </Button>
      </div>

      <PageHeader
        icon={FileText}
        title={proposal.name}
        description={`Client: ${proposal.client_name}`}
        actions={
          baseDocument ? (
            <AddendumUploadDialog
              proposalId={proposal.id}
              parentDocumentId={baseDocument.id}
            />
          ) : null
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border/60 md:col-span-1 border-dashed bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm">Proposal Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Client
              </p>
              <p className="font-medium text-sm mt-0.5">
                {proposal.client_name}
              </p>
            </div>
            {proposal.description && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Description
                </p>
                <p className="text-sm mt-0.5">{proposal.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Created
              </p>
              <p className="text-sm mt-0.5">
                {formatProposalDate(proposal.created_at)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription className="text-sm">
              The base contract and its chronologically enforced addendums.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {documents.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No active documents found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const isAddendum = doc.kind === "addendum";
                    return (
                      <TableRow
                        key={doc.id}
                        className={isAddendum ? "bg-muted/10 group" : ""}
                      >
                        <TableCell
                          className={isAddendum ? "pl-8 relative" : ""}
                        >
                          {isAddendum && (
                            <div className="absolute left-3 top-4">
                              <CornerDownRight className="h-4 w-4 text-muted-foreground/60" />
                            </div>
                          )}
                          <div className="max-w-[200px] truncate font-medium text-foreground text-sm">
                            {doc.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {doc.file_name} (
                            {formatProposalFileSize(doc.file_size_bytes)})
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              isAddendum ? "" : "bg-primary/5 border-primary/20"
                            }
                          >
                            {isAddendum ? "Addendum" : "Base Contract"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatProposalDate(doc.effective_date)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatProposalDate(doc.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={proposalStatusVariant(doc.status)}>
                            {formatProposalStatus(doc.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {doc.status === "failed" ? (
                            <DeleteFailedDocumentButton documentId={doc.id} />
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
