-- =====================================================================
-- Santo Patrono: festività locale inserita dal cliente (es. "06-24" San Giovanni)
-- =====================================================================

-- "MM-DD" esistente? (2024 è bisestile: il 29 febbraio è ammesso)
create or replace function public.is_valid_month_day(v text)
returns boolean language plpgsql immutable as $$
begin
  if v is null then return true; end if;
  if v !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then return false; end if;
  perform make_date(2024, substr(v, 1, 2)::int, substr(v, 4, 2)::int);
  return true;
exception when others then
  return false;
end;
$$;

alter table public.company_settings
  add column patron_month_day text check (public.is_valid_month_day(patron_month_day)),
  add column patron_name text check (patron_name is null or char_length(btrim(patron_name)) between 1 and 60);
