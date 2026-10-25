# ReBadge — guida al progetto

**ReBadge · Timbra. Controlla. Invia.** (nome di lavoro precedente: "Presenze"; la sezione "Presenze" dell'app resta con questo nome)

Micro-SaaS B2B per piccole aziende italiane: timbrature da tablet fisso, presenze, ferie/permessi,
report mensile per il consulente del lavoro, abbonamento mensile. **Priorità: semplicità.**

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 4
- Supabase: Postgres, Auth, Storage, RLS
- Test: Vitest (logica) + script SQL su Postgres locale (sicurezza DB)

## Comandi
| Comando | Cosa fa |
|---|---|
| `npm run dev` | avvia l'app in locale (serve Supabase in `.env.local`) |
| `npm run demo` | avvia l'app con un finto Supabase e dati di esempio, senza configurare nulla |
| `npm test` | test del motore ore |
| `npm run test:db` | Postgres 17 temporaneo (incluso: embedded-postgres) + migrazioni + test RLS/tablet, anche su Mac |
| `npm run e2e` | build + finto Supabase in memoria + test Playwright dell'interfaccia (screenshot in `e2e-shots/`) |
| `npm run typecheck` / `npm run lint` / `npm run build` | controlli |

## Struttura
```
supabase/migrations/   schema SQL (unica fonte di verità del DB)
supabase/tests/        00_supabase_stub.sql emula Supabase, 1x_*.sql test con ASSERT
src/lib/hours/         motore di calcolo ore e festività (funzioni pure, testate)
src/lib/supabase/      client browser e server
scripts/test-db.mjs    runner dei test DB (Postgres incluso o PGBIN; \set/\echo di psql emulati)
scripts/e2e/           finto Supabase (solo per e2e, NON emula la RLS) + scenari Playwright
scripts/pdf-text.mjs   testo dei PDF per i test (pdftotext se c'è, altrimenti pdfjs)
scripts/supabase-remote.mjs  Supabase reale: migrate / auth / sql (token in ~/.rebadge/supabase_token, mai nel progetto)
scripts/test-db-remote.mjs   test di sicurezza sul Supabase reale, in transazioni annullate
src/app/(auth)/        registrati, accedi, password-dimenticata, reimposta-password + server actions
src/app/auth/          rotte dei link email (confirm con token_hash, callback con code)
src/app/app/           area riservata; nav.tsx: menu in alto (computer) e barra in basso (smartphone)
src/lib/company.ts     azienda dell'utente corrente (getCurrentCompany / requireOwner)
src/lib/attendance.ts  caricamento timbrature a pagine, impostazioni, dipendenti (server)
src/lib/report.ts      dati del report mensile (funzioni pure); report-pdf.ts e report-xlsx.ts generano i file
src/lib/report-data.ts caricamento report, mesi chiusi con regole congelate, logo per il PDF (server)
src/lib/plans.ts       UNICA fonte di piani, prezzi (anche al giorno), limiti, testi (funzioni pure)
src/app/page.tsx       homepage pubblica; schermate in public/home generate da scripts/home-shots.mjs (`npm run shots:home` con la demo avviata)
src/components/logo.tsx marchio ReBadge (BadgeMark, Logo, slogan); icone e file in public/brand con `npm run brand:icons`
src/components/site.tsx intestazione e piè di pagina delle pagine pubbliche
src/components/video-dialog.tsx "Guarda come funziona": video di presentazione in public/video/ (sorgenti in ~/Desktop/ADV/ReBadge Presentazione Ad)
src/components/pricing.tsx  tabella prezzi condivisa (/prezzi e /app/abbonamento); custom-plan-form.tsx richiesta preventivo
src/lib/stripe.ts, billing.ts  client Stripe e sincronizzazione abbonamento (server); webhook in src/app/api/stripe/webhook
src/lib/leave.ts       assenze: giorni lavorativi, totali del mese, sovrapposizioni (funzioni pure)
src/lib/hours/month.ts mese di competenza, finestra di caricamento, chi è presente (funzioni pure)
src/lib/validation.ts  schemi zod condivisi e traduzione errori Auth
```

## Regole architetturali
1. **Isolamento aziende**: ogni tabella di dominio ha `company_id` e RLS basata su
   `is_company_member()` / `is_company_owner()`. Nessuna tabella senza RLS.
2. **Tablet anonimo**: non ha sessione Supabase. Usa un token lungo (solo hash in DB) e
   le RPC `kiosk_info` / `kiosk_punch` (security definer). Orario sempre `now()` lato server.
3. **Timbrature immutabili**: si annullano (`voided_at`), non si modificano. Le correzioni sono
   timbrature `manual` con motivazione obbligatoria. Tutto finisce in `audit_log`.
4. **PIN**: bcrypt in `employee_secrets`, tabella senza policy né grant. Blocco 5 min dopo 5 errori.
5. **Calcolo ore** solo in `src/lib/hours/calculate.ts`: non duplicare logica in SQL o nella UI.
6. Il client non può cambiare `plan_status`/`trial_ends_at` (grant a colonne).
7. Ogni modifica al DB = nuova migrazione + test in `supabase/tests`. Ogni modifica al calcolo = test.

8. **Solo il titolare modifica le ore**: il dipendente timbra (sempre all'ora del server) e legge le proprie ore, nient'altro. Coperto dai test DB.
9. I form che salvano impostazioni usano `submitWithoutReset` (no reset automatico di React 19).
11. **Mese chiuso**: timbrature e assenze bloccate dal DB; i calcoli di un mese chiuso usano `settingsForMonth()` (regole congelate). Mai `fetchSettings()` per un mese passato.
12. **Abbonamento**: stato scritto solo dal webhook (service_role). Servizio sospeso → solo /app/abbonamento e /app/report. Limite dipendenti nel DB.
13. **Movimento**: solo con le classi e i token di `globals.css` (`anim-in`, `anim-pop`, `card-hover`, `row-hover`, `Reveal` per aprire/chiudere pannelli, `Spinner`). Durate 150–250 ms, niente animazioni continue, niente `loading.tsx`. Tutto deve restare utilizzabile con "riduci movimento".
10. Quando aggiungi chiamate Supabase nuove, estendi anche `scripts/e2e/fake-supabase.mjs`.

## Convenzioni
- UI e messaggi in italiano. Codice e nomi tecnici in inglese.
- Orari in `timestamptz`, giorno di competenza calcolato nel fuso dell'azienda (`Europe/Rome`).
- Prima di dichiarare finito: `npm test && npm run test:db && npm run typecheck && npm run e2e`.

Vedi `TASKS.md` per lo stato e `DECISIONS.md` per le scelte prese.
