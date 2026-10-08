-- Day 23: worker queue consumption, acknowledgements, and DLQ handling.

set search_path = public, extensions;

select pgmq.create('scopesignal_jobs_dlq')
where not exists (
  select 1
  from pgmq.meta
  where queue_name = 'scopesignal_jobs_dlq'
);

create or replace function public.read_scopesignal_job(
  visibility_timeout_seconds integer default 30
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
  from pgmq.read('scopesignal_jobs', visibility_timeout_seconds, 1) as job;
$$;

create or replace function public.complete_scopesignal_job(
  p_message_id bigint
)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select pgmq.delete('scopesignal_jobs', p_message_id);
$$;

create or replace function public.fail_scopesignal_job(
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
      'scopesignal_jobs_dlq',
      jsonb_build_object(
        'source_queue', 'scopesignal_jobs',
        'source_message_id', p_message_id,
        'read_count', p_read_count,
        'error', p_error,
        'failed_at', now(),
        'payload', p_payload
      )
    )
    into queued_dlq_message_id;

    perform pgmq.delete('scopesignal_jobs', p_message_id);

    return query select 'dlq'::text, queued_dlq_message_id;
    return;
  end if;

  return query select 'retry'::text, null::bigint;
end;
$$;

revoke all on function public.read_scopesignal_job(integer) from public;
revoke all on function public.complete_scopesignal_job(bigint) from public;
revoke all on function public.fail_scopesignal_job(bigint, jsonb, integer, text, integer) from public;

grant execute on function public.read_scopesignal_job(integer) to service_role;
grant execute on function public.complete_scopesignal_job(bigint) to service_role;
grant execute on function public.fail_scopesignal_job(bigint, jsonb, integer, text, integer) to service_role;
