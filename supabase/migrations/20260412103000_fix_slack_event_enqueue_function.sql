-- Fix Day 22 enqueue helper parameter ambiguity in PL/pgSQL.

set search_path = public, extensions;

drop function if exists public.enqueue_slack_event_job(jsonb, text);

create or replace function public.enqueue_slack_event_job(
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
  insert into public.slack_event_job_idempotency (
    idempotency_key,
    workspace_id,
    slack_channel_id,
    message_ts,
    payload
  )
  values (
    p_idempotency_key,
    (job_payload ->> 'workspace_id')::uuid,
    job_payload ->> 'slack_channel_id',
    job_payload ->> 'message_ts',
    job_payload
  )
  on conflict (idempotency_key) do nothing
  returning public.slack_event_job_idempotency.idempotency_key
  into inserted_key;

  if inserted_key is null then
    return query
    select existing.message_id, false
    from public.slack_event_job_idempotency as existing
    where existing.idempotency_key = p_idempotency_key;
    return;
  end if;

  select pgmq.send('scopesignal_jobs', job_payload)
  into queued_message_id;

  update public.slack_event_job_idempotency
  set message_id = queued_message_id
  where public.slack_event_job_idempotency.idempotency_key = inserted_key;

  return query select queued_message_id, true;
end;
$$;

revoke all on function public.enqueue_slack_event_job(jsonb, text) from public;
grant execute on function public.enqueue_slack_event_job(jsonb, text) to service_role;
