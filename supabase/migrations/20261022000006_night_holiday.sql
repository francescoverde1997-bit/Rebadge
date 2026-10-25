-- =====================================================================
-- Ore notturne e festive ("di cui", per le maggiorazioni del consulente)
-- Il titolare decide se conteggiarle e quale fascia è notturna.
-- =====================================================================
alter table public.company_settings
  add column track_night boolean not null default true,
  add column night_start_minutes int not null default 1320 check (night_start_minutes between 0 and 1439),
  add column night_end_minutes int not null default 360 check (night_end_minutes between 0 and 1439),
  add column track_holiday boolean not null default true;

-- La fascia notturna deve avere una durata
alter table public.company_settings
  add constraint night_window_not_empty check (night_start_minutes <> night_end_minutes);
