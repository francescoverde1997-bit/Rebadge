# Collegare Stripe (abbonamenti)

Tempo stimato: 20 minuti. Lavora prima in **modalità test** (interruttore "Test mode" in alto nella dashboard Stripe):
nessun addebito reale, carta di prova `4242 4242 4242 4242`.

## 1. Prodotto e prezzi
Dashboard Stripe → **Catalogo prodotti** → **Aggiungi prodotto** "ReBadge" (il nome compare nel pagamento e nelle fatture ai clienti), con due prezzi **ricorrenti mensili in EUR**:

| Piano | Prezzo | Variabile d'ambiente |
|---|---|---|
| Base (fino a 5 dipendenti) | 9,99 € | `STRIPE_PRICE_BASE` |
| Plus (da 6 a 30) | 29,99 € | `STRIPE_PRICE_PLUS` |

**Piano Personalizzato** (oltre 30 dipendenti): le richieste arrivano nella tabella `custom_plan_requests`
(Supabase → Table editor). Dopo l'accordo crea nello stesso prodotto un prezzo dedicato al cliente e
l'abbonamento dalla dashboard Stripe: l'app riconosce da sola ogni prezzo non standard come Personalizzato.
Il limite dipendenti si imposta in SQL: `update companies set custom_employee_limit = 120 where id = '...';`

Per ogni prezzo copia l'ID (`price_...`). Imposta i prezzi **IVA esclusa** ("Tax behavior: exclusive") se usi Stripe Tax.
I prezzi si possono cambiare in Stripe senza toccare il codice: crea un nuovo prezzo e aggiorna la variabile.

## 2. Portale clienti
**Impostazioni → Billing → Customer portal**, attiva:
- aggiornamento del metodo di pagamento;
- storico fatture;
- annullamento dell'abbonamento **a fine periodo**;
- **disattiva** il cambio di piano dal portale (il cambio piano si fa dall'app, che controlla il numero di dipendenti).

## 3. Webhook
**Sviluppatori → Webhook → Aggiungi endpoint**: `https://<tuo-dominio>/api/stripe/webhook`, eventi:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copia il **segreto di firma** (`whsec_...`).

## 4. Variabili d'ambiente (server)
```
STRIPE_SECRET_KEY=sk_test_...          # poi sk_live_... in produzione
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASE=price_...
STRIPE_PRICE_PLUS=price_...
SUPABASE_SERVICE_ROLE_KEY=...          # Supabase → Project Settings → API. SOLO sul server.
NEXT_PUBLIC_SITE_URL=https://<tuo-dominio>
```
`SUPABASE_SERVICE_ROLE_KEY` serve solo al webhook per aggiornare lo stato dell'abbonamento: non va mai
in variabili `NEXT_PUBLIC_` né nel codice del browser.

## 5. Prova
1. Registra un'azienda, vai su **Abbonamento** → **Attiva l'abbonamento**, paga con `4242 4242 4242 4242`.
2. Torni all'app con "Piano Base attivo".
3. Dal portale prova la disdetta: compare "Abbonamento disdetto: resta attivo fino al ...".

Per provare i webhook in locale: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (Stripe CLI).

## Da sapere
- **Fattura elettronica**: Stripe non invia le fatture allo SdI. Per la fatturazione elettronica italiana serve
  un servizio dedicato o il commercialista: da definire prima di incassare.
- **Partita IVA**: il Checkout chiede indirizzo e partita IVA del cliente (riportati sulle ricevute Stripe).
- **Fine prova senza pagamento**: tablet e modifiche si fermano, i report restano scaricabili.
- **Pagamento non riuscito**: il servizio resta attivo mentre Stripe ritenta l'addebito; se l'abbonamento
  viene annullato, il servizio si sospende. I dati non vengono mai cancellati.
