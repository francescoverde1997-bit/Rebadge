-- =====================================================================
-- Permessi minimi sulle tabelle (scoperto applicando le migrazioni al Supabase reale)
-- =====================================================================
-- Supabase concede di base TUTTI i permessi sulle nuove tabelle di public ai ruoli del browser
-- (anon e authenticated). La RLS protegge le righe, ma alcuni permessi non passano dalla RLS
-- (TRUNCATE svuota una tabella intera) o non servono mai (TRIGGER, REFERENCES). Li togliamo.
-- I visitatori anonimi non usano direttamente nessuna tabella: il tablet e la richiesta di preventivo
-- passano da funzioni security definer (kiosk_*, request_custom_plan).

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;

-- anche per le tabelle che verranno create in futuro
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
