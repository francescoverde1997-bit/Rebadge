-- Test Fase 3: tablet
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000003', 'pizzeria@x.it', '{"company_name":"Pizzeria Sole"}');
create temp table c3 as select company_id as a from company_members where user_id = 'c0000000-0000-0000-0000-000000000003';
create temp table t3 (t text);
grant select on c3 to anon, authenticated; grant all on t3 to anon, authenticated;

do $$ begin
  assert (select public from storage.buckets where id = 'logos'), 'Bucket logo in lettura pubblica';
end $$;

select pg_temp.as_user('c0000000-0000-0000-0000-000000000003');
select create_employee((select a from c3), 'Marco', 'Sole', null, '5813');
insert into t3 select create_device((select a from c3), 'Cassa');
do $$ begin
  assert (select count(*) from devices where name = 'Cassa' and last_seen_at is null) = 1, 'Tablet creato, mai usato';
  begin
    update devices set name = '   ' where name = 'Cassa';
    raise exception 'FAIL: nome tablet vuoto accettato';
  exception when check_violation then null; end;
  begin
    update devices set token_hash = 'x';
    raise exception 'FAIL: token modificabile dal client';
  exception when insufficient_privilege then null; end;
end $$;

select pg_temp.as_user(null);
do $$
declare r jsonb := kiosk_info((select t from t3)); e jsonb := r->'employees'->0;
begin
  assert r->'device'->>'name' = 'Cassa', 'Il tablet conosce il proprio nome';
  assert not (e ? 'is_in'), 'Il tablet non espone chi è presente';
  assert e->>'first_name' = 'Marco' and (e->>'has_pin')::boolean, 'Dipendente con PIN';
end $$;

reset role;
do $$ begin
  assert (select last_seen_at from devices where name = 'Cassa') is not null, 'Ultimo utilizzo registrato';
end $$;

reset role;
\echo 'TEST TABLET SUPERATI'
