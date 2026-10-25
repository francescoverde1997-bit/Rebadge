-- Test: malattia con protocollo INPS, modifica ed eliminazione
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-0000-0000-000000000009', 'forno.nove@x.it', '{"company_name":"Forno Nove"}'),
  ('b9000000-0000-0000-0000-000000000009', 'altra.ditta9@x.it', '{"company_name":"Altra Ditta"}');
create temp table c9 as select company_id as a from company_members where user_id = 'a9000000-0000-0000-0000-000000000009';
create temp table l9 (id uuid);
grant select on c9 to anon, authenticated; grant all on l9 to anon, authenticated;

select pg_temp.as_user('a9000000-0000-0000-0000-000000000009');
select create_employee((select a from c9), 'Marco', 'Forno', null, '5813');
select create_employee((select a from c9), 'Luca', 'Forno', null, '7316');

do $$
declare eid uuid := (select id from employees where first_name = 'Marco'); lid uuid;
begin
  insert into leave_requests (company_id, employee_id, type, start_date, end_date, status, created_by, inps_protocol)
  values ((select a from c9), eid, 'malattia', '2026-11-02', '2026-11-04', 'approved', auth.uid(), '123456789')
  returning id into lid;
  insert into l9 values (lid);

  -- il protocollo vale solo per la malattia
  begin
    insert into leave_requests (company_id, employee_id, type, start_date, end_date, status, inps_protocol)
    values ((select a from c9), eid, 'ferie', '2026-11-20', '2026-11-20', 'approved', '123456789');
    raise exception 'FAIL: protocollo su ferie accettato';
  exception when check_violation then null; end;
  -- formato non valido
  begin
    update leave_requests set inps_protocol = '12; drop' where id = lid;
    raise exception 'FAIL: protocollo non valido accettato';
  exception when check_violation then null; end;

  -- modifica: date e protocollo
  update leave_requests set end_date = '2026-11-06', inps_protocol = '987654321' where id = lid;
  assert (select end_date = '2026-11-06' and inps_protocol = '987654321' from leave_requests where id = lid), 'Modifica salvata';
  -- modifica: dipendente sbagliato corretto
  update leave_requests set employee_id = (select id from employees where first_name = 'Luca') where id = lid;
  -- cambiare tipo in ferie con il protocollo ancora presente è rifiutato (va tolto)
  begin
    update leave_requests set type = 'ferie' where id = lid;
    raise exception 'FAIL: tipo cambiato lasciando il protocollo';
  exception when check_violation then null; end;
end $$;

-- il registro modifiche traccia la modifica
reset role;
do $$ begin
  assert (select count(*) from audit_log where entity = 'leave_requests' and entity_id = (select id from l9) and action = 'update') >= 2,
    'Modifiche nel registro';
end $$;

-- un'altra azienda non vede né modifica la malattia
select pg_temp.as_user('b9000000-0000-0000-0000-000000000009');
do $$ begin
  assert (select count(*) from leave_requests where id = (select id from l9)) = 0, 'Altra azienda non vede';
  update leave_requests set inps_protocol = '000000000' where id = (select id from l9);
end $$;
reset role;
do $$ begin
  assert (select inps_protocol from leave_requests where id = (select id from l9)) = '987654321', 'Altra azienda non modifica';
end $$;

-- mese chiuso: niente modifica né eliminazione
insert into month_closures (company_id, month, closed_by, settings, totals, pdf_path)
select a, '2026-11', 'a9000000-0000-0000-0000-000000000009', '{}', '{}', a || '/2026-11.pdf' from c9;
select pg_temp.as_user('a9000000-0000-0000-0000-000000000009');
do $$ begin
  begin
    update leave_requests set end_date = '2026-11-07' where id = (select id from l9);
    raise exception 'FAIL: malattia modificata in mese chiuso';
  exception when sqlstate '55000' then null; end;
  begin
    delete from leave_requests where id = (select id from l9);
    raise exception 'FAIL: malattia eliminata in mese chiuso';
  exception when sqlstate '55000' then null; end;
end $$;

select 'OK 90_sick';
