-- Cash walk-ins must pass the quoted-price wrapper so a changed court rate
-- cannot be collected before the staff reviews the new amount.
-- SECURITY DEFINER wrappers retain owner access to the underlying function.
revoke execute on function public.staff_create_walkin_order(uuid,text,text,jsonb,text)
  from public,anon,authenticated,service_role;
