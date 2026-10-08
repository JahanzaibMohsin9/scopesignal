-- Internal queue idempotency ledger should never be directly exposed via PostgREST.

alter table public.slack_event_job_idempotency enable row level security;

revoke all on table public.slack_event_job_idempotency from anon;
revoke all on table public.slack_event_job_idempotency from authenticated;
