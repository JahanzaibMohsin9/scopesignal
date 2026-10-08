-- Day 40: email alert preferences for fallback and opt-in delivery.

set search_path = public, extensions;

alter table public.workspaces
  add column if not exists email_alerts_enabled boolean not null default false;
