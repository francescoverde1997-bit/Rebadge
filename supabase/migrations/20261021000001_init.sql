-- =====================================================================
-- Presenze — schema iniziale
-- Multi-azienda con isolamento tramite Row Level Security.
-- Ogni tabella di dominio ha company_id e policy basate su company_members.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------
create type public.member_role   as enum ('owner', 'employee');
create type public.punch_kind    as enum ('in', 'out');
create type public.punch_source  as enum ('kiosk', 'manual');
create type public.leave_type    as enum ('ferie', 'permesso', 'malattia', 'altro');
create type public.leave_status  as enum ('pending', 'approved', 'rejected');
create type public.plan_status   as enum ('trialing', 'active', 'past_due', 'canceled');

-- ---------------------------------------------------------------------
-- Aziende
-- ---------------------------------------------------------------------
create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  logo_path       text,                         -- percorso nel bucket "logos"
  timezone        text not null default 'Europe/Rome',
  plan_status     public.plan_status not null default 'trialing',
  trial_ends_at   timestamptz not null default (now() + interval '14 days'),
  created_at      timestamptz not null default now()
);

create table public.company_members (
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index on public.company_members (user_id);

-- Regole di calcolo ore: valori predefiniti sensati, modificabili dal titolare.
create table public.company_settings (
  company_id                 uuid primary key references public.companies(id) on delete cascade,
  rounding_minutes           int not null default 0   check (rounding_minutes in (0, 5, 10, 15, 30)),
  auto_break_minutes         int not null default 0   check (auto_break_minutes between 0 and 120),
  auto_break_after_minutes   int not null default 360 check (auto_break_after_minutes between 60 and 720),
  daily_overtime_after_minutes int not null default 480 check (daily_overtime_after_minutes between 60 and 1440),
  max_shift_minutes          int not null default 960 check (max_shift_minutes between 240 and 1440),
  updated_at                 timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Dipendenti
-- ---------------------------------------------------------------------
create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  first_name           text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name            text not null check (char_length(btrim(last_name)) between 1 and 60),
  email                text,
  user_id              uuid references auth.users(id) on delete set null, -- accesso self-service (fase successiva)
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);
create index on public.employees (company_id);

-- Segreti del dipendente in tabella separata: nessun client può leggerli o scriverli.
create table public.employee_secrets (
  employee_id          uuid primary key references public.employees(id) on delete cascade,
  pin_hash             text not null,            -- bcrypt
  failed_pin_attempts  int not null default 0,
  pin_locked_until     timestamptz
);

-- ---------------------------------------------------------------------
-- Tablet (dispositivi timbratrice)
-- ---------------------------------------------------------------------
create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null default 'Tablet',
  token_hash    text not null unique,            -- sha256 del token, il token in chiaro resta solo sul tablet
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);
create index on public.devices (company_id);

-- ---------------------------------------------------------------------
-- Timbrature: immutabili. Una correzione = annullamento + nuova timbratura manuale.
-- ---------------------------------------------------------------------
create table public.punches (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  kind         public.punch_kind not null,
  punched_at   timestamptz not null,
  source       public.punch_source not null,
  device_id    uuid references public.devices(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    uuid references auth.users(id) on delete set null,
  void_reason  text,
  check (source <> 'manual' or note is not null and char_length(btrim(note)) > 0)
);
create index on public.punches (company_id, punched_at);
create index on public.punches (employee_id, punched_at);

-- ---------------------------------------------------------------------
-- Ferie e permessi
-- ---------------------------------------------------------------------
create table public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  type         public.leave_type not null,
  start_date   date not null,
  end_date     date not null,
  hours        numeric(4,2) check (hours is null or (hours > 0 and hours <= 24)), -- permessi a ore (solo giorno singolo)
  status       public.leave_status not null default 'pending',
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date),
  check (hours is null or start_date = end_date)
);
create index on public.leave_requests (company_id, start_date);

-- ---------------------------------------------------------------------
-- Registro modifiche (solo inserimenti, via trigger)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  company_id  uuid not null,                 -- niente FK: il registro sopravvive alle cancellazioni
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  data        jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_log (company_id, created_at desc);

-- =====================================================================
-- Funzioni di supporto per RLS (security definer per evitare ricorsione)
-- =====================================================================
create or replace function public.is_company_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_company_owner(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = cid and user_id = auth.uid() and role = 'owner');
$$;

-- =====================================================================
-- Registrazione: alla creazione dell'utente nasce la sua azienda.
-- Il "nome" inserito al signup (raw_user_meta_data.company_name) diventa il nome azienda.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  cname text := nullif(btrim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
begin
  -- Utenti invitati come dipendenti (fase successiva) non creano un'azienda
  if coalesce(new.raw_user_meta_data->>'signup_kind', 'owner') <> 'owner' then
    return new;
  end if;
  insert into companies (name) values (left(coalesce(cname, split_part(new.email, '@', 1)), 120))
    returning id into cid;
  insert into company_members (company_id, user_id, role) values (cid, new.id, 'owner');
  insert into company_settings (company_id) values (cid);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Audit trigger
-- =====================================================================
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (company_id, actor_id, action, entity, entity_id, data)
  values ((r->>'company_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, (r->>'id')::uuid, r);
  return coalesce(new, old);
end;
$$;

create trigger audit_punches   after insert or update on public.punches        for each row execute function public.audit_row();
create trigger audit_employees after insert or update or delete on public.employees for each row execute function public.audit_row();
create trigger audit_leave     after insert or update or delete on public.leave_requests for each row execute function public.audit_row();

-- Le timbrature non si modificano: si può solo annullarle (una volta).
create or replace function public.punches_guard()
returns trigger language plpgsql as $$
begin
  if old.voided_at is not null then
    raise exception 'Timbratura già annullata';
  end if;
  if (new.company_id, new.employee_id, new.kind, new.punched_at, new.source, new.device_id, new.created_by, new.note, new.created_at)
     is distinct from
     (old.company_id, old.employee_id, old.kind, old.punched_at, old.source, old.device_id, old.created_by, old.note, old.created_at) then
    raise exception 'Le timbrature non possono essere modificate, solo annullate';
  end if;
  if new.voided_at is null then
    raise exception 'Operazione non consentita';
  end if;
  new.voided_at := now();
  new.voided_by := auth.uid();
  return new;
end;
$$;
create trigger punches_guard before update on public.punches for each row execute function public.punches_guard();

-- Coerenza: dipendente e azienda devono corrispondere
create or replace function public.check_employee_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from employees e where e.id = new.employee_id and e.company_id = new.company_id) then
    raise exception 'Dipendente non appartenente all''azienda';
  end if;
  return new;
end;
$$;
create trigger punches_company_check before insert on public.punches        for each row execute function public.check_employee_company();
create trigger leave_company_check   before insert or update on public.leave_requests for each row execute function public.check_employee_company();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.companies        enable row level security;
alter table public.company_members  enable row level security;
alter table public.company_settings enable row level security;
alter table public.employees        enable row level security;
alter table public.employee_secrets enable row level security;  -- nessuna policy: accesso solo via funzioni
alter table public.devices          enable row level security;
alter table public.punches          enable row level security;
alter table public.leave_requests   enable row level security;
alter table public.audit_log        enable row level security;

-- Aziende: i membri leggono, il titolare modifica nome/logo/fuso. Piano e trial non modificabili dal client.
create policy companies_select on public.companies for select to authenticated using (public.is_company_member(id));
create policy companies_update on public.companies for update to authenticated
  using (public.is_company_owner(id)) with check (public.is_company_owner(id));
revoke update on public.companies from authenticated;
grant  update (name, logo_path, timezone) on public.companies to authenticated;

create policy members_select on public.company_members for select to authenticated using (public.is_company_member(company_id));

create policy settings_select on public.company_settings for select to authenticated using (public.is_company_member(company_id));
create policy settings_update on public.company_settings for update to authenticated
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));

-- Dipendenti: gestiti dal titolare; il dipendente collegato vede solo sé stesso.
create policy employees_select on public.employees for select to authenticated
  using (public.is_company_owner(company_id) or user_id = auth.uid());
create policy employees_insert on public.employees for insert to authenticated with check (public.is_company_owner(company_id));
create policy employees_update on public.employees for update to authenticated
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
create policy employees_delete on public.employees for delete to authenticated using (public.is_company_owner(company_id));
-- Il collegamento a un account utente (user_id) e il cambio azienda non sono modificabili dal client
revoke insert, update on public.employees from authenticated;
grant insert (company_id, first_name, last_name, email, active) on public.employees to authenticated;
grant update (first_name, last_name, email, active) on public.employees to authenticated;
revoke all on public.employee_secrets from anon, authenticated;

create policy devices_select on public.devices for select to authenticated using (public.is_company_owner(company_id));
create policy devices_update on public.devices for update to authenticated
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
revoke update on public.devices from authenticated;
grant update (name, revoked_at) on public.devices to authenticated;

-- Timbrature: il titolare legge, inserisce correzioni manuali e annulla. Il tablet passa da kiosk_punch().
create policy punches_select on public.punches for select to authenticated
  using (public.is_company_owner(company_id)
         or employee_id in (select id from public.employees where user_id = auth.uid()));
create policy punches_insert on public.punches for insert to authenticated
  with check (public.is_company_owner(company_id) and source = 'manual' and created_by = auth.uid());
create policy punches_update on public.punches for update to authenticated
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));

create policy leave_select on public.leave_requests for select to authenticated
  using (public.is_company_owner(company_id)
         or employee_id in (select id from public.employees where user_id = auth.uid()));
create policy leave_insert on public.leave_requests for insert to authenticated
  with check (public.is_company_owner(company_id)
              or (status = 'pending' and employee_id in (select id from public.employees where user_id = auth.uid())));
create policy leave_update on public.leave_requests for update to authenticated
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
create policy leave_delete on public.leave_requests for delete to authenticated using (public.is_company_owner(company_id));

create policy audit_select on public.audit_log for select to authenticated using (public.is_company_owner(company_id));

-- Nessun accesso diretto per anon alle tabelle
revoke all on all tables in schema public from anon;

-- =====================================================================
-- RPC: PIN dipendente (titolare)
-- =====================================================================
create or replace function public.set_employee_pin(p_employee_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select company_id into cid from employees where id = p_employee_id;
  if cid is null or not is_company_owner(cid) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'Il PIN deve avere da 4 a 6 cifre' using errcode = '22023';
  end if;
  insert into employee_secrets (employee_id, pin_hash)
  values (p_employee_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, failed_pin_attempts = 0, pin_locked_until = null;
end;
$$;

-- =====================================================================
-- RPC: registrazione tablet (titolare). Restituisce il token in chiaro una sola volta.
-- =====================================================================
create or replace function public.create_device(p_company_id uuid, p_name text default 'Tablet')
returns text language plpgsql security definer set search_path = public as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not is_company_owner(p_company_id) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  insert into devices (company_id, name, token_hash, created_by)
  values (p_company_id, left(coalesce(nullif(btrim(p_name), ''), 'Tablet'), 60),
          encode(extensions.digest(tok, 'sha256'), 'hex'), auth.uid());
  return tok;
end;
$$;

create or replace function public._device_from_token(p_token text)
returns public.devices language plpgsql security definer set search_path = public as $$
declare d devices;
begin
  select * into d from devices
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and revoked_at is null;
  if d.id is null then
    raise exception 'Tablet non autorizzato' using errcode = '42501';
  end if;
  update devices set last_seen_at = now() where id = d.id;
  return d;
end;
$$;
revoke execute on function public._device_from_token(text) from public, anon, authenticated;

-- =====================================================================
-- RPC tablet: elenco dipendenti attivi (solo nome) e timbratura.
-- Ora sempre lato server. Entrata/uscita decisa dall'ultima timbratura valida.
-- =====================================================================
create or replace function public.kiosk_info(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d devices; c companies;
begin
  d := _device_from_token(p_token);
  select * into c from companies where id = d.company_id;
  return jsonb_build_object(
    'company', jsonb_build_object('name', c.name, 'logo_path', c.logo_path, 'timezone', c.timezone),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'first_name', e.first_name, 'last_name', e.last_name,
               'has_pin', exists (select 1 from employee_secrets x where x.employee_id = e.id),
               'is_in', (select p.kind = 'in' and p.punched_at > now() - make_interval(mins => s.max_shift_minutes)
                           from punches p where p.employee_id = e.id and p.voided_at is null
                          order by p.punched_at desc limit 1))
             order by e.last_name, e.first_name)
        from employees e
        join company_settings s on s.company_id = e.company_id
       where e.company_id = d.company_id and e.active), '[]'::jsonb));
end;
$$;

create or replace function public.kiosk_punch(p_token text, p_employee_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d devices;
  e employees;
  sec employee_secrets;
  s company_settings;
  last_p punches;
  k punch_kind;
  ts timestamptz := now();
begin
  d := _device_from_token(p_token);
  select * into e from employees where id = p_employee_id and company_id = d.company_id and active for update;
  if e.id is null then
    raise exception 'Dipendente non trovato' using errcode = 'P0002';
  end if;
  select * into sec from employee_secrets where employee_id = e.id for update;
  if sec.employee_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pin');
  end if;
  if sec.pin_locked_until is not null and sec.pin_locked_until > ts then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', sec.pin_locked_until);
  end if;
  if sec.pin_hash <> extensions.crypt(coalesce(p_pin, ''), sec.pin_hash) then
    update employee_secrets
       set failed_pin_attempts = case when failed_pin_attempts + 1 >= 5 then 0 else failed_pin_attempts + 1 end,
           pin_locked_until   = case when failed_pin_attempts + 1 >= 5 then ts + interval '5 minutes' else null end
     where employee_id = e.id;
    return jsonb_build_object('ok', false, 'error', case when sec.failed_pin_attempts + 1 >= 5 then 'locked' else 'wrong_pin' end);
  end if;

  update employee_secrets set failed_pin_attempts = 0, pin_locked_until = null where employee_id = e.id;
  select * into s from company_settings where company_id = d.company_id;
  select * into last_p from punches
   where employee_id = e.id and voided_at is null order by punched_at desc limit 1;

  -- Doppio tocco: ignora timbrature ripetute entro 60 secondi
  if last_p.id is not null and last_p.punched_at > ts - interval '60 seconds' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'kind', last_p.kind, 'punched_at', last_p.punched_at,
                              'first_name', e.first_name);
  end if;

  if last_p.id is not null and last_p.kind = 'in'
     and last_p.punched_at > ts - make_interval(mins => s.max_shift_minutes) then
    k := 'out';
  else
    k := 'in';
  end if;

  insert into punches (company_id, employee_id, kind, punched_at, source, device_id)
  values (d.company_id, e.id, k, ts, 'kiosk', d.id);

  return jsonb_build_object('ok', true, 'kind', k, 'punched_at', ts, 'first_name', e.first_name);
end;
$$;

grant execute on function public.kiosk_info(text) to anon, authenticated;
grant execute on function public.kiosk_punch(text, uuid, text) to anon, authenticated;
revoke execute on function public.set_employee_pin(uuid, text) from anon;
revoke execute on function public.create_device(uuid, text) from anon;
