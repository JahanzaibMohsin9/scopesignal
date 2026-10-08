import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkDocumentText } from "@/lib/pdf/chunker";

export type PersistDocumentChunksInput = {
  supabase: Pick<SupabaseClient, "from">;
  workspaceId: string;
  proposalId: string;
  documentId: string;
  text: string | null;
};

export type StoredDocumentChunk = {
  id: string;
  chunkIndex: number;
  content: string;
};

export async function persistDocumentChunks({
  supabase,
  workspaceId,
  proposalId,
  documentId,
  text,
}: PersistDocumentChunksInput): Promise<StoredDocumentChunk[]> {
  const chunks = chunkDocumentText(text);

  const { error: deleteError } = await supabase
    .from("chunks")
    .delete()
    .eq("document_id", documentId);

  if (deleteError) {
    throw deleteError;
  }

  if (chunks.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("chunks")
    .insert(
      chunks.map((chunk) => ({
        workspace_id: workspaceId,
        proposal_id: proposalId,
        document_id: documentId,
        section_title: chunk.sectionTitle,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        token_count: chunk.tokenCount,
        metadata: chunk.metadata,
      })),
    )
    .select("id, chunk_index, content");

  if (error) {
    throw error;
  }

  return (data ?? []).map((chunk) => ({
    id: chunk.id as string,
    chunkIndex: chunk.chunk_index as number,
    content: chunk.content as string,
  }));
}
