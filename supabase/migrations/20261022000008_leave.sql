-- =====================================================================
-- Fase 5 — Ferie, permessi, malattia
-- =====================================================================

-- Settimana lavorativa: 5 giorni (lun–ven) o 6 (lun–sab). Serve a contare i giorni di ferie.
alter table public.company_settings add column work_saturday boolean not null default false;

-- Nota breve
alter table public.leave_requests
  add constraint leave_note_len check (note is null or char_length(note) <= 200),
  add constraint leave_max_length check (end_date - start_date <= 366),
  add constraint leave_hours_half check (hours is null or (hours * 2) = floor(hours * 2));

-- Niente assenze sovrapposte per lo stesso dipendente (più permessi a ore nello stesso giorno sono ammessi).
create or replace function public.leave_no_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rejected' then return new; end if;
  if exists (
    select 1 from leave_requests l
     where l.employee_id = new.employee_id
       and l.id <> new.id
       and l.status <> 'rejected'
       and l.start_date <= new.end_date and new.start_date <= l.end_date
       and not (l.type = 'permesso' and l.hours is not null and new.type = 'permesso' and new.hours is not null)
  ) then
    raise exception 'Il dipendente ha già un''assenza in quei giorni' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger leave_no_overlap before insert or update on public.leave_requests
  for each row execute function public.leave_no_overlap();

-- Le assenze inserite dal titolare sono già approvate: si registra chi e quando
create or replace function public.leave_set_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end;
$$;
create trigger leave_set_decision before insert or update on public.leave_requests
  for each row execute function public.leave_set_decision();

create index if not exists leave_employee_dates_idx on public.leave_requests (employee_id, start_date, end_date);
