-- Move PDF parsing and embedding out of upload server actions.

set search_path = public, extensions;

select pgmq.create('document_indexing_jobs')
where not exists (
  select 1
  from pgmq.meta
  where queue_name = 'document_indexing_jobs'
);

select pgmq.create('document_indexing_jobs_dlq')
where not exists (
  select 1
  from pgmq.meta
  where queue_name = 'document_indexing_jobs_dlq'
);

create table if not exists public.document_indexing_job_idempotency (
  idempotency_key text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  queue_name text not null default 'document_indexing_jobs',
  message_id bigint,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint document_indexing_job_queue_name_check check (queue_name = 'document_indexing_jobs')
);

create index if not exists document_indexing_job_idempotency_workspace_idx
on public.document_indexing_job_idempotency (workspace_id, created_at desc);

create or replace function public.enqueue_document_indexing_job(
  job_payload jsonb,
  p_idempotency_key text
)
returns table (
  message_id bigint,
  enqueued boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  inserted_key text;
  queued_message_id bigint;
begin
  insert into public.document_indexing_job_idempotency (
    idempotency_key,
    workspace_id,
    document_id,
    payload
  )
  values (
    p_idempotency_key,
    (job_payload ->> 'workspace_id')::uuid,
    (job_payload ->> 'document_id')::uuid,
    job_payload
  )
  on conflict (idempotency_key) do nothing
  returning public.document_indexing_job_idempotency.idempotency_key
  into inserted_key;

  if inserted_key is null then
    return query
    select existing.message_id, false
    from public.document_indexing_job_idempotency as existing
    where existing.idempotency_key = p_idempotency_key;
    return;
  end if;

  select pgmq.send('document_indexing_jobs', job_payload)
  into queued_message_id;

  update public.document_indexing_job_idempotency
  set message_id = queued_message_id
  where public.document_indexing_job_idempotency.idempotency_key = inserted_key;

  return query select queued_message_id, true;
end;
$$;

create or replace function public.read_document_indexing_job(
  visibility_timeout_seconds integer default 120
)
returns table (
  message_id bigint,
  read_count integer,
  enqueued_at timestamptz,
  visibility_until timestamptz,
  payload jsonb
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    job.msg_id as message_id,
    job.read_ct as read_count,
    job.enqueued_at,
    job.vt as visibility_until,
    job.message as payload
  from pgmq.read('document_indexing_jobs', visibility_timeout_seconds, 1) as job;
$$;

create or replace function public.complete_document_indexing_job(
  p_message_id bigint
)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select pgmq.delete('document_indexing_jobs', p_message_id);
$$;

create or replace function public.fail_document_indexing_job(
  p_message_id bigint,
  p_payload jsonb,
  p_read_count integer,
  p_error text,
  p_max_attempts integer default 3
)
returns table (
  action text,
  dlq_message_id bigint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  queued_dlq_message_id bigint;
begin
  if p_read_count >= p_max_attempts then
    select pgmq.send(
      'document_indexing_jobs_dlq',
      jsonb_build_object(
        'source_queue', 'document_indexing_jobs',
        'source_message_id', p_message_id,
        'read_count', p_read_count,
        'error', p_error,
        'failed_at', now(),
        'payload', p_payload
      )
    )
    into queued_dlq_message_id;

    perform pgmq.delete('document_indexing_jobs', p_message_id);

    return query select 'dlq'::text, queued_dlq_message_id;
    return;
  end if;

  return query select 'retry'::text, null::bigint;
end;
$$;

revoke all on function public.enqueue_document_indexing_job(jsonb, text) from public;
revoke all on function public.read_document_indexing_job(integer) from public;
revoke all on function public.complete_document_indexing_job(bigint) from public;
revoke all on function public.fail_document_indexing_job(bigint, jsonb, integer, text, integer) from public;

grant execute on function public.enqueue_document_indexing_job(jsonb, text) to service_role;
grant execute on function public.read_document_indexing_job(integer) to service_role;
grant execute on function public.complete_document_indexing_job(bigint) to service_role;
grant execute on function public.fail_document_indexing_job(bigint, jsonb, integer, text, integer) to service_role;
