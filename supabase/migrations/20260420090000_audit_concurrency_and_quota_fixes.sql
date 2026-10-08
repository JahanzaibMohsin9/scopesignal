-- Audit fixes: atomic workspace provisioning and managed quota reservation.

set search_path = public, extensions;

create or replace function public.slugify_workspace_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      left(
        regexp_replace(
          regexp_replace(lower(trim(value)), '[^a-z0-9]+', '-', 'g'),
          '(^-+|-+$)',
          '',
          'g'
        ),
        48
      ),
      ''
    ),
    'workspace'
  );
$$;

create or replace function public.ensure_user_workspace_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_workspace_name text
)
returns table (
  account_name text,
  workspace_id uuid,
  workspace_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  profile_row public.users%rowtype;
  workspace_row public.workspaces%rowtype;
  resolved_full_name text := coalesce(nullif(trim(p_full_name), ''), p_email);
  resolved_workspace_name text := coalesce(
    nullif(trim(p_workspace_name), ''),
    resolved_full_name || '''s Workspace'
  );
  resolved_slug text :=
    public.slugify_workspace_name(resolved_workspace_name)
    || '-'
    || left(p_user_id::text, 8);
begin
  if nullif(trim(p_email), '') is null then
    raise exception 'Cannot create a workspace for a user without an email.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
  into profile_row
  from public.users
  where id = p_user_id;

  if found then
    select *
    into workspace_row
    from public.workspaces
    where id = profile_row.workspace_id;

    return query
    select
      coalesce(profile_row.email, profile_row.full_name, p_email),
      profile_row.workspace_id,
      workspace_row.name;
    return;
  end if;

  insert into public.workspaces (
    name,
    slug,
    tier,
    allocated_monthly_events,
    managed_usage_enabled
  )
  values (
    resolved_workspace_name,
    resolved_slug,
    'free',
    100,
    true
  )
  returning *
  into workspace_row;

  insert into public.users (
    id,
    workspace_id,
    email,
    full_name,
    role
  )
  values (
    p_user_id,
    workspace_row.id,
    p_email,
    resolved_full_name,
    'owner'
  )
  returning *
  into profile_row;

  return query
  select
    coalesce(profile_row.email, profile_row.full_name, p_email),
    workspace_row.id,
    workspace_row.name;
end;
$$;

create or replace function public.reserve_managed_classification_quota(
  p_workspace_id uuid
)
returns table (
  workspace_id uuid,
  month_start date,
  managed_usage_enabled boolean,
  allocated_monthly_events integer,
  managed_classification_count integer,
  remaining_events integer,
  has_quota boolean,
  notification_to_send text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_month date := public.current_usage_month_start();
  workspace_row public.workspaces%rowtype;
  usage_row public.monthly_usage%rowtype;
  next_count integer;
  warning_threshold integer;
  notification text := null;
  now_value timestamptz := now();
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

  select *
  into usage_row
  from public.monthly_usage
  where monthly_usage.workspace_id = p_workspace_id
    and monthly_usage.month_start = current_month
  for update;

  if workspace_row.managed_usage_enabled
    and usage_row.managed_classification_count
      >= workspace_row.allocated_monthly_events then
    return query
    select
      workspace_row.id,
      current_month,
      workspace_row.managed_usage_enabled,
      workspace_row.allocated_monthly_events,
      usage_row.managed_classification_count,
      0,
      false,
      null::text;
    return;
  end if;

  next_count := usage_row.managed_classification_count + 1;
  warning_threshold := greatest(
    1,
    ceiling(workspace_row.allocated_monthly_events * 0.8)::integer
  );

  if workspace_row.managed_usage_enabled
    and workspace_row.allocated_monthly_events > 0
    and next_count >= workspace_row.allocated_monthly_events
    and usage_row.threshold_100_notified_at is null then
    notification := 'paused_100';
  elsif workspace_row.managed_usage_enabled
    and workspace_row.allocated_monthly_events > 0
    and next_count >= warning_threshold
    and usage_row.threshold_80_notified_at is null then
    notification := 'warning_80';
  end if;

  update public.monthly_usage
  set
    managed_classification_count = next_count,
    threshold_80_notified_at = case
      when notification = 'warning_80' then now_value
      else threshold_80_notified_at
    end,
    threshold_100_notified_at = case
      when notification = 'paused_100' then now_value
      else threshold_100_notified_at
    end
  where monthly_usage.id = usage_row.id
  returning *
  into usage_row;

  return query
  select
    workspace_row.id,
    current_month,
    workspace_row.managed_usage_enabled,
    workspace_row.allocated_monthly_events,
    usage_row.managed_classification_count,
    case
      when not workspace_row.managed_usage_enabled then null::integer
      else greatest(
        workspace_row.allocated_monthly_events
          - usage_row.managed_classification_count,
        0
      )
    end,
    (
      not workspace_row.managed_usage_enabled
      or usage_row.managed_classification_count
        <= workspace_row.allocated_monthly_events
    ),
    notification;
end;
$$;

create or replace function public.record_managed_classification_usage(
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
  remaining_events integer,
  has_quota boolean,
  notification_to_send text
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
    case
      when not workspace_row.managed_usage_enabled then null::integer
      else greatest(
        workspace_row.allocated_monthly_events
          - usage_row.managed_classification_count,
        0
      )
    end,
    (
      not workspace_row.managed_usage_enabled
      or usage_row.managed_classification_count
        < workspace_row.allocated_monthly_events
    ),
    null::text;
end;
$$;

revoke all on function public.slugify_workspace_name(text) from public;
revoke all on function public.ensure_user_workspace_profile(
  uuid,
  text,
  text,
  text
) from public;
revoke all on function public.reserve_managed_classification_quota(uuid)
from public;

grant execute on function public.ensure_user_workspace_profile(
  uuid,
  text,
  text,
  text
) to service_role;
grant execute on function public.reserve_managed_classification_quota(uuid)
to service_role;
