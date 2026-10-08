-- Day 26: store auditable retrieval traces with alerts.

set search_path = public, extensions;

alter table public.alerts
add column if not exists retrieval_trace jsonb not null default '{}'::jsonb;

comment on column public.alerts.retrieval_trace is
  'JSON audit payload capturing vector candidates, similarity scores, effective dates, recency boosts, and final retrieval ranking.';
