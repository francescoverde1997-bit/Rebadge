-- Test permessi minimi (migrazione 13): niente TRUNCATE/TRIGGER/REFERENCES ai ruoli del browser,
-- nessun accesso diretto alle tabelle per i visitatori anonimi, anche sulle tabelle future.
\set ON_ERROR_STOP on

do $$
declare t text; p text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    foreach p in array array['TRUNCATE', 'TRIGGER', 'REFERENCES'] loop
      assert not has_table_privilege('authenticated', format('public.%I', t), p), format('authenticated ha %s su %s', p, t);
      assert not has_table_privilege('anon', format('public.%I', t), p), format('anon ha %s su %s', p, t);
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      assert not has_table_privilege('anon', format('public.%I', t), p), format('anon ha %s su %s', p, t);
    end loop;
  end loop;
end $$;

-- una tabella nuova non riceve i permessi tolti (privilegi predefiniti)
create table public.zz_test_grants (id int);
do $$
begin
  assert not has_table_privilege('authenticated', 'public.zz_test_grants', 'TRUNCATE'), 'tabella nuova: TRUNCATE ad authenticated';
  assert not has_table_privilege('anon', 'public.zz_test_grants', 'SELECT'), 'tabella nuova: SELECT ad anon';
end $$;
drop table public.zz_test_grants;

-- le funzioni pubbliche del tablet e del preventivo restano utilizzabili dai visitatori
do $$
begin
  assert has_function_privilege('anon', 'public.kiosk_info(text)', 'EXECUTE'), 'anon non può più usare kiosk_info';
end $$;

\echo 'TEST PERMESSI SUPERATI'
