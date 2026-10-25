-- Test Fase 6: chiusura del mese
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000006', 'forno@x.it', '{"company_name":"Forno Antico"}');
create temp table c6 as select company_id as a,
  to_char(now() at time zone 'Europe/Rome' - interval '1 month', 'YYYY-MM') as prev,
  to_char(now() at time zone 'Europe/Rome', 'YYYY-MM') as cur
  from company_members where user_id = 'f0000000-0000-0000-0000-000000000006';
grant select on c6 to anon, authenticated;

select pg_temp.as_user('f0000000-0000-0000-0000-000000000006');
select create_employee((select a from c6), 'Ugo', 'Forno', null, '5813');

-- timbratura e assenza nel mese scorso, prima della chiusura
do $$
declare eid uuid := (select id from employees where first_name = 'Ugo');
        prev_day date := (select (prev || '-10')::date from c6);
begin
  insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
  values ((select a from c6), eid, 'in', (prev_day + time '08:00') at time zone 'Europe/Rome', 'manual', auth.uid(), 'Prova');
  insert into leave_requests (company_id, employee_id, type, start_date, end_date, status, created_by)
  values ((select a from c6), eid, 'ferie', prev_day + 5, prev_day + 6, 'approved', auth.uid());
end $$;

do $$
declare ts timestamptz;
begin
  -- mese in corso: non si chiude
  begin
    perform close_month((select a from c6), (select cur from c6), '{}', '{}', (select a from c6)::text || '/x.pdf');
    raise exception 'FAIL: chiuso il mese in corso';
  exception when invalid_parameter_value then null; end;
  -- PDF di un'altra azienda: rifiutato
  begin
    perform close_month((select a from c6), (select prev from c6), '{}', '{}', 'altra-azienda/x.pdf');
    raise exception 'FAIL: percorso PDF non controllato';
  exception when invalid_parameter_value then null; end;

  ts := close_month((select a from c6), (select prev from c6), '{"roundingMinutes":0}', '{"Ugo":0}', (select a from c6)::text || '/prev.pdf');
  assert ts is not null, 'Mese scorso chiuso';

  -- una seconda chiusura non è possibile
  begin
    perform close_month((select a from c6), (select prev from c6), '{}', '{}', (select a from c6)::text || '/x.pdf');
    raise exception 'FAIL: chiuso due volte';
  exception when unique_violation then null; end;
end $$;

-- dopo la chiusura: niente modifiche al mese chiuso
do $$
declare eid uuid := (select id from employees where first_name = 'Ugo');
        prev_day date := (select (prev || '-12')::date from c6);
begin
  begin
    insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
    values ((select a from c6), eid, 'out', (prev_day + time '17:00') at time zone 'Europe/Rome', 'manual', auth.uid(), 'Tardi');
    raise exception 'FAIL: timbratura aggiunta a mese chiuso';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    update punches set voided_at = now(), void_reason = 'Ci ho ripensato' where employee_id = eid;
    raise exception 'FAIL: timbratura annullata in mese chiuso';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    delete from leave_requests where employee_id = eid;
    raise exception 'FAIL: assenza eliminata in mese chiuso';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    -- un'assenza che tocca anche solo un giorno del mese chiuso
    insert into leave_requests (company_id, employee_id, type, start_date, end_date, status, created_by)
    values ((select a from c6), eid, 'malattia', (select (cur || '-01')::date - 1 from c6), (select (cur || '-01')::date + 1 from c6), 'approved', auth.uid());
    raise exception 'FAIL: assenza a cavallo di un mese chiuso';
  exception when object_not_in_prerequisite_state then null; end;

  -- il mese in corso resta modificabile
  insert into leave_requests (company_id, employee_id, type, start_date, end_date, status, created_by)
  values ((select a from c6), eid, 'malattia', (select (cur || '-01')::date from c6), (select (cur || '-01')::date from c6), 'approved', auth.uid());

  -- il titolare non può cancellare la chiusura né riaprire il mese
  begin
    delete from month_closures;
    raise exception 'FAIL: chiusura cancellata dal titolare';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from month_closures) = 1, 'Chiusura visibile al titolare';
  begin
    perform support_reopen_month((select a from c6), (select prev from c6));
    raise exception 'FAIL: il titolare ha riaperto il mese';
  exception when insufficient_privilege then null; end;
end $$;

-- un altro titolare non vede né chiude il mese di un'altra azienda
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  assert (select count(*) from month_closures where company_id = (select a from c6)) = 0, 'Chiusure isolate per azienda';
  begin
    perform close_month((select a from c6), (select prev from c6), '{}', '{}', (select a from c6)::text || '/x.pdf');
    raise exception 'FAIL: chiusura da altra azienda';
  exception when insufficient_privilege then null; end;
end $$;

-- assistenza: riapre il mese, poi le modifiche tornano possibili
reset role;
do $$ begin
  assert support_reopen_month((select a from c6), (select prev from c6)), 'Mese riaperto dall''assistenza';
  assert (select count(*) from audit_log where entity = 'month_closures' and company_id = (select a from c6)) = 2,
    'Chiusura e riapertura nel registro modifiche';
end $$;
select pg_temp.as_user('f0000000-0000-0000-0000-000000000006');
do $$
declare eid uuid := (select id from employees where first_name = 'Ugo');
begin
  insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
  values ((select a from c6), eid, 'out', ((select (prev || '-10')::date from c6) + time '17:00') at time zone 'Europe/Rome', 'manual', auth.uid(), 'Dopo riapertura');
end $$;

reset role;
\echo 'TEST CHIUSURA SUPERATI'
