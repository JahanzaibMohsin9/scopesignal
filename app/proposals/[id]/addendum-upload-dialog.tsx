"use client";

import { useActionState, useRef, useState, type DragEvent } from "react";
import { FileText, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadAddendumAction, type UploadProposalState } from "../actions";

const initialState: UploadProposalState = {};

interface AddendumUploadDialogProps {
  proposalId: string;
  parentDocumentId: string;
}

export function AddendumUploadDialog({
  proposalId,
  parentDocumentId,
}: AddendumUploadDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [state, formAction, isPending] = useActionState(
    uploadAddendumAction,
    initialState,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  function syncFileName() {
    const file = fileInputRef.current?.files?.[0];
    setFileName(file?.name ?? "");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];

    if (!file || !fileInputRef.current) {
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
    setFileName(file.name);
  }

  return (
    <>
      <Button
        id="add-addendum-btn"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add Addendum
      </Button>

      {state.success && (
        <p className="sr-only" role="status">
          {state.success}
        </p>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-addendum-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2
                  id="add-addendum-title"
                  className="text-lg font-semibold text-foreground"
                >
                  Add Addendum
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload an addendum to supersede older proposal clauses.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={formAction} className="space-y-5 p-5">
              <input type="hidden" name="proposalId" value={proposalId} />
              <input
                type="hidden"
                name="parentDocumentId"
                value={parentDocumentId}
              />

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Addendum Name
                </span>
                <Input
                  name="addendumName"
                  required
                  placeholder="Website Phase 2 Addendum"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Effective Date
                </span>
                <Input name="effectiveDate" type="date" required />
                <p className="text-xs text-muted-foreground">
                  Required. Establishes priority relative to the base proposal.
                </p>
              </label>

              <label
                className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-6 text-center transition-colors hover:bg-muted/40"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <Upload className="mb-3 h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Drop a PDF here or choose a file
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  PDF only, 20MB maximum
                </span>
                {fileName && (
                  <span className="mt-3 inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-xs text-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {fileName}
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  name="pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  className="sr-only"
                  onChange={syncFileName}
                />
              </label>

              {state.error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}

              {state.success && (
                <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-400">
                  {state.success}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Uploading..." : "Upload Addendum"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
