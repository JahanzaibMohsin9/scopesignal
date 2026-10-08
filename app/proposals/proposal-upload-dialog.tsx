"use client";

import { useActionState, useRef, useState, type DragEvent } from "react";
import { FileText, Loader2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadProposalAction, type UploadProposalState } from "./actions";

const initialState: UploadProposalState = {};

export function ProposalUploadDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [state, formAction, isPending] = useActionState(
    uploadProposalAction,
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
        id="proposals-new-btn"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="h-4 w-4" />
        New Proposal
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
          aria-labelledby="new-proposal-title"
        >
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2
                  id="new-proposal-title"
                  className="text-lg font-semibold text-foreground"
                >
                  New Proposal
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a signed PDF and bind it to client metadata.
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
              <fieldset
                disabled={isPending}
                className="space-y-5 disabled:opacity-70"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      Proposal Name
                    </span>
                    <Input
                      name="proposalName"
                      required
                      placeholder="Master services agreement"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      Client Name
                    </span>
                    <Input name="clientName" required placeholder="Acme Co." />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Description
                  </span>
                  <textarea
                    name="description"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Scope, term, or notes that help identify this proposal"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Effective Date
                  </span>
                  <Input name="effectiveDate" type="date" />
                </label>

                <label
                  className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:bg-muted/40"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                >
                  <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
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
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload Proposal"
                    )}
                  </Button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
