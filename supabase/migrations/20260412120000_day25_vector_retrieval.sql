-- Day 25: workspace-scoped vector retrieval for contract chunks.

set search_path = public, extensions;

create or replace function public.match_chunks(
  p_workspace_id uuid,
  query_embedding vector(1536),
  match_count integer default 10,
  similarity_threshold double precision default null
)
returns table (
  chunk_id uuid,
  workspace_id uuid,
  proposal_id uuid,
  document_id uuid,
  document_title text,
  document_kind document_kind,
  document_effective_date date,
  proposal_name text,
  client_name text,
  section_title text,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id as chunk_id,
    c.workspace_id,
    c.proposal_id,
    c.document_id,
    d.title as document_title,
    d.kind as document_kind,
    d.effective_date as document_effective_date,
    p.name as proposal_name,
    p.client_name,
    c.section_title,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  inner join public.documents d
    on d.id = c.document_id
    and d.workspace_id = c.workspace_id
    and d.proposal_id = c.proposal_id
  inner join public.proposals p
    on p.id = c.proposal_id
    and p.workspace_id = c.workspace_id
  where c.workspace_id = p_workspace_id
    and c.embedding is not null
    and c.deleted_at is null
    and d.deleted_at is null
    and d.status = 'indexed'
    and (
      similarity_threshold is null
      or 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    )
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 0);
$$;

revoke all on function public.match_chunks(uuid, vector(1536), integer, double precision) from public;
grant execute on function public.match_chunks(uuid, vector(1536), integer, double precision) to authenticated;
grant execute on function public.match_chunks(uuid, vector(1536), integer, double precision) to service_role;
