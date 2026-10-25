// Test end-to-end Fase 4: presenze, riepilogo mensile, correzioni.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const TZ = "Europe/Rome";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const state = async () => (await fetch(`${FAKE}/__state`)).json();

// mese precedente (sempre completo): giorni 3-6 non toccano mai il cambio d'ora
const now = new Date();
const cur = formatInTimeZone(now, TZ, "yyyy-MM");
const [cy, cm] = cur.split("-").map(Number);
const prevDate = new Date(Date.UTC(cy, cm - 2, 1));
const PREV = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
const iso = (day, hm) => fromZonedTime(`${PREV}-${day}T${hm}:00`, TZ).toISOString();
// festivo = domenica o 6 gennaio (l'unica festività possibile tra il 3 e il 6 del mese)
const fest = (day) => new Date(`${PREV}-${day}T12:00:00Z`).getUTCDay() === 0 || `${PREV}-${day}`.endsWith("-01-06");
const hm = (m) => (m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : "—");
// Anna: 8:30 il 3, turno 22-06 tra il 5 e il 6 (2 ore il 5, 6 ore il 6); Bruno: 8 ore il 3
const annaFest = (fest("03") ? 510 : 0) + (fest("05") ? 120 : 0) + (fest("06") ? 360 : 0);
const brunoFest = fest("03") ? 480 : 0;

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}

await fetch(`${FAKE}/__reset`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "it-IT" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function addEmployee(first, last, pin) {
  await page.goto(`${APP}/app/dipendenti`);
  if (!(await page.getByRole("heading", { name: "Nuovo dipendente" }).isVisible())) {
    await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
  }
  await page.getByLabel("Nome", { exact: true }).fill(first);
  await page.getByLabel("Cognome").fill(last);
  await page.getByLabel("PIN per il tablet").fill(pin);
  await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
  await page.getByText(`${first} ${last} aggiunto`, { exact: false }).waitFor();
}
const cells = async (name) => (await page.getByRole("row", { name: new RegExp(name) }).locator("th, td").allTextContents()).map((t) => t.trim());
const total = async (label) => (await page.locator(`dt:has-text("${label}") + dd`).textContent()).trim();

try {
  await page.goto(`${APP}/registrati`);
  await page.getByLabel("Nome").fill("Trattoria Lago");
  await page.getByLabel("Email").fill("lago@trattoria.it");
  await page.getByLabel("Password").fill("segreta123");
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL(/\/app$/);
  await addEmployee("Anna", "Rossi", "4821");
  await addEmployee("Bruno", "Gallo", "7316");

  const s0 = await state();
  const anna = s0.employees.find((e) => e.first_name === "Anna").id;
  const bruno = s0.employees.find((e) => e.first_name === "Bruno").id;
  await fetch(`${FAKE}/__punches`, {
    method: "POST",
    body: JSON.stringify([
      // Anna: giorno 3 con pausa e 30 minuti di straordinario
      { employee_id: anna, kind: "in", punched_at: iso("03", "08:00") },
      { employee_id: anna, kind: "out", punched_at: iso("03", "12:00") },
      { employee_id: anna, kind: "in", punched_at: iso("03", "13:00") },
      { employee_id: anna, kind: "out", punched_at: iso("03", "17:30") },
      // giorno 4: uscita dimenticata
      { employee_id: anna, kind: "in", punched_at: iso("04", "08:00") },
      // giorno 5: turno notturno fino al mattino del 6
      { employee_id: anna, kind: "in", punched_at: iso("05", "22:00") },
      { employee_id: anna, kind: "out", punched_at: iso("06", "06:00") },
      // Bruno: giorno 3 normale, e oggi è entrato due ore fa
      { employee_id: bruno, kind: "in", punched_at: iso("03", "08:00") },
      { employee_id: bruno, kind: "out", punched_at: iso("03", "16:00") },
      { employee_id: bruno, kind: "in", punched_at: new Date(now.getTime() - 2 * 3600_000).toISOString() },
    ]),
  });

  await step("Oggi: chi è al lavoro adesso, con l'ora di entrata", async () => {
    await page.goto(`${APP}/app`);
    await page.getByRole("heading", { name: /Al lavoro adesso\s*1 di 2/ }).waitFor();
    const since = formatInTimeZone(new Date(now.getTime() - 2 * 3600_000), TZ, "HH:mm");
    await page.getByRole("row").filter({ hasText: "Bruno Gallo" }).getByText(since).waitFor();
    await page.getByRole("row").filter({ hasText: "Bruno Gallo" }).getByText(/^2:0\d$/).waitFor(); // in servizio da 2 ore
    assert.equal(await page.getByRole("row").filter({ hasText: "non in servizio" }).count(), 1);
  });
  await page.screenshot({ path: `${SHOTS}/30-oggi.png` });

  await step("Presenze: riepilogo del mese con totali corretti", async () => {
    await page.getByRole("link", { name: "Presenze", exact: true }).click();
    await page.waitForURL(/\/app\/presenze/);
    await page.getByRole("link", { name: /Mese precedente/ }).click();
    await page.waitForURL(new RegExp(`mese=${PREV}`));
    // Dipendente | Giorni | Ordinarie | Straordinari | Totale | di cui notturne | di cui festive | Da sistemare
    assert.deepEqual(await cells("Anna Rossi"), ["Anna Rossi", "2", "16:00", "0:30", "16:30", "8:00", hm(annaFest), "1 timbratura"]);
    assert.deepEqual(await cells("Bruno Gallo"), ["Bruno Gallo", "1", "8:00", "—", "8:00", "—", hm(brunoFest), "—"]);
    const foot = (await page.locator("tfoot tr").locator("th, td").allTextContents()).map((t) => t.trim());
    assert.deepEqual(foot.slice(2, 7), ["24:00", "0:30", "24:30", "8:00", hm(annaFest + brunoFest)]);
  });
  await page.screenshot({ path: `${SHOTS}/31-presenze-mese.png` });

  await step("il mese successivo a quello corrente non è raggiungibile", async () => {
    await page.goto(`${APP}/app/presenze?mese=2999-01`);
    assert.equal(await page.getByRole("link", { name: /Mese successivo/ }).count(), 0);
  });

  await step("dettaglio: giorno con uscita mancante evidenziato", async () => {
    await page.goto(`${APP}/app/presenze?mese=${PREV}`);
    await page.getByRole("link", { name: "Anna Rossi" }).click();
    await page.waitForURL(/\/app\/presenze\/.+\?mese=/);
    assert.equal(await total("Ore lavorate"), "16:30");
    assert.equal(await total("Straordinari"), "0:30");
    const d4 = page.locator(`[data-day="${PREV}-04"]`);
    await d4.getByText("Manca l'uscita").waitFor();
    await page.getByText("C'è 1 timbratura da sistemare", { exact: false }).waitFor();
    // il turno notturno conta nel giorno di entrata
    await page.locator(`[data-day="${PREV}-05"]`).getByText("8:00", { exact: true }).waitFor();
    await page.locator(`[data-day="${PREV}-05"]`).getByText("8:00 di notte").waitFor();
    assert.equal(await total("di cui notturne"), "8:00");
    await page.locator(`[data-day="${PREV}-06"]`).getByText(/turno di \w+ 5/).waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/32-dettaglio-anomalia.png`, fullPage: true });

  await step("correzione: servono ora e motivo", async () => {
    const d4 = page.locator(`[data-day="${PREV}-04"]`);
    await d4.getByRole("button", { name: /Aggiungi l'uscita/ }).click();
    assert.equal(await d4.getByRole("radio", { name: "Uscita" }).isChecked(), true, "propone l'uscita mancante");
    await d4.getByRole("button", { name: "Aggiungi timbratura" }).click();
    await d4.getByText("Inserisci l'ora", { exact: false }).waitFor();
    await d4.getByText("Scrivi il motivo", { exact: false }).waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/33-correzione.png` });

  await step("aggiunta dell'uscita dimenticata: anomalia risolta e ore ricalcolate", async () => {
    const d4 = page.locator(`[data-day="${PREV}-04"]`);
    await d4.getByLabel("Ora").fill("16:00");
    await d4.getByLabel("Motivo").fill("Uscita dimenticata, confermata da Anna");
    await d4.getByRole("button", { name: "Aggiungi timbratura" }).click();
    await d4.getByText("Manca l'uscita").waitFor({ state: "detached" });
    assert.equal(await total("Ore lavorate"), "24:30");
    assert.equal(await total("Giorni lavorati"), "3");
    const added = (await state()).punches.find((p) => p.source === "manual");
    assert.equal(added.kind, "out");
    assert.equal(added.punched_at, iso("04", "16:00"));
    assert.equal(added.note, "Uscita dimenticata, confermata da Anna");
    assert.equal(await page.getByText("timbratura da sistemare", { exact: false }).count(), 0);
  });

  await step("annullamento con motivo: la timbratura resta visibile barrata", async () => {
    const d4 = page.locator(`[data-day="${PREV}-04"]`);
    await d4.getByRole("button", { name: /Correggi/ }).click();
    await d4.getByRole("button", { name: "Annulla Uscita 16:00" }).click();
    await d4.getByRole("button", { name: "Annulla timbratura" }).click();
    await d4.getByText("Scrivi il motivo", { exact: false }).waitFor();
    await d4.getByLabel("Perché la annulli?").fill("Orario non confermato");
    await d4.getByRole("button", { name: "Annulla timbratura" }).click();
    await d4.getByText("Manca l'uscita").waitFor();
    assert.equal(await total("Ore lavorate"), "16:30");
    await d4.getByText("Uscita annullata", { exact: false }).waitFor({ state: "attached" });
    const voided = (await state()).punches.find((p) => p.source === "manual");
    assert.equal(voided.void_reason, "Orario non confermato");
  });

  await step("il titolare cambia la fascia notturna e poi la disattiva", async () => {
    await page.goto(`${APP}/app/impostazioni`);
    await page.getByLabel("Dalle").selectOption("00:00");
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.getByText("Regole salvate", { exact: false }).waitFor();
    let st = (await state()).settings[0];
    assert.equal(st.night_start_minutes, 0);
    await page.goto(`${APP}/app/presenze?mese=${PREV}`);
    assert.equal((await cells("Anna Rossi"))[5], "6:00", "con fascia 00-06 il turno 22-06 ha 6 ore notturne");

    await page.goto(`${APP}/app/impostazioni`);
    await page.getByLabel("Indica le ore notturne").uncheck();
    await page.getByLabel("Indica le ore festive", { exact: false }).uncheck();
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.getByText("Regole salvate", { exact: false }).waitFor();
    st = (await state()).settings[0];
    assert.equal(st.track_night, false);
    assert.equal(st.track_holiday, false);
    await page.goto(`${APP}/app/presenze?mese=${PREV}`);
    assert.equal(await page.getByRole("columnheader", { name: "di cui notturne" }).count(), 0);
    assert.equal(await page.getByRole("columnheader", { name: "di cui festive" }).count(), 0);
    assert.deepEqual(await cells("Anna Rossi"), ["Anna Rossi", "2", "16:00", "0:30", "16:30", "1 timbratura"]);
  });

  await step("Santo Patrono: il cliente lo inserisce e il giorno diventa festivo", async () => {
    await page.goto(`${APP}/app/impostazioni`);
    await page.getByLabel("Giorno", { exact: true }).selectOption("30");
    await page.getByLabel("Mese", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.getByText("Questa data non esiste").waitFor();
    // il patrono cade il giorno 3 del mese precedente (giorno lavorato da Anna e Bruno)
    await page.getByLabel("Giorno", { exact: true }).selectOption("3");
    await page.getByLabel("Mese", { exact: true }).selectOption(String(Number(PREV.slice(5))));
    await page.getByLabel("Nome (facoltativo)").fill("San Prova");
    await page.getByLabel("Indica le ore festive", { exact: false }).check();
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.getByText("Regole salvate", { exact: false }).waitFor();
    const st = (await state()).settings[0];
    assert.equal(st.patron_month_day, `${PREV.slice(5)}-03`);
    assert.equal(st.patron_name, "San Prova");
    await page.goto(`${APP}/app/presenze?mese=${PREV}`);
    await page.getByRole("link", { name: "Anna Rossi" }).click();
    await page.locator(`[data-day="${PREV}-03"]`).getByText("San Prova").waitFor();
    await page.locator(`[data-day="${PREV}-03"]`).getByText("8:30 festive").waitFor();
  });

  await step("smartphone: dettaglio senza scroll orizzontale", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.context().addCookies(await page.context().cookies());
    await m.goto(page.url());
    await m.screenshot({ path: `${SHOTS}/34-mobile-dettaglio.png` });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.goto(`${APP}/app/presenze?mese=${PREV}`);
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.close();
  });

  await step("nessun errore JavaScript nel browser", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
