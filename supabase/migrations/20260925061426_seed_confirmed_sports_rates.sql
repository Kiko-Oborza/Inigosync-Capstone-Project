-- Seed the unambiguous configured rates. Day-only rates are treated as
-- constant all-day prices; unequal day/night pairs require an owner cutoff.
update public.court_unit_inventory u
set rate_day = 500, rate_night = null, rate_unit = '/hr'
from public.court c where c.id = u.court_id and c.name = 'Volleyball';

update public.court_unit_inventory u
set rate_day = 200, rate_night = 300, rate_unit = '/hr'
from public.court c where c.id = u.court_id and c.name = 'Lawn Tennis';

update public.court_unit_inventory u
set rate_day = 250, rate_night = null, rate_unit = '/hr'
from public.court c where c.id = u.court_id and c.name = 'Billiards';

update public.court_unit_inventory u
set rate_day = 100, rate_night = null, rate_unit = '/hr'
from public.court c where c.id = u.court_id and c.name = 'Table Tennis';

update public.court_unit_inventory u
set rate_day = 100, rate_night = null, rate_unit = '/set'
from public.court c where c.id = u.court_id and c.name = 'Bowling — Duckpin';

update public.court_unit_inventory u
set rate_day = 150, rate_night = null, rate_unit = '/set'
from public.court c where c.id = u.court_id and c.name = 'Bowling — Ten-Pin';
