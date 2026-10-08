-- Lock service-owned operational tables and add license code redemption entitlements.

set search_path = public, extensions;

drop policy if exists "workspace_members_can_insert_chunks" on public.chunks;
drop policy if exists "workspace_members_can_update_chunks" on public.chunks;
drop policy if exists "workspace_members_can_delete_chunks" on public.chunks;

drop policy if exists "workspace_members_can_insert_alerts" on public.alerts;
drop policy if exists "workspace_members_can_update_alerts" on public.alerts;
drop policy if exists "workspace_members_can_delete_alerts" on public.alerts;

drop policy if exists "workspace_members_can_insert_monthly_usage" on public.monthly_usage;
drop policy if exists "workspace_members_can_update_monthly_usage" on public.monthly_usage;
drop policy if exists "workspace_members_can_delete_monthly_usage" on public.monthly_usage;

drop policy if exists "workspace_members_can_insert_usage_logs" on public.usage_logs;
drop policy if exists "workspace_members_can_update_usage_logs" on public.usage_logs;
drop policy if exists "workspace_members_can_delete_usage_logs" on public.usage_logs;

create table if not exists public.license_redemption_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  tier_number integer not null,
  label text,
  allocated_monthly_events integer not null,
  redeemed_workspace_id uuid references public.workspaces(id) on delete set null,
  redeemed_by_user_id uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint license_redemption_codes_tier_number_check check (tier_number in (1, 2, 3)),
  constraint license_redemption_codes_allocated_events_positive check (allocated_monthly_events > 0),
  constraint license_redemption_codes_redemption_complete check (
    (
      redeemed_at is null
      and redeemed_workspace_id is null
      and redeemed_by_user_id is null
    )
    or (
      redeemed_at is not null
      and redeemed_workspace_id is not null
      and redeemed_by_user_id is not null
    )
  )
);

alter table public.license_redemption_codes enable row level security;

revoke all on table public.license_redemption_codes from anon;
revoke all on table public.license_redemption_codes from authenticated;
