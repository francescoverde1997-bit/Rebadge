-- Test Fase 2: gestione dipendenti e PIN
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'titolare@officina.it', '{"company_name":"Officina Verdi"}'),
  ('b0000000-0000-0000-0000-000000000002', 'altro@negozio.it',     '{"company_name":"Negozio Blu"}');
create temp table c2 as select
  (select company_id from company_members where user_id = 'a0000000-0000-0000-0000-000000000001') as a,
  (select company_id from company_members where user_id = 'b0000000-0000-0000-0000-000000000002') as b;
grant select on c2 to anon, authenticated;

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
do $$
declare eid uuid; r record;
begin
  eid := create_employee((select a from c2), '  Luca ', ' Verdi ', ' Luca@Officina.IT ', '4821');
  select * into r from employees where id = eid;
  assert r.first_name = 'Luca' and r.last_name = 'Verdi', 'Nomi ripuliti dagli spazi';
  assert r.email = 'luca@officina.it', 'Email normalizzata';
  assert r.pin_set_at is not null, 'PIN segnato come impostato';
  assert r.active, 'Nuovo dipendente attivo';

  perform create_employee((select a from c2), 'Sara', 'Neri', '', '9152');
  assert (select email from employees where first_name = 'Sara') is null, 'Email facoltativa';

  -- PIN non valido: nessun dipendente creato (operazione atomica)
  begin
    perform create_employee((select a from c2), 'Zeno', 'Bianchi', null, '12a4');
    raise exception 'FAIL: PIN non numerico accettato';
  exception when invalid_parameter_value then null; end;
  assert not exists (select 1 from employees where first_name = 'Zeno'), 'Creazione annullata se il PIN non è valido';

  -- Cambio PIN
  perform set_employee_pin(eid, '777333');

  -- Modifica e disattivazione
  update employees set last_name = 'Verdi Rossi', email = null where id = eid;
  update employees set active = false where id = eid;
  assert not (select active from employees where id = eid), 'Disattivazione';

  -- Campi protetti non modificabili dal client
  begin
    update employees set pin_set_at = null where id = eid;
    raise exception 'FAIL: pin_set_at modificabile';
  exception when insufficient_privilege then null; end;
  begin
    update employees set company_id = (select b from c2) where id = eid;
    raise exception 'FAIL: cambio azienda possibile';
  exception when insufficient_privilege then null; end;
end $$;

-- Il tablet non mostra i disattivati
reset role;
create temp table t2 (t text); grant all on t2 to anon, authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
insert into t2 select create_device((select a from c2), 'Officina');
select pg_temp.as_user(null);
do $$
declare r jsonb := kiosk_info((select t from t2));
begin
  assert jsonb_array_length(r->'employees') = 1, 'Solo i dipendenti attivi sul tablet';
  assert (r->'employees'->0->>'first_name') = 'Sara' and (r->'employees'->0->>'has_pin')::boolean, 'Stato PIN dal tablet';
end $$;

-- Il titolare di un'altra azienda non può creare dipendenti né cambiare PIN
select pg_temp.as_user('b0000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform create_employee((select a from c2), 'X', 'Y', null, '1111');
    raise exception 'FAIL: dipendente creato in un''altra azienda';
  exception when insufficient_privilege then null; end;
  begin
    perform set_employee_pin((select id from public.employees where false limit 1), '1111');
    raise exception 'FAIL: PIN cambiato';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare luca uuid := (select id from employees where first_name = 'Luca');
begin
  -- B prova il PIN di un dipendente di A
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', false);
  set local role authenticated;
  begin
    perform set_employee_pin(luca, '1111');
    raise exception 'FAIL: B ha cambiato il PIN di A';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- anon non può creare dipendenti
select pg_temp.as_user(null);
do $$ begin
  begin
    perform create_employee((select a from c2), 'X', 'Y', null, '1111');
    raise exception 'FAIL: anon crea dipendenti';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
\echo 'TEST DIPENDENTI SUPERATI'
