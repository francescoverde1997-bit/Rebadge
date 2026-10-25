-- =====================================================================
-- Fase 7 — Abbonamento (Stripe)
-- I campi dell'abbonamento li scrive solo il server (webhook Stripe con chiave service_role):
-- il client non li può modificare (grant a colonne della migrazione iniziale).
-- =====================================================================

alter table public.companies
  add column plan text check (plan is null or plan in ('base', 'plus', 'pro')),
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false;

-- Servizio attivo: prova non scaduta, abbonamento attivo o in ritardo di pagamento
create or replace function public.is_company_active(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when plan_status in ('active', 'past_due') then true
      when plan_status = 'trialing' then trial_ends_at > now()
      else false
    end
    from companies where id = cid), false);
$$;

-- Dipendenti attivi ammessi: 30 in prova, poi il limite del piano
create or replace function public.employee_limit(cid uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when c.plan_status = 'trialing' or c.plan is null then 30
    when c.plan = 'base' then 5
    when c.plan = 'plus' then 15
    else 30
  end
  from companies c where c.id = cid;
$$;

create or replace function public.employees_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; lim int;
begin
  if not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.active then return new; end if; -- già attivo: nessun cambio di conteggio
  select count(*) into n from employees where company_id = new.company_id and active and id <> new.id;
  lim := employee_limit(new.company_id);
  if n >= lim then
    raise exception 'Il piano attuale consente al massimo % dipendenti attivi', lim
      using errcode = 'configuration_limit_exceeded';
  end if;
  return new;
end;
$$;
create trigger employees_plan_limit before insert or update of active on public.employees
  for each row execute function public.employees_plan_limit();

-- Tablet sospeso se il servizio non è attivo (il token resta valido: riparte al rinnovo)
create or replace function public._kiosk_require_active(cid uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_company_active(cid) then
    raise exception 'Servizio sospeso: abbonamento non attivo' using errcode = 'P0004';
  end if;
end;
$$;
revoke execute on function public._kiosk_require_active(uuid) from public, anon, authenticated;

create or replace function public.kiosk_info(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d devices; c companies;
begin
  d := _device_from_token(p_token);
  perform _kiosk_require_active(d.company_id);
  select * into c from companies where id = d.company_id;
  return jsonb_build_object(
    'device', jsonb_build_object('name', d.name),
    'company', jsonb_build_object('name', c.name, 'logo_path', c.logo_path, 'timezone', c.timezone),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'first_name', e.first_name, 'last_name', e.last_name,
               'has_pin', e.pin_set_at is not null)
             order by e.first_name, e.last_name)
        from employees e
       where e.company_id = d.company_id and e.active), '[]'::jsonb));
end;
$$;

-- kiosk_punch: stessa logica di prima + servizio attivo
do $$
declare src text;
begin
  select pg_get_functiondef('public.kiosk_punch(text, uuid, text)'::regprocedure) into src;
  src := replace(src, 'd := _device_from_token(p_token);', 'd := _device_from_token(p_token);
  perform _kiosk_require_active(d.company_id);');
  execute src;
end $$;
