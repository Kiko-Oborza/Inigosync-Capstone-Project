-- Staff password recovery now uses Supabase Auth's emailed recovery link.
-- Keep the old function inaccessible so no client can reset a staff account
-- to the former shared default password.
revoke execute on function public.admin_reset_staff_password(uuid) from authenticated;
