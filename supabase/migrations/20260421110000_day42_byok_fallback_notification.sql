-- Day 42: invalidate rejected BYOK keys so the worker can fall back cleanly.

set search_path = public, extensions;

create or replace function public.mark_workspace_openai_api_key_invalid(
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
    openai_api_key_status = 'invalid',
    openai_api_key_updated_at = now()
  where id = p_workspace_id
    and openai_api_key_secret_id is not null;

  return found;
end;
$$;

revoke all on function public.mark_workspace_openai_api_key_invalid(uuid)
from public;

grant execute on function public.mark_workspace_openai_api_key_invalid(uuid)
to service_role;
