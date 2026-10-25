# Collegare il progetto a Supabase

Tempo stimato: 10 minuti. Il piano gratuito di Supabase basta per sviluppo e test.

## 1. Crea il progetto
1. Vai su supabase.com → **New project**.
2. **Region: Central EU (Frankfurt)** — i dati dei dipendenti restano in UE (GDPR).
3. Salva la password del database in un posto sicuro (non serve all'app).

## 2. Crea il database
In **SQL Editor** esegui, in quest'ordine, il contenuto dei file:
1. `supabase/migrations/20261021000001_init.sql`
2. `supabase/migrations/20261021000002_storage_logos.sql`
3. `supabase/migrations/20261021000003_employees.sql`
4. `supabase/migrations/20261021000004_kiosk.sql`
5. `supabase/migrations/20261022000005_corrections.sql`
6. `supabase/migrations/20261022000006_night_holiday.sql`
7. `supabase/migrations/20261022000007_patron.sql`
8. `supabase/migrations/20261022000008_leave.sql`
9. `supabase/migrations/20261022000009_month_closure.sql`
10. `supabase/migrations/20261022000010_billing.sql`
11. `supabase/migrations/20261022000011_plans_custom.sql`
12. `supabase/migrations/20261022000012_sick_protocol.sql`
13. `supabase/migrations/20261025000013_harden_grants.sql`

In alternativa, con la Supabase CLI: `supabase link --project-ref <ref>` e poi `supabase db push`.

**Metodo usato per ReBadge** (senza password del database, con un token di accesso salvato in `~/.rebadge/supabase_token`):
- `node scripts/supabase-remote.mjs migrate <ref>`: applica solo le migrazioni mancanti e le registra;
- `node scripts/supabase-remote.mjs auth <ref> <indirizzo del sito>`: indirizzo, link consentiti, password ≥ 8, conferma obbligatoria, testi email;
- `node scripts/test-db-remote.mjs <ref>`: i test di sicurezza sul database reale, ognuno in una transazione annullata (non lascia dati).

Nota: sul piano Free i testi delle email si possono cambiare solo dopo aver collegato un SMTP nostro (Resend). Fino ad allora Supabase
manda le sue email in inglese, che funzionano (link via `/auth/callback`) ma vanno aperte nello stesso browser della registrazione.

> Non eseguire mai i file in `supabase/tests/`: servono solo per i test locali.

## 3. Configura l'accesso (Authentication)
- **URL Configuration → Site URL**: l'indirizzo dell'app (in locale `http://localhost:3000`).
- **Redirect URLs**: aggiungi `http://localhost:3000/**` e, quando ci sarà, `https://<dominio>/**`.
- **Providers → Email**: lascia attiva la conferma email (consigliato).
- **Email Templates**: sostituisci "Confirm signup" e "Reset password" con i testi di `docs/email-templates.md` (obbligatorio: i link puntano a `/auth/confirm`).
- Per l'invio email in produzione configura un SMTP (es. Resend, Brevo): il servizio email integrato di Supabase ha limiti molto bassi.

## 4. Variabili d'ambiente
Copia `.env.example` in `.env.local` e compila con **Project Settings → API**:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```
La chiave `service_role` serve solo al server per i pagamenti (vedi `STRIPE_SETUP.md`): non va mai messa nel frontend.

## 5. Il tablet
Sul tablet apri l'app, accedi come titolare, vai su **Tablet** → **Attiva questo tablet**.
Consigliato: dal menu del browser scegli "Aggiungi a schermata Home", così la timbratrice si apre a tutto schermo.
Su iPad attiva anche **Accesso guidato** (Impostazioni → Accessibilità) per impedire di uscire dall'app.

## 6. Assistenza
La riapertura di un mese chiuso è descritta in `ASSISTENZA.md`.

## 7. Avvia e verifica
```
npm install
npm run dev
```
Apri http://localhost:3000/registrati, crea un account, conferma l'email e verifica che la dashboard mostri il nome inserito.
