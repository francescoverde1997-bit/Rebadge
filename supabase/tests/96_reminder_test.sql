-- Test promemoria serale (migrazione 14): valori iniziali, limiti dell'orario, registro riservato al server.
\set ON_ERROR_STOP on

do $$
declare cid uuid; uid uuid := gen_random_uuid(); other uuid := gen_random_uuid(); s record; ok boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (uid, 'promemoria@test.it', '{"company_name":"Promemoria Srl"}');
  insert into auth.users (id, email, raw_user_meta_data) values (other, 'altro@test.it', '{"company_name":"Altra Srl"}');
  select company_id into cid from company_members where user_id = uid;

  -- valori iniziali: attivo alle 20:00
  select reminder_enabled, reminder_minutes into s from company_settings where company_id = cid;
  assert s.reminder_enabled and s.reminder_minutes = 1200, 'valori iniziali errati';

  -- il titolare cambia orario e disattiva
  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;
  update company_settings set reminder_minutes = 1410, reminder_enabled = false where company_id = cid;
  reset role;
  select reminder_enabled, reminder_minutes into s from company_settings where company_id = cid;
  assert not s.reminder_enabled and s.reminder_minutes = 1410, 'il titolare non riesce a salvare il promemoria';

  -- orari fuori dai limiti o non a mezz'ore rifiutati
  ok := false; begin update company_settings set reminder_minutes = 1050 where company_id = cid; exception when check_violation then ok := true; end;
  assert ok, 'orario prima delle 18:00 accettato';
  ok := false; begin update company_settings set reminder_minutes = 1215 where company_id = cid; exception when check_violation then ok := true; end;
  assert ok, 'orario non a mezz''ore accettato';

  -- un'altra azienda non può cambiare il promemoria di questa
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  update company_settings set reminder_minutes = 1080 where company_id = cid;
  reset role;
  select reminder_minutes into s from company_settings where company_id = cid;
  assert s.reminder_minutes = 1410, 'un''altra azienda ha cambiato il promemoria';

  -- registro invii: un solo promemoria al giorno, nessun accesso dal browser
  insert into reminder_log (company_id, local_date) values (cid, date '2026-10-27');
  ok := false; begin insert into reminder_log (company_id, local_date) values (cid, date '2026-10-27'); exception when unique_violation then ok := true; end;
  assert ok, 'due promemoria nello stesso giorno';
  assert not has_table_privilege('authenticated', 'public.reminder_log', 'SELECT'), 'il browser legge il registro';
  assert not has_table_privilege('anon', 'public.reminder_log', 'INSERT'), 'gli anonimi scrivono il registro';
end $$;

\echo 'TEST PROMEMORIA SUPERATI'
