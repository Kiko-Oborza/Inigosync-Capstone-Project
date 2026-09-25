-- Role-check helpers only need to run in authenticated RLS policies.
-- Anonymous clients always receive false from auth.uid(), but exposing these
-- SECURITY DEFINER RPCs is unnecessary and makes staff-role probes public.
revoke all on function public.inigosync_is_admin() from public, anon;
revoke all on function public.inigosync_is_staff_or_admin() from public, anon;

grant execute on function public.inigosync_is_admin() to authenticated, service_role;
grant execute on function public.inigosync_is_staff_or_admin() to authenticated, service_role;
