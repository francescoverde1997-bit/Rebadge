# Procedure per l'assistenza

Queste operazioni sono riservate al team di ReBadge. I clienti non possono eseguirle.

## Riaprire un mese chiuso

Quando un'azienda scarica il PDF definitivo, il mese si chiude: timbrature e assenze di quel mese
non si possono più modificare. Se il cliente deve correggere qualcosa, chiede all'assistenza di riaprirlo.

1. Fatti indicare dal cliente **email del titolare** e **mese** (es. ottobre 2026).
2. In Supabase apri **SQL Editor** ed esegui (sostituisci email e mese):

   ```sql
   -- 1. trova l'azienda
   select c.id, c.name
     from companies c
     join company_members m on m.company_id = c.id
     join auth.users u on u.id = m.user_id
    where u.email = 'titolare@esempio.it';

   -- 2. riapri il mese (usa l'id trovato sopra)
   select support_reopen_month('<id-azienda>', '2026-10');
   ```

   Il risultato `true` conferma la riapertura (`false` = il mese non era chiuso).
3. Avvisa il cliente: può correggere e poi scaricare di nuovo il PDF definitivo, che richiuderà il mese.

Cosa resta dopo la riapertura:
- il **PDF già inviato** rimane nell'archivio (bucket `reports`) per eventuali contestazioni;
- chiusura e riapertura restano nel **registro modifiche** (`audit_log`, entità `month_closures`).

## Verificare cosa è stato chiuso

```sql
select month, closed_at, pdf_path, totals
  from month_closures
 where company_id = '<id-azienda>'
 order by month desc;
```

`totals` contiene i totali per dipendente al momento della chiusura, utili se il cliente contesta i numeri.
