-- =====================================================================
-- Fase 4 — Correzioni delle timbrature
-- Le regole valgono nel database, non solo nell'interfaccia.
-- =====================================================================

-- Un annullamento ha sempre un motivo
alter table public.punches
  add constraint punches_void_reason check (
    voided_at is null or (void_reason is not null and char_length(btrim(void_reason)) >= 3)
  );

-- Le timbrature manuali non possono essere nel futuro (5 minuti di tolleranza)
create or replace function public.punches_no_future()
returns trigger language plpgsql as $$
begin
  if new.source = 'manual' and new.punched_at > now() + interval '5 minutes' then
    raise exception 'Non puoi inserire una timbratura nel futuro' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger punches_no_future before insert on public.punches
  for each row execute function public.punches_no_future();

-- Indice per "chi è al lavoro adesso" e per il dettaglio mensile del dipendente
create index if not exists punches_employee_valid_idx
  on public.punches (employee_id, punched_at desc) where voided_at is null;
