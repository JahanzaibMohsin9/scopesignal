"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteFailedDocumentAction,
  type DeleteDocumentState,
} from "./actions";

const initialState: DeleteDocumentState = {};

type DeleteFailedDocumentButtonProps = {
  documentId: string;
};

export function DeleteFailedDocumentButton({
  documentId,
}: DeleteFailedDocumentButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteFailedDocumentAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="documentId" value={documentId} />
      <Button
        type="submit"
        variant="destructive"
        size="sm"
        disabled={isPending}
        aria-label="Delete failed document"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {isPending ? "Deleting..." : "Delete"}
      </Button>
      {state.error && (
        <p className="max-w-40 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
