-- Test: piani Base/Plus/Personalizzato e richieste di preventivo
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-0000-0000-000000000008', 'grande@x.it', '{"company_name":"Grande Srl"}');
create temp table c8 as select company_id as a from company_members where user_id = 'a8000000-0000-0000-0000-000000000008';
grant select on c8 to anon, authenticated;

-- limiti per piano
do $$ declare cid uuid := (select a from c8); begin
  update companies set plan_status = 'active', plan = 'base' where id = cid;
  assert employee_limit(cid) = 5, 'Base 5';
  update companies set plan = 'plus' where id = cid;
  assert employee_limit(cid) = 30, 'Plus 30';
  update companies set plan = 'custom' where id = cid;
  assert employee_limit(cid) = 1000, 'Personalizzato predefinito 1000';
  update companies set custom_employee_limit = 120 where id = cid;
  assert employee_limit(cid) = 120, 'Personalizzato su misura';
  begin
    update companies set plan = 'pro' where id = cid;
    raise exception 'FAIL: piano pro ancora ammesso';
  exception when check_violation then null; end;
end $$;

-- il titolare non può alzarsi il limite da solo
select pg_temp.as_user('a8000000-0000-0000-0000-000000000008');
do $$ begin
  begin
    update companies set custom_employee_limit = 5000 where id = (select a from c8);
    raise exception 'FAIL: il client ha cambiato il limite del Personalizzato';
  exception when insufficient_privilege then null; end;
end $$;

-- titolare collegato: la richiesta si lega alla sua azienda
select request_custom_plan('Grande Srl', 'Mario Grandi', ' Mario@Grande.IT ', '333 1234567', '51-100', 3, 'Abbiamo 3 sedi');
do $$ begin
  begin
    perform count(*) from custom_plan_requests;
    raise exception 'FAIL: il client legge le richieste';
  exception when insufficient_privilege then null; end;
  begin
    insert into custom_plan_requests (company_name, contact_name, email, employees_range) values ('x', 'y', 'a@b.it', '31-50');
    raise exception 'FAIL: il client scrive direttamente le richieste';
  exception when insufficient_privilege then null; end;
end $$;

-- visitatore anonimo (pagina Prezzi)
select pg_temp.as_user(null);
select request_custom_plan('Hotel Mare', 'Lucia Blu', 'lucia@hotelmare.it', null, '101-250', null, null);
do $$ begin
  begin
    perform request_custom_plan('X', 'Lucia Blu', 'lucia@hotelmare.it', null, '101-250', null, null);
    raise exception 'FAIL: nome azienda troppo corto accettato';
  exception when check_violation then null; end;
  begin
    perform request_custom_plan('Hotel Mare', 'Lucia Blu', 'non-una-mail', null, '101-250', null, null);
    raise exception 'FAIL: email non valida accettata';
  exception when check_violation then null; end;
  begin
    perform request_custom_plan('Hotel Mare', 'Lucia Blu', 'lucia@hotelmare.it', null, '5-10', null, null);
    raise exception 'FAIL: fascia dipendenti non valida accettata';
  exception when check_violation then null; end;
  -- anti-spam: 3 richieste l'ora per email
  perform request_custom_plan('Hotel Mare', 'Lucia Blu', 'lucia@hotelmare.it', null, '101-250', null, null);
  perform request_custom_plan('Hotel Mare', 'Lucia Blu', 'lucia@hotelmare.it', null, '101-250', null, null);
  begin
    perform request_custom_plan('Hotel Mare', 'Lucia Blu', 'lucia@hotelmare.it', null, '101-250', null, null);
    raise exception 'FAIL: anti-spam non applicato';
  exception when sqlstate 'P0005' then null; end;
end $$;

reset role;
do $$ begin
  assert (select company_id from custom_plan_requests where email = 'mario@grande.it') = (select a from c8), 'Richiesta legata all''azienda';
  assert (select company_id from custom_plan_requests where email = 'lucia@hotelmare.it' limit 1) is null, 'Richiesta anonima senza azienda';
  assert (select count(*) from custom_plan_requests where email = 'lucia@hotelmare.it') = 3, 'Tre richieste anonime';
end $$;

select 'OK 80_plans_custom';
