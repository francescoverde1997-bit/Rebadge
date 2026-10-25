-- =====================================================================
-- Piani: Base (5 dipendenti), Plus (30), Personalizzato (su preventivo)
-- + richieste di preventivo per il Personalizzato (anche da visitatori non registrati)
-- =====================================================================

-- I clienti eventualmente sul vecchio piano Pro (30 dipendenti) passano a Plus, che ora copre 30
update public.companies set plan = 'plus' where plan = 'pro';

alter table public.companies drop constraint if exists companies_plan_check;
alter table public.companies
  add constraint companies_plan_check check (plan is null or plan in ('base', 'plus', 'custom')),
  -- Limite dipendenti del Personalizzato, impostato dal nostro team (null = 1000)
  add column custom_employee_limit int check (custom_employee_limit is null or custom_employee_limit between 1 and 100000);

create or replace function public.employee_limit(cid uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when c.plan_status = 'trialing' or c.plan is null then 30
    when c.plan = 'base' then 5
    when c.plan = 'plus' then 30
    when c.plan = 'custom' then coalesce(c.custom_employee_limit, 1000)
    else 30
  end
  from companies c where c.id = cid;
$$;

-- ---------------------------------------------------------------------
-- Richieste di preventivo
-- Nessuna lettura dal client: le legge solo il nostro team (service_role / dashboard Supabase).
-- ---------------------------------------------------------------------
create table public.custom_plan_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid,
  company_name text not null check (length(company_name) between 2 and 120),
  contact_name text not null check (length(contact_name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone text check (phone is null or length(phone) <= 40),
  employees_range text not null check (employees_range in ('31-50', '51-100', '101-250', '250+')),
  locations int check (locations is null or locations between 1 and 1000),
  message text check (message is null or length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost'))
);
alter table public.custom_plan_requests enable row level security;
revoke all on public.custom_plan_requests from anon, authenticated;
create index custom_plan_requests_created on public.custom_plan_requests (created_at desc);

create or replace function public.request_custom_plan(
  p_company_name text, p_contact_name text, p_email text, p_phone text,
  p_employees_range text, p_locations int, p_message text
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  e text := lower(trim(coalesce(p_email, '')));
begin
  -- Anti-spam: al massimo 3 richieste in un'ora dalla stessa email
  if (select count(*) from custom_plan_requests where email = e and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Hai già inviato una richiesta: ti ricontatteremo a breve' using errcode = 'P0005';
  end if;
  if uid is not null then
    select company_id into cid from company_members where user_id = uid limit 1;
  end if;
  insert into custom_plan_requests (company_id, user_id, company_name, contact_name, email, phone, employees_range, locations, message)
  values (cid, uid, trim(p_company_name), trim(p_contact_name), e, nullif(trim(coalesce(p_phone, '')), ''),
          p_employees_range, p_locations, nullif(trim(coalesce(p_message, '')), ''));
end;
$$;
revoke execute on function public.request_custom_plan(text, text, text, text, text, int, text) from public;
grant execute on function public.request_custom_plan(text, text, text, text, text, int, text) to anon, authenticated;
