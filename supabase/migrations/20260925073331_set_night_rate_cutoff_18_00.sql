-- Use the venue-local evening rate from 18:00 Asia/Manila onward.
update public.app_settings
set night_rate_starts_at = time '18:00'
where id = true;
