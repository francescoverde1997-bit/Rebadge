-- Test Fase 7: abbonamento
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-0000-0000-000000000007', 'bistrot@x.it', '{"company_name":"Bistrot Sette"}');
create temp table c7 as select company_id as a from company_members where user_id = 'a7000000-0000-0000-0000-000000000007';
create temp table t7 (t text);
grant select on c7 to anon, authenticated; grant all on t7 to anon, authenticated;

-- il titolare non può darsi un piano o un abbonamento da solo
select pg_temp.as_user('a7000000-0000-0000-0000-000000000007');
do $$ begin
  begin
    update companies set plan = 'plus', plan_status = 'active' where id = (select a from c7);
    raise exception 'FAIL: il client si è attivato l''abbonamento';
  exception when insufficient_privilege then null; end;
  begin
    update companies set stripe_customer_id = 'cus_x' where id = (select a from c7);
    raise exception 'FAIL: il client ha cambiato il cliente Stripe';
  exception when insufficient_privilege then null; end;
end $$;

-- in prova: fino a 30 dipendenti
do $$ begin
  for i in 1..6 loop
    perform create_employee((select a from c7), 'Dip' || i, 'Prova', null, '58' || (10 + i));
  end loop;
  assert employee_limit((select a from c7)) = 30, 'Limite in prova';
end $$;
insert into t7 select create_device((select a from c7), 'Sala');

-- il server (webhook) attiva il piano Base: 5 dipendenti
reset role;
update companies set plan_status = 'active', plan = 'base', stripe_customer_id = 'cus_7', stripe_subscription_id = 'sub_7'
 where id = (select a from c7);

select pg_temp.as_user('a7000000-0000-0000-0000-000000000007');
do $$
declare extra uuid;
begin
  -- già 6 attivi: un settimo non entra
  begin
    perform create_employee((select a from c7), 'Settimo', 'Prova', null, '5899');
    raise exception 'FAIL: superato il limite del piano';
  exception when configuration_limit_exceeded then null; end;
  -- si può disattivare e modificare chi c'è già
  update employees set active = false where first_name = 'Dip6';
  update employees set last_name = 'Rossi' where first_name = 'Dip1';
  -- riattivare oltre il limite non è possibile
  update employees set active = false where first_name = 'Dip5';
  update employees set active = true where first_name = 'Dip5';
  begin
    update employees set active = true where first_name = 'Dip6';
    raise exception 'FAIL: riattivato oltre il limite';
  exception when configuration_limit_exceeded then null; end;
end $$;

-- tablet: funziona con abbonamento attivo
select pg_temp.as_user(null);
do $$ begin
  perform kiosk_info((select t from t7));
end $$;

-- abbonamento annullato: tablet sospeso (ma non revocato)
reset role;
create temp table e7 as select id from employees where first_name = 'Dip1' and company_id = (select a from c7);
grant select on e7 to anon;
update companies set plan_status = 'canceled' where id = (select a from c7);
select pg_temp.as_user(null);
do $$
declare eid uuid := (select id from e7);
begin
  begin
    perform kiosk_info((select t from t7));
    raise exception 'FAIL: tablet attivo senza abbonamento';
  exception when sqlstate 'P0004' then null; end;
  begin
    perform kiosk_punch((select t from t7), eid, '5811');
    raise exception 'FAIL: timbratura senza abbonamento';
  exception when sqlstate 'P0004' then null; end;
end $$;

-- prova scaduta: stesso comportamento; prova valida: tablet ok
reset role;
update companies set plan_status = 'trialing', trial_ends_at = now() - interval '1 day' where id = (select a from c7);
do $$ begin assert not is_company_active((select a from c7)), 'Prova scaduta = non attivo'; end $$;
update companies set trial_ends_at = now() + interval '1 day' where id = (select a from c7);
select pg_temp.as_user(null);
do $$ begin perform kiosk_info((select t from t7)); end $$;

reset role;
\echo 'TEST ABBONAMENTO SUPERATI'
