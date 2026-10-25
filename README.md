# ReBadge · Timbra. Controlla. Invia.

Presenze per piccole aziende italiane: i dipendenti timbrano con nome e PIN da un tablet in sede,
il titolare vede ore, straordinari, ferie e permessi, e a fine mese scarica il report PDF/Excel per il consulente del lavoro.
Abbonamento mensile in base al numero di dipendenti.

## Provarlo subito (nessuna configurazione)
Serve Node.js 22 o successivo.
```
npm install
npm run demo
```
Poi apri http://localhost:3000 e accedi con `demo@presenze.it` / `demo1234` (dati finti in memoria). Dettagli in [PROVA_IN_LOCALE.md](PROVA_IN_LOCALE.md).

## Sviluppo
| Comando | Cosa fa |
|---|---|
| `npm run dev` | app in locale con Supabase vero (copia `.env.example` in `.env.local`) |
| `npm run demo` | app con un finto Supabase e dati di esempio |
| `npm test` | test unitari (calcolo ore, report, piani…) |
| `npm run test:db` | test di sicurezza del database su un Postgres 17 temporaneo, incluso nel progetto |
| `npm run e2e` | build + test dell'interfaccia nel browser (la prima volta: `npx playwright install chromium`) |
| `npm run typecheck` · `npm run lint` · `npm run build` | controlli |

Prima di considerare finita una modifica: `npm test && npm run test:db && npm run typecheck && npm run e2e`.

## Documenti
- [CLAUDE.md](CLAUDE.md): struttura del codice e regole architetturali
- [TASKS.md](TASKS.md): stato del lavoro · [DECISIONS.md](DECISIONS.md): decisioni prese e perché
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) · [STRIPE_SETUP.md](STRIPE_SETUP.md): collegamento ai servizi reali
- [ASSISTENZA.md](ASSISTENZA.md): operazioni riservate al team (es. riapertura di un mese chiuso)

Stack: Next.js 15 · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Storage, RLS) · Stripe.
