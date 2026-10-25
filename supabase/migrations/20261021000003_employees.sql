-- =====================================================================
-- Fase 2 — Dipendenti
-- - pin_set_at: il titolare vede se il PIN è impostato senza poter leggere il PIN
-- - create_employee: crea dipendente + PIN in un'unica operazione atomica
-- =====================================================================

alter table public.employees add column pin_set_at timestamptz;
-- pin_set_at è scritto solo dalle funzioni: niente grant di insert/update al client
-- (i grant a colonne della migrazione iniziale restano invariati)

create or replace function public._validate_pin(p_pin text)
returns void language plpgsql immutable as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'Il PIN deve avere da 4 a 6 cifre' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.set_employee_pin(p_employee_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select company_id into cid from employees where id = p_employee_id;
  if cid is null or not is_company_owner(cid) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  perform _validate_pin(p_pin);
  insert into employee_secrets (employee_id, pin_hash)
  values (p_employee_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, failed_pin_attempts = 0, pin_locked_until = null;
  update employees set pin_set_at = now() where id = p_employee_id;
end;
$$;

create or replace function public.create_employee(
  p_company_id uuid, p_first_name text, p_last_name text, p_email text, p_pin text
) returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if not is_company_owner(p_company_id) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  perform _validate_pin(p_pin);
  insert into employees (company_id, first_name, last_name, email)
  values (p_company_id, btrim(p_first_name), btrim(p_last_name), nullif(lower(btrim(coalesce(p_email, ''))), ''))
  returning id into eid;
  insert into employee_secrets (employee_id, pin_hash)
  values (eid, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)));
  update employees set pin_set_at = now() where id = eid;
  return eid;
end;
$$;

revoke execute on function public.create_employee(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_employee(uuid, text, text, text, text) to authenticated;
revoke execute on function public.set_employee_pin(uuid, text) from public, anon;
grant execute on function public.set_employee_pin(uuid, text) to authenticated;
revoke execute on function public._validate_pin(text) from public, anon, authenticated;

-- kiosk_info: usa pin_set_at invece di interrogare i segreti
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
               'has_pin', e.pin_set_at is not null,
               'is_in', (select p.kind = 'in' and p.punched_at > now() - make_interval(mins => s.max_shift_minutes)
                           from punches p where p.employee_id = e.id and p.voided_at is null
                          order by p.punched_at desc limit 1))
             order by e.last_name, e.first_name)
        from employees e
        join company_settings s on s.company_id = e.company_id
       where e.company_id = d.company_id and e.active), '[]'::jsonb));
end;
$$;

-- Dipendenti esistenti con PIN già impostato
update public.employees e set pin_set_at = now()
 where pin_set_at is null and exists (select 1 from public.employee_secrets s where s.employee_id = e.id);
