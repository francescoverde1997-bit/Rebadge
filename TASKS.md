# TASKS

Legenda: [x] fatto e testato · [ ] da fare · (!) richiede decisione del fondatore

## Fase 0 — Fondamenta ✅
- [x] Progetto Next.js 15 + TypeScript + Tailwind, client Supabase browser/server
- [x] Migrazione schema: aziende, membri, impostazioni, dipendenti, segreti PIN, tablet, timbrature, ferie/permessi, registro modifiche
- [x] RLS multi-azienda + grant a colonne (piano non modificabile dal client, PIN illeggibile)
- [x] Trigger registrazione → azienda con nome dal signup + impostazioni predefinite
- [x] Storage logo (bucket privato, solo titolare scrive)
- [x] RPC tablet: `create_device`, `kiosk_info`, `kiosk_punch` (PIN bcrypt, blocco, doppio tocco)
- [x] Timbrature immutabili + annullamento tracciato + correzioni con motivazione
- [x] Motore calcolo ore (arrotondamento, pausa automatica, straordinari, mezzanotte, ora legale, anomalie)
- [x] Festività italiane e giorni lavorativi
- [x] Test: 25 unit test motore ore, test DB su isolamento aziende/tablet/immutabilità — tutti verdi
- [x] Build e lint verdi

## Fase 1 — Accesso e azienda ✅
- [x] Registrazione (Nome, Email, Password): il Nome diventa nome azienda e titolo della dashboard
- [x] Accesso, uscita, recupero password, nuova password
- [x] Link email con token_hash (`/auth/confirm`): funzionano anche da un altro dispositivo
- [x] Middleware: sessione rinnovata, /app protetta, utente collegato rimandato alla dashboard
- [x] Dashboard con logo e nome azienda, giorni di prova rimasti, lista "primi passi"
- [x] Impostazioni: cambio nome, caricamento/rimozione logo (solo titolare), regole ore
- [x] Messaggi di errore in italiano, valori conservati dopo un errore
- [x] Test: 8 unit test validazione, test DB regole ore, 13 controlli end-to-end (desktop + smartphone)
- [x] Guida collegamento Supabase (`SUPABASE_SETUP.md`) e testi email in italiano
- [x] Logo solo in formato immagine (PNG, JPG, WebP, SVG): deciso il 22/10
- [ ] Verifica end-to-end sul progetto Supabase reale (email di conferma comprese)

## Fase 2 — Dipendenti ✅
- [x] Elenco dipendenti (ordine per cognome), stato PIN visibile senza mai mostrare il PIN
- [x] Aggiunta con nome, cognome, email facoltativa e PIN in un'unica operazione (RPC `create_employee`)
- [x] Pulsante "Genera" PIN; PIN facili rifiutati (0000, 1234, …); campo che accetta solo cifre
- [x] Modifica nome/email, cambio PIN (il vecchio smette subito di funzionare)
- [x] Disattiva/riattiva: i disattivati spariscono dal tablet ma restano nello storico
- [x] Dashboard: passo "Aggiungi i dipendenti" completato in automatico
- [x] Test: 4 unit test PIN/dipendenti, test DB (atomicità, campi protetti, isolamento), 12 controlli e2e
- [ ] Eliminazione definitiva di un dipendente (diritto all'oblio GDPR): da definire con il legale insieme ai tempi di conservazione

## Fase 3 — Tablet ✅
- [x] Sezione Tablet: "Attiva questo tablet" con nome, elenco tablet attivi con ultimo utilizzo, disattivazione con conferma
- [x] All'attivazione la sessione del titolare sul tablet viene chiusa
- [x] Timbratrice `/timbra`: nome azienda, logo, orologio; tocca il nome → tastierino PIN → conferma a tutto schermo
- [x] Entrata/uscita automatiche, ora del server, doppio tocco riconosciuto, blocco dopo 5 PIN errati
- [x] "Non sono io", chiusura automatica del tastierino dopo 20 s, ritorno all'elenco dopo 4 s
- [x] Tastiera fisica supportata, schermo sempre acceso (Wake Lock), installabile a tutto schermo (manifest)
- [x] Senza rete: avviso chiaro, mai una finta conferma, nuovo tentativo automatico ogni 10 s
- [x] Tablet disattivato: smette subito di funzionare e si cancella il token salvato
- [x] Logo pubblico in sola lettura (visibile sul tablet), il tablet non espone chi è presente
- [x] Test: 5 unit test messaggi, test DB tablet, 16 controlli e2e (orizzontale e verticale)
- [ ] (!) Modalità offline con coda di sincronizzazione: proposta dopo l'MVP

## Fase 4 — Presenze ✅
- [x] Oggi: chi è al lavoro adesso (con ora di entrata) e chi no; avviso "timbrature da sistemare" del mese
- [x] Checklist iniziale visibile solo finché mancano dipendenti o tablet (logo e regole facoltativi)
- [x] Presenze: riepilogo del mese per dipendente (giorni, ordinarie, straordinari, totale, da sistemare) con totali
- [x] Navigazione tra i mesi (il futuro non è raggiungibile); disattivati mostrati solo se hanno lavorato
- [x] Dettaglio dipendente giorno per giorno: timbrature, ore, straordinari, festivi, turni notturni ("turno di sab 5")
- [x] Correzioni solo del titolare: aggiungi timbratura dimenticata (tipo proposto in automatico, ora, motivo obbligatorio)
- [x] Annullamento con motivo: la timbratura resta visibile barrata, non si cancella
- [x] DB: niente timbrature manuali nel futuro, annullamento sempre motivato, tutto nel registro modifiche
- [x] Caricamento a pagine oltre il limite di 1000 righe di Supabase
- [x] Demo con 7 settimane di timbrature realistiche
- [x] Test: 16 unit test (mese, stato, correzioni), test DB correzioni, 9 controlli e2e (totale e2e: 50)

## Ore notturne e festive ✅ (richiesta del 22/10)
- [x] Motore: "di cui notturne" (fascia configurabile, predefinita 22:00–06:00, anche a cavallo della mezzanotte e col cambio d'ora)
- [x] Motore: "di cui festive" (domeniche e festività nazionali, per data locale: sabato notte → festive solo dopo mezzanotte)
- [x] Il titolare può cambiare la fascia notturna e disattivare il conteggio di notturne e/o festive
- [x] Colonne nel riepilogo mensile, totali e dettaglio del giorno ("1:30 di notte", "5:57 festive")
- [x] Test: 15 unit test, test DB impostazioni, 1 controllo e2e (fascia 00–06 e disattivazione)
- [x] Santo Patrono inserito dal cliente (giorno, mese, nome facoltativo): conta come festivo e compare nel dettaglio

## Da valutare

## Fase 5 — Ferie e permessi ✅
- [x] Sezione Ferie: calendario del mese (dipendenti × giorni) con legenda a colori e lettere, festivi e weekend evidenziati
- [x] Aggiunta assenza dal titolare: ferie, permesso (a giornata o a ore, in mezz'ore), malattia, altra assenza, nota facoltativa
- [x] Eliminazione con conferma; assenze sovrapposte rifiutate (ammessi più permessi a ore nello stesso giorno)
- [x] Pianificazione fino a 12 mesi avanti; ferie a cavallo del mese contate per mese
- [x] Conteggi: ferie e permessi a giornata in giorni lavorativi (settimana 5 o 6 giorni, esclusi festivi e patrono); malattia in giorni di calendario
- [x] Impostazione "Settimana lavorativa" (5 o 6 giorni)
- [x] Oggi: accanto a chi non c'è compare "Ferie", "Malattia", "Permesso 2:30"
- [x] Presenze: assenza indicata sul giorno e totali del mese nel dettaglio del dipendente
- [x] Smartphone: il calendario parte da oggi e scorre dentro il riquadro
- [x] Test: 15 unit test (conteggi, sovrapposizioni, validazione), test DB assenze, 9 controlli e2e (totale e2e: 62)
- [ ] Richieste di ferie da parte dei dipendenti (serve l'accesso dipendente: dopo l'MVP)

## Fase 6 — Report ✅
- [x] Sezione Report: si apre sul mese appena finito; stato In corso / Da chiudere / Chiuso; elenco dei mesi chiusi
- [x] PDF A4 con logo: riepilogo aziendale + una pagina per dipendente (giorno per giorno, festivi, assenze, anomalie, firme)
- [x] Excel: foglio Riepilogo (ore decimali) + foglio Giornaliero con filtri
- [x] Anteprima PDF "Bozza" scaricabile sempre, non chiude nulla
- [x] PDF definitivo: conferma esplicita, chiude il mese, archiviato e riscaricabile identico
- [x] Condizioni: solo mesi finiti, nessuna timbratura da sistemare
- [x] Mese chiuso: DB rifiuta timbrature, annullamenti e assenze (anche a cavallo); regole di calcolo congelate
- [x] Presenze e Ferie: avviso "mese chiuso", pulsanti di modifica nascosti
- [x] Riapertura solo assistenza: `support_reopen_month` (procedura in ASSISTENZA.md)
- [x] Test: 11 unit test (dati, PDF letto con pdftotext, Excel riletto), test DB chiusura, 13 controlli e2e (totale e2e: 75)

## Fase 7 — Abbonamento ✅
- [x] Piani Base 9,99 € (5 dip.), Plus 24,99 € (15), Pro 44,99 € (30), IVA esclusa; oltre 30: contattaci
- [x] Prova gratuita 14 giorni con tutte le funzioni (fino a 30 dipendenti)
- [x] Attivazione con Stripe Checkout: piano scelto in automatico dai dipendenti attivi, partita IVA richiesta
- [x] Cambio piano dall'app con calcolo della differenza; ritorno al piano inferiore solo se i dipendenti ci stanno
- [x] Portale Stripe: metodo di pagamento, fatture, disdetta a fine periodo
- [x] Webhook firmato: unico punto che aggiorna lo stato; il client non può modificare piano e stato (DB)
- [x] Limite dipendenti attivi applicato dal database
- [x] Servizio sospeso (prova scaduta / abbonamento terminato): app bloccata tranne Abbonamento e Report, tablet sospeso
      senza perdere l'attivazione, ripartenza automatica al rinnovo
- [x] Pagamento non riuscito: avviso, servizio non bloccato mentre Stripe ritenta
- [x] Stripe simulato per test e demo; guida STRIPE_SETUP.md
- [x] Test: 6 unit test piani, test DB abbonamento, 13 controlli e2e (totale e2e: 88)
- [ ] (!) Fattura elettronica SdI: scegliere servizio o gestione con il commercialista
- [ ] Pagamento annuale con sconto (facoltativo)

## Fase 7b — Piani e pagina Prezzi ✅
- [x] Piani in un unico file (`src/lib/plans.ts`): Base 9,99 € (fino a 5), Plus 29,99 € (da 6 a 30), Personalizzato su preventivo
- [x] Prezzo al giorno calcolato (0,33 € / 0,99 €) e interruttore Al mese / Al giorno
- [x] Tabella prezzi condivisa tra area riservata e pagina pubblica `/prezzi` (con calcolatore per numero di dipendenti, FAQ)
- [x] Richiesta di preventivo Personalizzato: salvata nel DB, precompilata se collegati, anti-spam e campo trappola
- [x] Prezzo Stripe non standard = piano Personalizzato, limite dipendenti su misura
- [x] Test: 9 unit test piani, test DB 80_plans_custom, controlli e2e (totale e2e: 97)
- [ ] Notifica email al team per ogni nuova richiesta di preventivo (serve un servizio email: da decidere al lancio)

## Fase 7c — Homepage ✅
- [x] Homepage pubblica su `/` (prima rimandava all'accesso): apertura, come funziona in 3 passaggi, funzioni, privacy, prezzi dinamici, invito finale
- [x] Schermate vere dalla demo (`npm run shots:home`, con la demo avviata), nessuna immagine inventata
- [x] Intestazione e piè di pagina condivisi con /prezzi
- [x] Test: 7 controlli e2e (totale e2e: 104), desktop e smartphone
- [x] Video di presentazione approvato il 25/10 (57 s, 16:9, voce Marcello, musica originale, sottotitoli): file in `~/Desktop/ADV/ReBadge Presentazione Ad/out/`
- [ ] Inserire il video nella homepage (pulsante "Guarda come funziona", file sul nostro sito con poster e sottotitoli): dopo la fase A

## Fase 7d — Malattia ✅
- [x] Malattia con data di inizio e fine e protocollo certificato INPS facoltativo (migrazione 12)
- [x] Modifica delle assenze (oltre all'eliminazione), bloccata nei mesi chiusi
- [x] Rosso dedicato nel calendario assenze e nel dettaglio presenze
- [x] Report: malattia separata da ferie e permessi; PDF in rosso con protocollo; Excel con colonna protocolli
- [x] Test: 4 unit test, test DB 90_sick, 4 controlli e2e (totale e2e: 108)
- [ ] (dopo il lancio) Infortunio come tipo a sé; avviso se un dipendente in malattia timbra; periodo di comporto

## Fase 7e — Micro-animazioni ✅
- [x] Pulsanti: ombra leggera al passaggio, pressione al clic, anello di caricamento durante il salvataggio
- [x] Schede e riquadri: hover delicato (schede prezzi sollevate di 2 px)
- [x] Navigazione: dissolvenza tra le sezioni, indicatore della sezione animato, barra di caricamento discreta, scorrimento morbido
- [x] Moduli e pannelli: apertura e chiusura morbide (assenze, dipendenti, correzioni, conferme, domande frequenti)
- [x] Calendario e tabelle: righe evidenziate, assenza selezionata evidenziata nel calendario
- [x] Feedback: avvisi con spunta che si disegna, riga che si attenua durante l'eliminazione; tablet con pallini PIN, oscillazione al PIN errato e conferma animata
- [x] Rispetto di "riduci movimento"; test e2e su durate e accessibilità (totale e2e: 110)

## Fase 7f — Marchio ReBadge ✅
- [x] Logo definitivo (simbolo chiaro/scuro/icona), favicon, icona iPhone/iPad, icone dell'app tablet, logo PNG per le email
- [x] Nome e slogan su homepage, prezzi, accesso, titoli delle pagine, area riservata, tablet, PDF, Excel, testi email
- [ ] (prima del lancio) Verifica dominio e registrazione marchio ReBadge

## Fase 7g — Interfaccia di qualità superiore (Fase C, bozze approvate il 22/10) ✅
- [x] Larghezze uniformi: pagine di dati (Oggi, Presenze, dettaglio, Ferie) su tutta la larghezza; pagine con moduli (Report, Dipendenti, Tablet, Impostazioni) in colonna leggibile
- [x] Ambra più scuro (#7a4d07): testo "da sistemare" leggibile sul fondo chiaro (contrasto ≥ 4,5:1)
- [x] Smartphone: barra in basso (Oggi, Presenze, Ferie, Report, Altro); in Altro Dipendenti, Tablet, Impostazioni, Abbonamento ed Esci
- [x] Oggi: ore e straordinari del mese, timbrature da sistemare con collegamento diretto al giorno, stato del report del mese scorso,
      chi è al lavoro (entrata e da quanto) e chi no, prossime assenze (14 giorni), passi iniziali in una sola riga
- [x] Presenze su smartphone: totale del mese in evidenza e una scheda per dipendente (la tabella resta da computer)
- [x] Dettaglio dipendente: giorni per settimana con totale e straordinari, etichette su una riga (straordinario, notte, festive),
      giorno da sistemare evidenziato con "Aggiungi l'uscita", avviso che porta al giorno e apre la correzione, pulsante compatto ⋯
- [x] Timbratrice: filtro per iniziale del nome da 13 dipendenti in su, si azzera dopo ogni timbratura
- [x] Test: 6 unit test (settimane, periodo assenze, iniziali), fase e2e 11 con 8 controlli; e2e aggiornati alla nuova interfaccia
- [x] Test del PDF eseguibili anche senza pdftotext (lettore pdfjs in `scripts/pdf-text.mjs`)

## Fase 7h — Sicurezza e affidabilità (Fase B) ✅
- [x] jsPDF 3 → 4.2.1 (vulnerabilità critica); PostCSS di Next.js forzato a 8.5.31 e uuid di exceljs a 11.1.1: `npm audit --omit=dev` senza vulnerabilità
- [x] Webhook Stripe: rilegge l'abbonamento a ogni evento, un evento arrivato in ritardo non sovrascrive lo stato attuale
- [x] Nessun secondo abbonamento: prima del Checkout si controlla su Stripe se ce n'è già uno vivo
- [x] Tablet: "rete assente" e "errore del servizio" distinti (prima ogni errore diceva "non connesso a internet")
- [x] Intestazioni di sicurezza su tutte le pagine (niente incorporamento in altri siti, nosniff, HSTS, fotocamera/microfono/posizione disattivati)
- [x] Pagina 404 e pagine di errore in italiano, con codice per l'assistenza
- [x] Chiusura del mese non riuscita: il PDF già caricato viene rimosso dal server (nessun file orfano)
- [x] Test: 2 unit test (rete/servizio), fase e2e 12 con 4 controlli (intestazioni, 404, webhook fuori ordine, doppio abbonamento)

## Fase 7i — Fondamenta (Fase A) ✅ (tranne git)
- [x] Copia di sicurezza prima delle modifiche: `~/Desktop/rebadge-copia-2026-10-25-prima-fase-A.zip`
- [x] `npm run test:db` funziona su Mac e Linux senza installare nulla: Postgres 17 incluso (embedded-postgres) o PGBIN/Postgres di sistema; `\set` e `\echo` di psql emulati
- [x] `npm run e2e` portabile: ripiego su perl se manca `timeout`, si ferma con un messaggio se le porte 3100/54400/54500 sono occupate
- [x] Test del PDF senza pdftotext (fase 7g); vitest 3 → 5, tipi Node 20 → 22: `npm audit` senza vulnerabilità (anche negli strumenti di sviluppo)
- [x] `.env.example` (incluso nel repository), README vero, nome "ReBadge" nel prodotto Stripe e nella guida di assistenza
- [x] Intestazione pubblica su telefoni stretti (320–379 px): solo il simbolo, "Prova gratis" resta nello schermo; controllo e2e in fase 12
- [ ] git e primo commit: in attesa degli strumenti Apple

## Fase 8 — Lancio
- [ ] git: attivare il repository e fare il primo commit (servono gli strumenti per sviluppatori di Apple: `xcode-select --install`)
- [ ] Tipi TypeScript generati dal database (`supabase gen types`): da fare sul progetto Supabase reale, in fase D (qui manca Docker)
- [ ] Privacy policy e termini
- [ ] Collegamento al progetto Supabase reale + deploy su Vercel (richiede approvazione)
