-- Day 39: BYOK storage, retrieval, and transparent monthly accounting.

set search_path = public, extensions;

create extension if not exists supabase_vault with schema vault;

alter table public.workspaces
  add column if not exists openai_api_key_secret_id uuid,
  add column if not exists openai_api_key_last_four text,
  add column if not exists openai_api_key_status text not null default 'not_configured',
  add column if not exists openai_api_key_validated_at timestamptz,
  add column if not exists openai_api_key_updated_at timestamptz,
  add constraint workspaces_openai_api_key_status_valid check (
    openai_api_key_status in ('not_configured', 'validated', 'invalid')
  );

create or replace function public.upsert_workspace_openai_api_key(
  p_workspace_id uuid,
  p_api_key text,
  p_key_last_four text
)
returns table (
  workspace_id uuid,
  key_last_four text,
  validated_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  workspace_row public.workspaces%rowtype;
  secret_id uuid;
  secret_name text := 'workspace_openai_api_key_' || p_workspace_id::text;
  now_value timestamptz := now();
begin
  if nullif(trim(p_api_key), '') is null then
    raise exception 'OpenAI API key cannot be empty.';
  end if;

  select *
  into workspace_row
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    return;
  end if;

  if workspace_row.openai_api_key_secret_id is null then
    select vault.create_secret(
      p_api_key,
      secret_name,
      'ScopeSignal BYOK OpenAI API key for workspace ' || p_workspace_id::text
    )
    into secret_id;
  else
    secret_id := workspace_row.openai_api_key_secret_id;

    perform vault.update_secret(
      secret_id,
      p_api_key,
      secret_name,
      'ScopeSignal BYOK OpenAI API key for workspace ' || p_workspace_id::text
    );
  end if;

  update public.workspaces
  set
    openai_api_key_secret_id = secret_id,
    openai_api_key_last_four = p_key_last_four,
    openai_api_key_status = 'validated',
    openai_api_key_validated_at = now_value,
    openai_api_key_updated_at = now_value
  where id = p_workspace_id;

  return query
  select
    p_workspace_id,
    p_key_last_four,
    now_value,
    'validated'::text;
end;
$$;

create or replace function public.clear_workspace_openai_api_key(
  p_workspace_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
begin
  update public.workspaces
  set
    openai_api_key_secret_id = null,
    openai_api_key_last_four = null,
    openai_api_key_status = 'not_configured',
    openai_api_key_validated_at = null,
    openai_api_key_updated_at = now()
  where id = p_workspace_id;

  return found;
end;
$$;

create or replace function public.get_workspace_openai_api_key(
  p_workspace_id uuid
)
returns table (
  api_key text,
  key_last_four text,
  validated_at timestamptz
)
language sql
security definer
set search_path = public, extensions, vault
as $$
  select
    ds.decrypted_secret,
    w.openai_api_key_last_four,
    w.openai_api_key_validated_at
  from public.workspaces w
  inner join vault.decrypted_secrets ds
    on ds.id = w.openai_api_key_secret_id
  where w.id = p_workspace_id
    and w.openai_api_key_status = 'validated'
    and nullif(ds.decrypted_secret, '') is not null
  limit 1;
$$;

create or replace function public.record_byok_classification_usage(
  p_workspace_id uuid,
  p_prompt_tokens integer default 0,
  p_completion_tokens integer default 0,
  p_total_tokens integer default 0
)
returns table (
  workspace_id uuid,
  month_start date,
  managed_usage_enabled boolean,
  allocated_monthly_events integer,
  managed_classification_count integer,
  byok_classification_count integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_month date := public.current_usage_month_start();
  workspace_row public.workspaces%rowtype;
  usage_row public.monthly_usage%rowtype;
begin
  select *
  into workspace_row
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    return;
  end if;

  insert into public.monthly_usage (workspace_id, month_start)
  values (p_workspace_id, current_month)
  on conflict (workspace_id, month_start) do nothing;

  update public.monthly_usage
  set
    byok_classification_count = byok_classification_count + 1,
    prompt_tokens = prompt_tokens + greatest(coalesce(p_prompt_tokens, 0), 0),
    completion_tokens = completion_tokens
      + greatest(coalesce(p_completion_tokens, 0), 0),
    total_tokens = total_tokens + greatest(coalesce(p_total_tokens, 0), 0)
  where monthly_usage.workspace_id = p_workspace_id
    and monthly_usage.month_start = current_month
  returning *
  into usage_row;

  return query
  select
    workspace_row.id,
    current_month,
    workspace_row.managed_usage_enabled,
    workspace_row.allocated_monthly_events,
    usage_row.managed_classification_count,
    usage_row.byok_classification_count;
end;
$$;

revoke all on function public.upsert_workspace_openai_api_key(
  uuid,
  text,
  text
) from public;
revoke all on function public.clear_workspace_openai_api_key(uuid) from public;
revoke all on function public.get_workspace_openai_api_key(uuid) from public;
revoke all on function public.record_byok_classification_usage(
  uuid,
  integer,
  integer,
  integer
) from public;

grant execute on function public.upsert_workspace_openai_api_key(
  uuid,
  text,
  text
) to service_role;
grant execute on function public.clear_workspace_openai_api_key(uuid)
to service_role;
grant execute on function public.get_workspace_openai_api_key(uuid)
to service_role;
grant execute on function public.record_byok_classification_usage(
  uuid,
  integer,
  integer,
  integer
) to service_role;
