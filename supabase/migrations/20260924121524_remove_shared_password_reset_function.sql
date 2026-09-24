-- Staff recovery now uses Supabase's verified email recovery flow.
drop function if exists public.admin_reset_staff_password(uuid);
