# Provare ReBadge sul tuo computer

Serve **Node.js** (versione 22 o successiva). Per controllare, apri il Terminale e scrivi `node -v`.
Se il comando non esiste, installa la versione "LTS" da nodejs.org.

1. Estrai lo zip, ad esempio nella cartella Documenti.
2. Apri il Terminale e scrivi (una riga alla volta):
   ```
   cd ~/Documents/rebadge
   npm install
   npm run demo
   ```
3. Quando compare "modalità dimostrativa pronta", apri nel browser **http://localhost:3000** (la homepage)
   e poi **Accedi**, oppure direttamente **http://localhost:3000/accedi**
   - Email: `demo@presenze.it`
   - Password: `demo1234`

Ci sono già 5 dipendenti di esempio con 7 settimane di timbrature (e un'uscita dimenticata da sistemare
nella sezione Presenze). I PIN dei dipendenti compaiono nel Terminale.

**Per provare il tablet sullo stesso computer:** vai su *Tablet* → *Attiva questo tablet*.
Si apre la timbratrice e il tuo accesso viene chiuso. Per tornare alla dashboard apri di nuovo
http://localhost:3000/accedi. Suggerimento: usa una finestra in incognito per la dashboard e una normale per il tablet.

**Per provarlo da un vero tablet o dal telefono** (stessa rete Wi-Fi): serve collegare Supabase,
vedi `SUPABASE_SETUP.md`. La modalità dimostrativa funziona solo su questo computer.

I dati della modalità dimostrativa restano in memoria e si azzerano quando chiudi il Terminale (o premi Ctrl+C).
