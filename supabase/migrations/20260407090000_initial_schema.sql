-- ScopeSignal AI initial schema.
-- Enables the Supabase extensions needed for vector search, queueing, and cron.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pgmq;

set search_path = public, extensions;

create type workspace_tier as enum ('free', 'ltd', 'pro', 'enterprise');
create type document_kind as enum ('proposal', 'addendum');
create type document_status as enum ('uploaded', 'processing', 'indexed', 'failed', 'deleted');
create type alert_status as enum ('open', 'sent_draft', 'false_positive', 'ignored', 'resolved');
create type classification_verdict as enum ('in_scope', 'out_of_scope', 'needs_review');
create type usage_source as enum ('managed', 'byok');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tier workspace_tier not null default 'free',
  allocated_monthly_events integer not null default 100,
  managed_usage_enabled boolean not null default true,
  slack_team_id text unique,
  slack_team_name text,
  slack_bot_user_id text,
  slack_access_token_ciphertext text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_allocated_monthly_events_nonnegative check (allocated_monthly_events >= 0),
  constraint workspaces_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_role_valid check (role in ('owner', 'admin', 'member'))
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  client_name text not null,
  description text,
  effective_date date,
  signed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  proposal_id uuid not null references proposals(id) on delete cascade,
  parent_document_id uuid references documents(id) on delete set null,
  kind document_kind not null default 'proposal',
  status document_status not null default 'uploaded',
  title text not null,
  storage_bucket text not null default 'proposal-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint,
  effective_date date,
  parsed_text text,
  parse_error text,
  deleted_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_file_size_nonnegative check (file_size_bytes is null or file_size_bytes >= 0),
  constraint documents_addendum_parent_required check (kind = 'proposal' or parent_document_id is not null),
  constraint documents_deleted_state_matches_deleted_at check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted')
  )
);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  proposal_id uuid not null references proposals(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  section_title text,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chunks_chunk_index_nonnegative check (chunk_index >= 0),
  constraint chunks_token_count_nonnegative check (token_count is null or token_count >= 0),
  constraint chunks_document_index_unique unique (document_id, chunk_index)
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slack_channel_id text not null,
  name text not null,
  is_private boolean not null default false,
  is_tracked boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channels_workspace_slack_channel_unique unique (workspace_id, slack_channel_id)
);

create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slack_user_id text not null,
  display_name text not null,
  real_name text,
  email text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_contacts_workspace_slack_user_unique unique (workspace_id, slack_user_id)
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  client_contact_id uuid references client_contacts(id) on delete set null,
  proposal_id uuid references proposals(id) on delete set null,
  slack_channel_id text not null,
  slack_message_ts text not null,
  slack_thread_ts text,
  client_message text not null,
  thread_context text,
  verdict classification_verdict not null,
  confidence numeric(5, 4),
  reason text,
  matched_section text,
  matched_chunk_ids uuid[] not null default '{}'::uuid[],
  status alert_status not null default 'open',
  assigned_user_id uuid references users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alerts_confidence_range check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint alerts_workspace_message_unique unique (workspace_id, slack_channel_id, slack_message_ts)
);

create table monthly_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  month_start date not null,
  managed_classification_count integer not null default 0,
  byok_classification_count integer not null default 0,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_usage_workspace_month_unique unique (workspace_id, month_start),
  constraint monthly_usage_counts_nonnegative check (
    managed_classification_count >= 0
    and byok_classification_count >= 0
    and prompt_tokens >= 0
    and completion_tokens >= 0
    and total_tokens >= 0
  )
);

create table usage_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  alert_id uuid references alerts(id) on delete set null,
  source usage_source not null default 'managed',
  provider text not null default 'openai',
  model text not null,
  request_type text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  raw_usage jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  constraint usage_logs_request_type_valid check (request_type in ('embedding', 'classification', 'rerank')),
  constraint usage_logs_tokens_nonnegative check (
    prompt_tokens >= 0
    and completion_tokens >= 0
    and total_tokens >= 0
  )
);

create trigger set_workspaces_updated_at
before update on workspaces
for each row execute function set_updated_at();

create trigger set_users_updated_at
before update on users
for each row execute function set_updated_at();

create trigger set_proposals_updated_at
before update on proposals
for each row execute function set_updated_at();

create trigger set_documents_updated_at
before update on documents
for each row execute function set_updated_at();

create trigger set_chunks_updated_at
before update on chunks
for each row execute function set_updated_at();

create trigger set_channels_updated_at
before update on channels
for each row execute function set_updated_at();

create trigger set_client_contacts_updated_at
before update on client_contacts
for each row execute function set_updated_at();

create trigger set_alerts_updated_at
before update on alerts
for each row execute function set_updated_at();

create trigger set_monthly_usage_updated_at
before update on monthly_usage
for each row execute function set_updated_at();

create index users_workspace_id_idx on users (workspace_id);
create index proposals_workspace_id_idx on proposals (workspace_id);
create index documents_workspace_id_idx on documents (workspace_id);
create index documents_proposal_id_idx on documents (proposal_id);
create index documents_status_idx on documents (status);
create index chunks_workspace_id_idx on chunks (workspace_id);
create index chunks_proposal_id_idx on chunks (proposal_id);
create index chunks_document_id_idx on chunks (document_id);
create index chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100) where embedding is not null and deleted_at is null;
create index channels_workspace_id_idx on channels (workspace_id);
create index channels_tracked_idx on channels (workspace_id, is_tracked);
create index client_contacts_workspace_id_idx on client_contacts (workspace_id);
create index client_contacts_active_idx on client_contacts (workspace_id, is_active);
create index alerts_workspace_id_idx on alerts (workspace_id);
create index alerts_status_idx on alerts (workspace_id, status);
create index monthly_usage_workspace_id_idx on monthly_usage (workspace_id);
create index usage_logs_workspace_created_at_idx on usage_logs (workspace_id, created_at desc);
