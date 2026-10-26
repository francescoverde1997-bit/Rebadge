-- Test di sicurezza e logica DB. Ogni blocco solleva un'eccezione se un'aspettativa fallisce.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;

-- --- Setup: due titolari che si registrano --------------------------------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'mario@bar.it',   '{"company_name":"Bar Mario"}'),
  ('22222222-2222-2222-2222-222222222222', 'lucia@forno.it', '{"company_name":"Forno Lucia"}'),
  ('33333333-3333-3333-3333-333333333333', 'anon@x.it',      '{}');

do $$
declare n int; nm text;
begin
  -- solo le aziende dei 3 utenti del test: sul database reale possono esisterne altre
  select count(*) into n from company_members where user_id in
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
  assert n = 3, 'Ogni registrazione crea un''azienda';
  select name into nm from companies c join company_members m on m.company_id = c.id
   where m.user_id = '11111111-1111-1111-1111-111111111111';
  assert nm = 'Bar Mario', 'Il nome di registrazione diventa il nome azienda';
  select name into nm from companies c join company_members m on m.company_id = c.id
   where m.user_id = '33333333-3333-3333-3333-333333333333';
  assert nm = 'anon', 'Senza nome si usa la parte locale dell''email';
  select count(*) into n from company_settings where rounding_minutes = 0 and daily_overtime_after_minutes = 480
    and company_id in (select company_id from company_members where user_id in
      ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'));
  assert n = 3, 'Impostazioni predefinite create';
end $$;

create temp table ids as
  select (select company_id from company_members where user_id = '11111111-1111-1111-1111-111111111111') as a,
         (select company_id from company_members where user_id = '22222222-2222-2222-2222-222222222222') as b;
grant select on ids to anon, authenticated;

-- --- Titolare A gestisce i suoi dati ---------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into employees (company_id, first_name, last_name) select a, 'Anna', 'Rossi' from ids;
insert into employees (company_id, first_name, last_name) select a, 'Bruno', 'Bianchi' from ids;
update companies set name = 'Bar Mario & Figli' where id = (select a from ids);
select set_employee_pin((select id from employees where first_name = 'Anna'), '1234');

do $$
declare n int;
begin
  select count(*) into n from companies; assert n = 1, 'A vede solo la propria azienda';
  select count(*) into n from employees; assert n = 2, 'A vede i propri dipendenti';
  begin
    update companies set plan_status = 'active';
    raise exception 'FAIL: il client ha potuto cambiare il piano';
  exception when insufficient_privilege then null; end;
  begin
    perform pin_hash from employee_secrets;
    raise exception 'FAIL: PIN leggibile dal client';
  exception when insufficient_privilege then null; end;
  begin
    perform set_employee_pin((select id from employees limit 1), '12');
    raise exception 'FAIL: PIN troppo corto accettato';
  exception when invalid_parameter_value then null; end;
end $$;

-- --- Titolare B non vede né tocca nulla di A ------------------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$
declare n int;
begin
  select count(*) into n from employees; assert n = 0, 'B non vede i dipendenti di A';
  select count(*) into n from companies where id = (select a from ids); assert n = 0, 'B non vede l''azienda A';
  update employees set first_name = 'Hack';
  update companies set name = 'Hack' where id = (select a from ids);
  begin
    insert into employees (company_id, first_name, last_name) select a, 'X', 'Y' from ids;
    raise exception 'FAIL: B ha inserito un dipendente in A';
  exception when insufficient_privilege then null; end;
  begin
    perform create_device((select a from ids), 'Tablet pirata');
    raise exception 'FAIL: B ha creato un tablet per A';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) select 'logos', a || '/logo.png' from ids;
    raise exception 'FAIL: B ha caricato il logo di A';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select name from companies where id = (select a from ids)) = 'Bar Mario & Figli', 'B non ha modificato A';
  assert not exists (select 1 from employees where first_name = 'Hack'), 'B non ha modificato i dipendenti di A';
end $$;

-- --- Logo: A può caricare il proprio ---------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name) select 'logos', a || '/logo.png' from ids;

-- --- Tablet -----------------------------------------------------------------
create temp table tok (t text);
grant all on tok to anon, authenticated;
insert into tok select create_device((select a from ids), 'Ingresso');

select pg_temp.as_user(null);  -- il tablet è anonimo
do $$
declare r jsonb; t text := (select t from tok); anna uuid; bruno uuid;
begin
  begin
    perform count(*) from employees;
    raise exception 'FAIL: anon legge le tabelle';
  exception when insufficient_privilege then null; end;

  begin
    perform kiosk_info('token-falso');
    raise exception 'FAIL: token falso accettato';
  exception when insufficient_privilege then null; end;

  r := kiosk_info(t);
  assert r->'company'->>'name' = 'Bar Mario & Figli', 'Il tablet mostra il nome azienda';
  assert jsonb_array_length(r->'employees') = 2, 'Il tablet elenca i dipendenti attivi';
  assert (r->'employees'->0) ? 'last_name' and not ((r->'employees'->0) ? 'email'), 'Il tablet non riceve dati superflui';
  select (e->>'id')::uuid into anna  from jsonb_array_elements(r->'employees') e where e->>'first_name' = 'Anna';
  select (e->>'id')::uuid into bruno from jsonb_array_elements(r->'employees') e where e->>'first_name' = 'Bruno';

  r := kiosk_punch(t, bruno, '0000');
  assert r->>'error' = 'no_pin', 'Dipendente senza PIN non timbra';

  r := kiosk_punch(t, anna, '9999');
  assert r->>'error' = 'wrong_pin', 'PIN errato rifiutato';

  r := kiosk_punch(t, anna, '1234');
  assert (r->>'ok')::boolean and r->>'kind' = 'in', 'Prima timbratura = entrata';

  r := kiosk_punch(t, anna, '1234');
  assert (r->>'duplicate')::boolean, 'Doppio tocco ignorato';
end $$;

-- Simula il passare del tempo: sposta indietro l'entrata di 4 ore
reset role;
alter table punches disable trigger punches_guard;
update punches set punched_at = now() - interval '4 hours';
alter table punches enable trigger punches_guard;

select pg_temp.as_user(null);
do $$
declare r jsonb; t text := (select t from tok); anna uuid;
begin
  select (e->>'id')::uuid into anna from jsonb_array_elements(kiosk_info(t)->'employees') e where e->>'first_name' = 'Anna';
  r := kiosk_punch(t, anna, '1234');
  assert r->>'kind' = 'out', 'Seconda timbratura = uscita';

  -- 5 PIN errati bloccano
  for i in 1..4 loop perform kiosk_punch(t, anna, '0000'); end loop;
  r := kiosk_punch(t, anna, '0000');
  assert r->>'error' = 'locked', 'Blocco dopo 5 tentativi';
  r := kiosk_punch(t, anna, '1234');
  assert r->>'error' = 'locked', 'Anche il PIN corretto è bloccato durante il blocco';
end $$;

-- --- Immutabilità timbrature -------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$
declare n int;
begin
  begin
    update punches set punched_at = now() where kind = 'in';
    raise exception 'FAIL: timbratura modificata';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into punches (company_id, employee_id, kind, punched_at, source, created_by)
    select a, (select id from employees where first_name = 'Anna'), 'in', now(), 'manual', auth.uid() from ids;
    raise exception 'FAIL: correzione senza motivazione accettata';
  exception when check_violation then null; end;
  insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
  select a, (select id from employees where first_name = 'Anna'), 'in', now() - interval '1 day', 'manual', auth.uid(), 'Dimenticata entrata' from ids;
  update punches set voided_at = now(), void_reason = 'Errore' where kind = 'out';
  select count(*) into n from punches where voided_at is not null and voided_by = auth.uid();
  assert n = 1, 'Annullamento registrato con autore';
  select count(*) into n from audit_log where entity = 'punches';
  assert n >= 4, 'Registro modifiche popolato';
end $$;

-- --- B non vede timbrature, registro e dispositivi di A ----------------------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  assert (select count(*) from punches) = 0, 'B non vede timbrature di A';
  assert (select count(*) from audit_log) = 0, 'B non vede il registro di A';
  assert (select count(*) from devices) = 0, 'B non vede i tablet di A';
  assert (select count(*) from storage.objects) = 0, 'B non vede il logo di A';
end $$;

-- --- Tablet revocato ---------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update devices set revoked_at = now();
select pg_temp.as_user(null);
do $$ begin
  begin
    perform kiosk_info((select t from tok));
    raise exception 'FAIL: tablet revocato ancora attivo';
  exception when insufficient_privilege then null; end;
end $$;

-- --- Impostazioni ore -------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update company_settings set rounding_minutes = 15, daily_overtime_after_minutes = 450 where company_id = (select a from ids);
do $$ begin
  begin
    update company_settings set rounding_minutes = 7 where company_id = (select a from ids);
    raise exception 'FAIL: arrotondamento non valido accettato';
  exception when check_violation then null; end;
end $$;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
update company_settings set rounding_minutes = 30 where company_id = (select a from ids);
reset role;
do $$ begin
  assert (select rounding_minutes from company_settings where company_id = (select a from ids)) = 15, 'B non modifica le regole di A';
  assert (select daily_overtime_after_minutes from company_settings where company_id = (select a from ids)) = 450, 'Il titolare salva le regole';
end $$;

-- --- Il dipendente NON può modificare le ore: solo il titolare -------------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'anna@barmario.it', '{"signup_kind":"employee"}');
-- collegamento account ↔ dipendente (in produzione lo farà l'invito del titolare)
update employees set user_id = '44444444-4444-4444-4444-444444444444' where first_name = 'Anna';
insert into company_members (company_id, user_id, role)
  select a, '44444444-4444-4444-4444-444444444444', 'employee' from ids;

select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
do $$
declare n_before int; n_after int; anna uuid;
begin
  select count(*) into n_before from punches where voided_at is null;
  assert n_before > 0, 'Il dipendente vede le proprie timbrature';
  select id into anna from employees;  -- vede solo sé stesso
  assert (select count(*) from employees) = 1, 'Il dipendente vede solo il proprio profilo';

  -- aggiungere una timbratura manuale
  begin
    insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
    select a, anna, 'out', now(), 'manual', auth.uid(), 'Me la segno da solo' from ids;
    raise exception 'FAIL: il dipendente ha aggiunto una timbratura';
  exception when insufficient_privilege then null; end;

  -- spostare o annullare una timbratura (nessuna riga modificabile)
  update punches set voided_at = now(), void_reason = 'non mi piace';
  begin
    update punches set punched_at = punched_at - interval '1 hour';
  exception when raise_exception then null; end;

  -- cambiare le regole di calcolo
  update company_settings set daily_overtime_after_minutes = 60;

  -- cambiare il proprio PIN o crearsi un tablet
  begin
    perform set_employee_pin(anna, '0000');
    raise exception 'FAIL: il dipendente ha cambiato il PIN';
  exception when insufficient_privilege then null; end;
  begin
    perform create_device((select a from ids), 'Tablet di Anna');
    raise exception 'FAIL: il dipendente ha creato un tablet';
  exception when insufficient_privilege then null; end;

  -- approvarsi le ferie da solo
  begin
    insert into leave_requests (company_id, employee_id, type, start_date, end_date, status)
    select a, anna, 'ferie', current_date, current_date, 'approved' from ids;
    raise exception 'FAIL: il dipendente si è approvato le ferie';
  exception when insufficient_privilege then null; end;

  select count(*) into n_after from punches where voided_at is null;
  assert n_after = n_before, 'Nessuna timbratura annullata dal dipendente';
end $$;

reset role;
do $$ begin
  assert (select daily_overtime_after_minutes from company_settings where company_id = (select a from ids)) = 450,
    'Il dipendente non ha cambiato le regole';
  assert not exists (select 1 from punches where note = 'Me la segno da solo'), 'Nessuna timbratura del dipendente';
  assert not exists (select 1 from punches where void_reason = 'non mi piace'), 'Nessun annullamento del dipendente';
end $$;

-- Controprova: il titolare invece può correggere le ore
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into punches (company_id, employee_id, kind, punched_at, source, created_by, note)
  select a, (select id from employees where first_name = 'Anna'), 'out', now(), 'manual', auth.uid(), 'Uscita dimenticata' from ids;
reset role;
do $$ begin
  assert exists (select 1 from punches where note = 'Uscita dimenticata'), 'Il titolare corregge le ore';
end $$;

reset role;
\echo 'TUTTI I TEST DB SUPERATI'
