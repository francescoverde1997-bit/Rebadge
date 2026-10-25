-- Test Fase 5: ferie, permessi, malattia
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000005', 'gelateria@x.it', '{"company_name":"Gelateria Neve"}');
create temp table c5 as select company_id as a from company_members where user_id = 'e0000000-0000-0000-0000-000000000005';
grant select on c5 to anon, authenticated;

select pg_temp.as_user('e0000000-0000-0000-0000-000000000005');
select create_employee((select a from c5), 'Sofia', 'Neve', null, '5813');

do $$
declare eid uuid := (select id from employees where first_name = 'Sofia'); lid uuid;
begin
  assert (select not work_saturday from company_settings where company_id = (select a from c5)), 'Settimana di 5 giorni predefinita';
  update company_settings set work_saturday = true where company_id = (select a from c5);

  insert into leave_requests (company_id, employee_id, type, start_date, end_date, status, created_by)
  values ((select a from c5), eid, 'ferie', '2026-08-10', '2026-08-21', 'approved', auth.uid())
  returning id into lid;
  assert (select decided_by = auth.uid() and decided_at is not null from leave_requests where id = lid), 'Approvazione registrata';

  -- sovrapposizione rifiutata
  begin
    insert into leave_requests (company_id, employee_id, type, start_date, end_date, status, created_by)
    values ((select a from c5), eid, 'malattia', '2026-08-21', '2026-08-24', 'approved', auth.uid());
    raise exception 'FAIL: assenze sovrapposte accettate';
  exception when exclusion_violation then null; end;

  -- due permessi a ore nello stesso giorno: ammessi
  insert into leave_requests (company_id, employee_id, type, start_date, end_date, hours, status, created_by)
  values ((select a from c5), eid, 'permesso', '2026-09-01', '2026-09-01', 2, 'approved', auth.uid()),
         ((select a from c5), eid, 'permesso', '2026-09-01', '2026-09-01', 1.5, 'approved', auth.uid());

  -- permesso a ore su più giorni: rifiutato
  begin
    insert into leave_requests (company_id, employee_id, type, start_date, end_date, hours, status, created_by)
    values ((select a from c5), eid, 'permesso', '2026-09-02', '2026-09-03', 2, 'approved', auth.uid());
    raise exception 'FAIL: permesso a ore su più giorni';
  exception when check_violation then null; end;

  -- eliminazione da parte del titolare
  delete from leave_requests where id = lid;
  assert not exists (select 1 from leave_requests where id = lid), 'Il titolare elimina un''assenza';
end $$;

-- Un altro titolare non vede né tocca le assenze
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  assert (select count(*) from leave_requests where company_id = (select a from c5)) = 0, 'Assenze isolate per azienda';
  delete from leave_requests where company_id = (select a from c5);
end $$;
reset role;
do $$ begin
  assert (select count(*) from leave_requests where company_id = (select a from c5)) = 2, 'Nessuna eliminazione da altre aziende';
  assert (select count(*) from audit_log where entity = 'leave_requests' and company_id = (select a from c5)) >= 4, 'Assenze nel registro modifiche';
end $$;

\echo 'TEST ASSENZE SUPERATI'
