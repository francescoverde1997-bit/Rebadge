# Fase D — Andare online (piano)

Stato: **piano da approvare**. Nessun account creato, nessun costo sostenuto.
Regola: ogni passo con un costo, una pubblicazione o un account a nome del fondatore parte solo con il suo OK esplicito.
Gli account li crea il fondatore (a suo nome, con la sua carta); Claude guida, configura e verifica, senza mai vedere password o carte.

## Principio: prima tutto gratis in prova, poi si paga solo al lancio
1. **Ambiente di prova** (staging) con i piani gratuiti: Supabase Free, Vercel Hobby, Stripe in modalità test.
   Serve a verificare tutto sul sistema reale (email di conferma, RLS, pagamenti di prova) prima di avere clienti.
2. **Lancio**: si passa ai piani a pagamento solo quando si è pronti ad accettare clienti veri.

## Passi

| # | Passo | Chi | Costo | Risultato |
|---|---|---|---|---|
| D1 | **GitHub**: repository privato del progetto | tu crei l'account / il repository, io collego e carico (`git push`) | gratis | copia remota del codice; serve a Vercel per pubblicare a ogni modifica |
| D2 | **Supabase (prova)**: progetto nella regione **UE – Francoforte** | tu crei l'organizzazione e il progetto; io applico le 12 migrazioni, configuro accesso, link delle email e testi in italiano | gratis (Free) | database reale in Europa; si avvera "Dati in Europa" della homepage |
| D3 | **Verifiche sul database reale** | io | gratis | test di sicurezza (RLS) e flusso completo su Supabase vero: registrazione con email di conferma, tablet, report, chiusura del mese; **tipi TypeScript generati dal database** (rimasti dalla fase B) |
| D4 | **Vercel (prova)**: pubblicazione su un indirizzo provvisorio `…vercel.app`, funzioni nella regione **Francoforte** | tu crei l'account e colleghi GitHub; io imposto le variabili da `.env.example` | gratis (Hobby, uso non commerciale: va bene per le prove) | l'app raggiungibile da qualsiasi tablet e telefono |
| D5 | **Stripe (test)**: prodotto "ReBadge", prezzi Base e Plus, webhook verso l'indirizzo di prova | tu crei l'account Stripe (resta in modalità test); io configuro e provo con la carta 4242 | gratis | abbonamento, cambio piano, disdetta e sospensione verificati con lo Stripe vero |
| D6 | **Dominio** (es. `rebadge.it`, da verificare) + **marchio** | tu: verifica disponibilità e marchio (TMview/UIBM), acquisto; io: collegamento a Vercel | **circa 10–20 €/anno** | indirizzo definitivo e certificato HTTPS automatico |
| D7 | **Email** con il nostro dominio (es. `noreply@rebadge.it`) tramite **Resend** | tu crei l'account; io imposto i record DNS (SPF/DKIM) e collego Supabase | gratis fino a **3.000 email/mese, 100 al giorno** | email di conferma e recupero password affidabili (quelle integrate di Supabase hanno limiti molto bassi) |
| D8 | **Controllo errori e disponibilità** | io (con un tuo account) | gratis nei piani base | avviso se l'app va in errore o non risponde |
| D9 | **Documenti legali** | tu con un legale/consulente (io preparo le bozze tecniche: quali dati, dove, per quanto) | a carico tuo | privacy policy, termini, informativa per i dipendenti, DPA con i clienti, tempi di conservazione, art. 4 Statuto dei Lavoratori |
| D10 | **Lancio** | tu approvi; io eseguo la checklist | vedi sotto | Supabase **Pro**, Vercel **Pro**, Stripe in modalità reale (attivazione dell'account Stripe con i tuoi dati e IBAN: la fai tu), fattura elettronica SdI decisa |

## Costi

**Fino al lancio (D1–D9): solo il dominio, circa 10–20 €/anno.**

**Dal lancio, ogni mese** (prezzi verificati il 25/10/2026, da ricontrollare al momento dell'acquisto):

| Servizio | Piano | Costo | Perché serve il piano a pagamento |
|---|---|---|---|
| Supabase | Pro | **25 $/mese** (include 10 $ di calcolo, backup giornalieri per 7 giorni, tetto di spesa attivo) | il piano Free mette in pausa i progetti inattivi e non ha backup: inaccettabile con le presenze dei clienti |
| Vercel | Pro | **20 $/mese** per 1 utente | il piano Hobby vieta l'uso commerciale |
| Resend | Free | 0 € (fino a 3.000 email/mese) | si passa a Pro (20 $/mese) solo se servono più email |
| Stripe | — | nessun canone, commissione su ogni pagamento | — |
| Dominio | — | ~1–2 €/mese | — |

**Totale fisso ≈ 45–50 € al mese.** Con i prezzi attuali bastano 5 clienti sul piano Base per coprirlo.

## Cosa resta fuori (dopo il lancio)
Richieste di ferie dai dipendenti, accesso personale dei dipendenti, QR code dinamico, modalità offline del tablet,
pagamento annuale, versione 9:16 del video per le ads.

## Ordine consigliato e prima decisione
D1 → D2 → D3 → D4 → D5 si fanno **tutti gratis** e in pochi giorni: alla fine avremo ReBadge funzionante online all'indirizzo di prova,
da provare su un vero tablet. D6–D9 in parallelo (dominio, email, documenti legali). D10 solo quando tutto è verificato e i documenti legali sono pronti.

**Prima decisione per partire:** creare l'account GitHub (o dirmi se ne hai già uno) e il progetto Supabase gratuito.

Fonti prezzi: [supabase.com/pricing](https://supabase.com/pricing) · guide Vercel 2026 ([makerkit](https://makerkit.dev/blog/saas/vercel-cost)) · [resend.com/pricing](https://www.resend.com/pricing.md).
