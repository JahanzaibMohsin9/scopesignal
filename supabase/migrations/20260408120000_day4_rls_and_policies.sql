set search_path = public, extensions;

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.users
  where id = auth.uid()
  limit 1;
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and workspace_id = target_workspace_id
  );
$$;

revoke all on function public.current_workspace_id() from public;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.users enable row level security;
alter table public.proposals enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.channels enable row level security;
alter table public.client_contacts enable row level security;
alter table public.alerts enable row level security;
alter table public.monthly_usage enable row level security;
alter table public.usage_logs enable row level security;

create policy "workspace_members_can_read_their_workspace"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

create policy "workspace_admins_can_update_their_workspace"
on public.workspaces
for update
to authenticated
using (
  exists (
    select 1
    from public.users
    where id = auth.uid()
      and workspace_id = workspaces.id
      and role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.users
    where id = auth.uid()
      and workspace_id = workspaces.id
      and role in ('owner', 'admin')
  )
);

create policy "workspace_members_can_read_users"
on public.users
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "users_can_update_themselves"
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and workspace_id = public.current_workspace_id());

create policy "workspace_members_can_read_proposals"
on public.proposals
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_proposals"
on public.proposals
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_proposals"
on public.proposals
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_proposals"
on public.proposals
for delete
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_read_documents"
on public.documents
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_documents"
on public.documents
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_documents"
on public.documents
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_documents"
on public.documents
for delete
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_read_chunks"
on public.chunks
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_chunks"
on public.chunks
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_chunks"
on public.chunks
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_chunks"
on public.chunks
for delete
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_read_channels"
on public.channels
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_channels"
on public.channels
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_channels"
on public.channels
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_channels"
on public.channels
for delete
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_read_client_contacts"
on public.client_contacts
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_client_contacts"
on public.client_contacts
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_client_contacts"
on public.client_contacts
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_client_contacts"
on public.client_contacts
for delete
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_read_alerts"
on public.alerts
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_alerts"
on public.alerts
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_alerts"
on public.alerts
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_alerts"
on public.alerts
for delete
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_read_monthly_usage"
on public.monthly_usage
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_monthly_usage"
on public.monthly_usage
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_monthly_usage"
on public.monthly_usage
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_monthly_usage"
on public.monthly_usage
for delete
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_read_usage_logs"
on public.usage_logs
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_insert_usage_logs"
on public.usage_logs
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_update_usage_logs"
on public.usage_logs
for update
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_can_delete_usage_logs"
on public.usage_logs
for delete
to authenticated
using (public.is_workspace_member(workspace_id));
