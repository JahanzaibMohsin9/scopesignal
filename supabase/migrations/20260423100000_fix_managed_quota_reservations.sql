-- Prevent failed managed-classification attempts from consuming monthly quota.

set search_path = public, extensions;

alter table public.monthly_usage
  add column if not exists managed_reservation_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monthly_usage_managed_reservation_count_nonnegative'
  ) then
    alter table public.monthly_usage
      add constraint monthly_usage_managed_reservation_count_nonnegative
      check (managed_reservation_count >= 0);
  end if;
end;
$$;

create or replace function public.check_workspace_quota(
  p_workspace_id uuid
)
returns table (
  workspace_id uuid,
  month_start date,
  managed_usage_enabled boolean,
  allocated_monthly_events integer,
  managed_classification_count integer,
  remaining_events integer,
  has_quota boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_month date := public.current_usage_month_start();
begin
  insert into public.monthly_usage (workspace_id, month_start)
  select p_workspace_id, current_month
  from public.workspaces
  where id = p_workspace_id
  on conflict (workspace_id, month_start) do nothing;

  return query
  select
    w.id,
    current_month,
    w.managed_usage_enabled,
    w.allocated_monthly_events,
    coalesce(mu.managed_classification_count, 0),
    case
      when not w.managed_usage_enabled then null::integer
      else greatest(
        w.allocated_monthly_events
          - coalesce(mu.managed_classification_count, 0)
          - coalesce(mu.managed_reservation_count, 0),
        0
      )
    end,
    (
      not w.managed_usage_enabled
      or (
        coalesce(mu.managed_classification_count, 0)
        + coalesce(mu.managed_reservation_count, 0)
      ) < w.allocated_monthly_events
    )
  from public.workspaces w
  left join public.monthly_usage mu
    on mu.workspace_id = w.id
    and mu.month_start = current_month
  where w.id = p_workspace_id;
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
  next_effective_count integer;
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
    and (
      usage_row.managed_classification_count + usage_row.managed_reservation_count
    ) >= workspace_row.allocated_monthly_events then
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

  next_effective_count :=
    usage_row.managed_classification_count
    + usage_row.managed_reservation_count
    + 1;
  warning_threshold := greatest(
    1,
    ceiling(workspace_row.allocated_monthly_events * 0.8)::integer
  );

  if workspace_row.managed_usage_enabled
    and workspace_row.allocated_monthly_events > 0
    and next_effective_count >= workspace_row.allocated_monthly_events
    and usage_row.threshold_100_notified_at is null then
    notification := 'paused_100';
  elsif workspace_row.managed_usage_enabled
    and workspace_row.allocated_monthly_events > 0
    and next_effective_count >= warning_threshold
    and usage_row.threshold_80_notified_at is null then
    notification := 'warning_80';
  end if;

  update public.monthly_usage
  set
    managed_reservation_count = managed_reservation_count + 1,
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
          - usage_row.managed_classification_count
          - usage_row.managed_reservation_count,
        0
      )
    end,
    (
      not workspace_row.managed_usage_enabled
      or (
        usage_row.managed_classification_count + usage_row.managed_reservation_count
      ) <= workspace_row.allocated_monthly_events
    ),
    notification;
end;
$$;

create or replace function public.release_managed_classification_quota(
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
    managed_reservation_count = greatest(managed_reservation_count - 1, 0)
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
          - usage_row.managed_classification_count
          - usage_row.managed_reservation_count,
        0
      )
    end,
    (
      not workspace_row.managed_usage_enabled
      or (
        usage_row.managed_classification_count + usage_row.managed_reservation_count
      ) < workspace_row.allocated_monthly_events
    ),
    null::text;
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
    managed_classification_count = managed_classification_count + 1,
    managed_reservation_count = greatest(managed_reservation_count - 1, 0),
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
          - usage_row.managed_classification_count
          - usage_row.managed_reservation_count,
        0
      )
    end,
    (
      not workspace_row.managed_usage_enabled
      or (
        usage_row.managed_classification_count + usage_row.managed_reservation_count
      ) < workspace_row.allocated_monthly_events
    ),
    null::text;
end;
$$;

create or replace function public.archive_and_reset_monthly_usage()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_month date := public.current_usage_month_start();
begin
  insert into public.monthly_usage_history (
    workspace_id,
    archived_month_start,
    managed_classification_count,
    byok_classification_count,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    allocated_monthly_events,
    workspace_tier
  )
  select
    mu.workspace_id,
    mu.month_start,
    mu.managed_classification_count,
    mu.byok_classification_count,
    mu.prompt_tokens,
    mu.completion_tokens,
    mu.total_tokens,
    w.allocated_monthly_events,
    w.tier
  from public.monthly_usage mu
  inner join public.workspaces w on w.id = mu.workspace_id
  where mu.month_start < current_month
  on conflict (workspace_id, archived_month_start) do update
  set
    managed_classification_count = excluded.managed_classification_count,
    byok_classification_count = excluded.byok_classification_count,
    prompt_tokens = excluded.prompt_tokens,
    completion_tokens = excluded.completion_tokens,
    total_tokens = excluded.total_tokens,
    allocated_monthly_events = excluded.allocated_monthly_events,
    workspace_tier = excluded.workspace_tier,
    archived_at = now();

  insert into public.monthly_usage (workspace_id, month_start)
  select id, current_month
  from public.workspaces
  on conflict (workspace_id, month_start) do update
  set
    managed_classification_count = 0,
    managed_reservation_count = 0,
    byok_classification_count = 0,
    prompt_tokens = 0,
    completion_tokens = 0,
    total_tokens = 0,
    threshold_80_notified_at = null,
    threshold_100_notified_at = null;
end;
$$;

revoke all on function public.release_managed_classification_quota(uuid)
from public;

grant execute on function public.release_managed_classification_quota(uuid)
to service_role;
