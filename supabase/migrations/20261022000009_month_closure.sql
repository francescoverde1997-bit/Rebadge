-- =====================================================================
-- Fase 6 — Chiusura del mese
-- Scaricando il PDF definitivo il mese si chiude: timbrature e assenze di quel mese
-- non si possono più modificare. Si riapre solo tramite l'assistenza.
-- =====================================================================

create table public.month_closures (
  company_id  uuid not null references public.companies(id) on delete cascade,
  month       text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  closed_at   timestamptz not null default now(),
  closed_by   uuid references auth.users(id) on delete set null,
  settings    jsonb not null,  -- regole di calcolo in vigore alla chiusura: il mese si ricalcola sempre uguale
  totals      jsonb not null,  -- istantanea dei totali per dipendente (verifica e assistenza)
  pdf_path    text not null,   -- PDF inviato al consulente, nel bucket "reports"
  primary key (company_id, month)
);

alter table public.month_closures enable row level security;
create policy closures_select on public.month_closures for select to authenticated
  using (public.is_company_owner(company_id));
-- nessuna scrittura diretta dal client: si chiude solo con close_month()
revoke insert, update, delete on public.month_closures from authenticated, anon;

create trigger audit_closures after insert or delete on public.month_closures
  for each row execute function public.audit_row();

-- Mese (YYYY-MM) di un istante nel fuso dell'azienda
create or replace function public.company_month(cid uuid, ts timestamptz)
returns text language sql stable security definer set search_path = public as $$
  select to_char(ts at time zone coalesce((select timezone from companies where id = cid), 'Europe/Rome'), 'YYYY-MM');
$$;

create or replace function public.is_month_closed(cid uuid, m text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from month_closures where company_id = cid and month = m);
$$;

-- ---------------------------------------------------------------------
-- Blocco delle timbrature
-- ---------------------------------------------------------------------
create or replace function public.punches_closed_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_month_closed(new.company_id, company_month(new.company_id, new.punched_at)) then
    raise exception 'Il mese è chiuso: le timbrature non si possono più modificare. Contatta l''assistenza.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;
create trigger punches_closed_guard before insert or update on public.punches
  for each row execute function public.punches_closed_guard();

-- ---------------------------------------------------------------------
-- Blocco delle assenze (anche se toccano solo in parte un mese chiuso)
-- ---------------------------------------------------------------------
create or replace function public.leave_closed_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare r leave_requests;
begin
  foreach r in array (case tg_op when 'INSERT' then array[new] when 'DELETE' then array[old] else array[old, new] end) loop
    if exists (
      select 1 from month_closures c
       where c.company_id = r.company_id
         and c.month between to_char(r.start_date, 'YYYY-MM') and to_char(r.end_date, 'YYYY-MM')
    ) then
      raise exception 'Il mese è chiuso: le assenze non si possono più modificare. Contatta l''assistenza.'
        using errcode = 'object_not_in_prerequisite_state';
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;
create trigger leave_closed_guard before insert or update or delete on public.leave_requests
  for each row execute function public.leave_closed_guard();

-- ---------------------------------------------------------------------
-- Chiusura (titolare): solo mesi finiti, una volta sola
-- ---------------------------------------------------------------------
create or replace function public.close_month(
  p_company_id uuid, p_month text, p_settings jsonb, p_totals jsonb, p_pdf_path text
) returns timestamptz language plpgsql security definer set search_path = public as $$
declare ts timestamptz;
begin
  if not is_company_owner(p_company_id) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mese non valido' using errcode = '22023';
  end if;
  if p_month >= company_month(p_company_id, now()) then
    raise exception 'Si può chiudere solo un mese già finito' using errcode = '22023';
  end if;
  if p_pdf_path is null or p_pdf_path not like p_company_id::text || '/%' then
    raise exception 'PDF non valido' using errcode = '22023';
  end if;
  insert into month_closures (company_id, month, closed_by, settings, totals, pdf_path)
  values (p_company_id, p_month, auth.uid(), p_settings, p_totals, p_pdf_path)
  returning closed_at into ts;
  return ts;
end;
$$;
revoke execute on function public.close_month(uuid, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.close_month(uuid, text, jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- Riapertura: SOLO assistenza (SQL editor di Supabase o chiave service_role).
-- Il PDF già inviato resta in archivio.
-- ---------------------------------------------------------------------
create or replace function public.support_reopen_month(p_company_id uuid, p_month text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from month_closures where company_id = p_company_id and month = p_month;
  return found;
end;
$$;
revoke execute on function public.support_reopen_month(uuid, text) from public, anon, authenticated;
grant execute on function public.support_reopen_month(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- Archivio dei PDF definitivi: privato, solo il titolare legge e carica, nessuno modifica o cancella
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy reports_read on storage.objects for select to authenticated
  using (bucket_id = 'reports' and public.is_company_owner(((storage.foldername(name))[1])::uuid));
create policy reports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and public.is_company_owner(((storage.foldername(name))[1])::uuid));
-- nessuna policy di update/delete: il documento inviato non si altera
