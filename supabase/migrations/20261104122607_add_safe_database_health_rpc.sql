create or replace function public.health_check()
returns boolean
language sql
stable
as $$
  select true;
$$;

revoke all on function public.health_check() from public, anon, authenticated;
grant execute on function public.health_check() to anon, authenticated, service_role;
