-- Test Fase 4: correzioni delle timbrature
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000004', 'ferramenta@x.it', '{"company_name":"Ferramenta Monti"}');
create temp table c4 as select company_id as a from company_members where user_id = 'd0000000-0000-0000-0000-000000000004';
grant select on c4 to anon, authenticated;

select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
select create_employee((select a from c4), 'Paolo', 'Monti', null, '5813');

do $$
declare eid uuid := (select id from employees where first_name = 'Paolo'); pid uuid;
begin
  -- correzione valida nel passato
  insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
  values ((select a from c4), eid, 'in', now() - interval '1 day', 'manual', auth.uid(), 'Entrata dimenticata')
  returning id into pid;

  -- nel futuro: rifiutata
  begin
    insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
    values ((select a from c4), eid, 'out', now() + interval '2 hours', 'manual', auth.uid(), 'Uscita anticipata');
    raise exception 'FAIL: timbratura nel futuro accettata';
  exception when invalid_parameter_value then null; end;

  -- annullamento senza motivo: rifiutato
  begin
    update punches set voided_at = now() where id = pid;
    raise exception 'FAIL: annullamento senza motivo';
  exception when check_violation then null; end;

  -- annullamento con motivo: registrato con autore
  update punches set voided_at = now(), void_reason = 'Inserita per errore' where id = pid;
  assert (select voided_by from punches where id = pid) = auth.uid(), 'Autore dell''annullamento registrato';

  -- una timbratura annullata non si "riattiva" né si modifica
  begin
    update punches set voided_at = null, void_reason = null where id = pid;
    raise exception 'FAIL: annullamento revocato';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from audit_log where entity = 'punches'
            and (data->>'employee_id')::uuid = (select id from employees where first_name = 'Paolo')) = 2,
    'Inserimento e annullamento finiscono nel registro modifiche';
end $$;

-- Ore notturne/festive: valori predefiniti e modificabili solo dal titolare
do $$ begin
  assert (select track_night and track_holiday and night_start_minutes = 1320 and night_end_minutes = 360
            from company_settings where company_id = (select a from c4)), 'Predefiniti 22:00-06:00, conteggio attivo';
end $$;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
update company_settings set track_night = false, track_holiday = false, night_start_minutes = 0 where company_id = (select a from c4);
do $$ begin
  begin
    update company_settings set night_end_minutes = 0 where company_id = (select a from c4);
    raise exception 'FAIL: fascia notturna vuota accettata';
  exception when check_violation then null; end;
end $$;
-- un altro titolare non può cambiarle
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update company_settings set track_night = true where company_id = (select a from c4);
reset role;
do $$ begin
  assert (select not track_night and not track_holiday and night_start_minutes = 0
            from company_settings where company_id = (select a from c4)), 'Il titolare disattiva e modifica; gli altri no';
end $$;

-- Santo Patrono
select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
update company_settings set patron_month_day = '06-24', patron_name = 'San Giovanni' where company_id = (select a from c4);
do $$ begin
  begin
    update company_settings set patron_month_day = '02-30' where company_id = (select a from c4);
    raise exception 'FAIL: data inesistente accettata';
  exception when check_violation then null; end;
  begin
    update company_settings set patron_month_day = '6-24' where company_id = (select a from c4);
    raise exception 'FAIL: formato non valido accettato';
  exception when check_violation then null; end;
  update company_settings set patron_month_day = '02-29' where company_id = (select a from c4);
end $$;
reset role;
do $$ begin
  assert (select patron_month_day = '02-29' and patron_name = 'San Giovanni' from company_settings where company_id = (select a from c4)),
    'Patrono salvato dal titolare';
end $$;

\echo 'TEST CORREZIONI SUPERATI'
