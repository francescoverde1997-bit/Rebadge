// Test end-to-end Fase 5: ferie, permessi, malattia, calendario.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { formatInTimeZone } from "date-fns-tz";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const TZ = "Europe/Rome";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const state = async () => (await fetch(`${FAKE}/__state`)).json();

const now = new Date();
const TODAY = formatInTimeZone(now, TZ, "yyyy-MM-dd");
const CUR = TODAY.slice(0, 7);
const [cy, cm] = CUR.split("-").map(Number);
const nd = new Date(Date.UTC(cy, cm, 1));
const NEXT = `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}`;
const FROM = `${NEXT}-16`, TO = `${NEXT}-22`; // 7 giorni: sempre un sabato e una domenica

// oracolo indipendente per i giorni lavorativi (festività nazionali + Pasquetta)
function easterMonday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mo - 1, da + 1)).toISOString().slice(0, 10);
}
const FIXED = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "10-04", "11-01", "12-08", "12-25", "12-26"];
const isHol = (d) => FIXED.includes(d.slice(5)) || d === easterMonday(Number(d.slice(0, 4)));
function workingDays(from, to, sat) {
  let n = 0;
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10), wd = d.getUTCDay();
    if (wd === 0 || (wd === 6 && !sat) || isHol(iso)) continue;
    n++;
  }
  return n;
}
const giorni = (n) => `${n} ${n === 1 ? "giorno" : "giorni"} di ferie`;

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
async function addLeave({ who, type, from, to, minutes, note }) {
  if (!(await page.getByRole("heading", { name: "Nuova assenza" }).isVisible())) {
    await page.getByRole("button", { name: "Aggiungi assenza" }).click();
  }
  await page.getByLabel("Dipendente").selectOption({ label: who });
  await page.getByLabel("Tipo").selectOption(type);
  if (minutes) await page.getByLabel("Durata del permesso").selectOption(String(minutes));
  const sick = type === "malattia";
  await page.getByLabel(minutes ? "Giorno" : sick ? "Data di inizio malattia" : "Dal").fill(from);
  if (to) await page.getByLabel(sick ? "Data di fine malattia" : "Al (compreso)").fill(to);
  if (note) await page.getByLabel("Nota (facoltativa)").fill(note);
  await page.getByRole("button", { name: "Aggiungi assenza" }).click();
}
const row = (name) => page.getByRole("row", { name: new RegExp(`^${name}`) });

try {
  await page.goto(`${APP}/registrati`);
  await page.getByLabel("Nome").fill("Pizzeria Sole");
  await page.getByLabel("Email").fill("sole@pizzeria.it");
  await page.getByLabel("Password").fill("segreta123");
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL(/\/app$/);
  await addEmployee("Anna", "Rossi", "4821");
  await addEmployee("Bruno", "Gallo", "7316");

  await step("calendario del mese con tutti i dipendenti", async () => {
    await page.getByRole("link", { name: "Ferie", exact: true }).click();
    await page.waitForURL(/\/app\/ferie/);
    await row("Anna Rossi").waitFor();
    await row("Bruno Gallo").waitFor();
    await page.getByText("Nessuna assenza in questo mese.").waitFor();
  });

  await step("si possono pianificare le ferie nei mesi futuri", async () => {
    await page.getByRole("link", { name: /Mese successivo/ }).click();
    await page.waitForURL(new RegExp(`mese=${NEXT}`));
  });

  await step("ferie di una settimana: 7 giorni nel calendario, solo i lavorativi nel totale", async () => {
    await addLeave({ who: "Anna Rossi", type: "ferie", from: FROM, to: TO, note: "Mare" });
    await page.getByText("Assenza aggiunta").waitFor();
    assert.equal(await row("Anna Rossi").getByText("Ferie", { exact: true }).count(), 7);
    await page.getByText(giorni(workingDays(FROM, TO, false))).waitFor();
    const l = (await state()).leaves[0];
    assert.deepEqual([l.type, l.start_date, l.end_date, l.hours, l.note, l.status], ["ferie", FROM, TO, null, "Mare", "approved"]);
  });
  await page.screenshot({ path: `${SHOTS}/60-ferie-calendario.png`, fullPage: true });

  await step("assenze sovrapposte rifiutate con un messaggio chiaro", async () => {
    await addLeave({ who: "Anna Rossi", type: "malattia", from: TO });
    await page.getByText("ha già un'assenza", { exact: false }).waitFor();
    assert.equal((await state()).leaves.length, 1);
  });

  await step("date invertite rifiutate", async () => {
    await page.getByLabel("Tipo").selectOption("ferie");
    await page.getByLabel("Dal").fill(TO);
    await page.getByLabel("Al (compreso)").fill(FROM);
    await page.getByRole("button", { name: "Aggiungi assenza" }).click();
    await page.getByText("La data di fine viene prima", { exact: false }).waitFor();
  });

  await step("settimana di 6 giorni: il sabato conta come giorno di ferie", async () => {
    await page.goto(`${APP}/app/impostazioni`);
    await page.getByLabel("Settimana lavorativa").selectOption("6");
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.getByText("Regole salvate", { exact: false }).waitFor();
    await page.goto(`${APP}/app/ferie?mese=${NEXT}`);
    await page.getByText(giorni(workingDays(FROM, TO, true))).waitFor();
  });

  await step("permesso a ore oggi: compare in Oggi e nel dettaglio presenze", async () => {
    await page.goto(`${APP}/app/ferie`);
    await addLeave({ who: "Bruno Gallo", type: "permesso", from: TODAY, minutes: 150 });
    await page.getByText("Assenza aggiunta").waitFor();
    await page.getByText("2:30 di permesso").waitFor();
    await page.goto(`${APP}/app`);
    await page.getByRole("listitem").filter({ hasText: "Bruno Gallo" }).getByText("Permesso 2:30").waitFor();
    await page.goto(`${APP}/app/presenze`);
    await page.getByRole("link", { name: "Bruno Gallo" }).click();
    await page.locator(`[data-day="${TODAY}"]`).getByText("Permesso 2:30").waitFor();
    await page.getByText("Assenze nel mese: 2:30 di permesso", { exact: false }).waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/61-presenze-con-permesso.png` });

  await step("malattia: date di inizio e fine, protocollo INPS, rosso nel calendario", async () => {
    await page.goto(`${APP}/app/ferie?mese=${NEXT}`);
    await page.getByRole("button", { name: "Aggiungi assenza" }).click();
    await page.getByLabel("Dipendente").selectOption({ label: "Bruno Gallo" });
    await page.getByLabel("Tipo").selectOption("malattia");
    await page.getByLabel("Data di inizio malattia").fill(`${NEXT}-02`);
    await page.getByLabel("Data di fine malattia").fill(`${NEXT}-04`);
    await page.getByLabel("Protocollo certificato INPS (facoltativo)").fill("12;34");
    await page.getByRole("button", { name: "Aggiungi assenza" }).click();
    await page.getByText("Il protocollo ha solo numeri e lettere", { exact: false }).waitFor();
    await page.getByLabel("Protocollo certificato INPS (facoltativo)").fill("123 456 789");
    await page.getByRole("button", { name: "Aggiungi assenza" }).click();
    await page.getByText("Malattia aggiunta").waitFor();
    assert.equal(await row("Bruno Gallo").getByText("Malattia", { exact: true }).count(), 3);
    const bg = await row("Bruno Gallo").locator("span", { hasText: /^M$/ }).first().evaluate((el) => getComputedStyle(el.parentElement).backgroundColor);
    assert.equal(bg, "rgb(179, 38, 47)", "malattia in rosso pieno");
    await page.getByText("protocollo INPS 123456789").waitFor();
    // non è ferie né permesso
    const bruno = page.getByRole("listitem").filter({ hasText: /^Bruno Gallo/ }).first();
    await bruno.getByText("3 giorni di malattia").waitFor();
    assert.equal(await bruno.getByText(/di ferie|di permesso/).count(), 0);
    const l = (await state()).leaves.find((x) => x.type === "malattia");
    assert.deepEqual([l.start_date, l.end_date, l.inps_protocol], [`${NEXT}-02`, `${NEXT}-04`, "123456789"]);
  });
  await page.screenshot({ path: `${SHOTS}/63-malattia.png`, fullPage: true });

  await step("malattia inserita per errore: si modifica (date e protocollo)", async () => {
    await page.getByRole("button", { name: "Modifica Malattia di Bruno Gallo" }).click();
    const form = page.getByRole("region", { name: "Modifica: Malattia di Bruno Gallo" });
    assert.equal(await form.getByLabel("Protocollo certificato INPS (facoltativo)").inputValue(), "123456789");
    assert.equal(await form.getByLabel("Data di fine malattia").inputValue(), `${NEXT}-04`);
    await form.getByLabel("Data di fine malattia").fill(`${NEXT}-05`);
    await form.getByLabel("Protocollo certificato INPS (facoltativo)").fill("987654321");
    await page.screenshot({ path: `${SHOTS}/64-malattia-modifica.png`, fullPage: true });
    await form.getByRole("button", { name: "Salva modifiche" }).click();
    await page.getByText("Modifiche salvate").waitFor();
    await page.getByText("4 giorni di malattia").waitFor();
    await page.getByText("protocollo INPS 987654321").waitFor();
    assert.equal(await row("Bruno Gallo").getByText("Malattia", { exact: true }).count(), 4);
    const l = (await state()).leaves.find((x) => x.type === "malattia" && x.start_date.startsWith(NEXT));
    assert.deepEqual([l.end_date, l.inps_protocol], [`${NEXT}-05`, "987654321"]);
  });

  await step("modifica che si sovrappone ad altre assenze: rifiutata", async () => {
    await page.getByRole("button", { name: "Modifica Malattia di Bruno Gallo" }).click();
    const form = page.getByRole("region", { name: "Modifica: Malattia di Bruno Gallo" });
    await form.getByLabel("Dipendente").selectOption({ label: "Anna Rossi" });
    await form.getByLabel("Data di inizio malattia").fill(FROM);
    await form.getByLabel("Data di fine malattia").fill(TO);
    await form.getByRole("button", { name: "Salva modifiche" }).click();
    await form.getByText("ha già un'assenza", { exact: false }).waitFor();
    await form.getByRole("button", { name: "Annulla" }).click();
    const bruno = (await state()).employees.find((e) => e.first_name === "Bruno");
    const l = (await state()).leaves.find((x) => x.type === "malattia" && x.start_date.startsWith(NEXT));
    assert.equal(l.employee_id, bruno.id, "nulla è cambiato");
  });

  await step("malattia nel dettaglio presenze del dipendente, in rosso", async () => {
    // una malattia nel mese in corso (la pagina Presenze mostra solo mesi passati e corrente)
    const day = TODAY.endsWith("-01") ? `${CUR}-02` : `${CUR}-01`;
    const bruno = (await state()).employees.find((e) => e.first_name === "Bruno");
    await fetch(`${FAKE}/__leaves`, { method: "POST", body: JSON.stringify([{ employee_id: bruno.id, type: "malattia", start_date: day, end_date: day, inps_protocol: "555555555" }]) });
    await page.goto(`${APP}/app/presenze/${bruno.id}`);
    const chip = page.locator(`[data-day="${day}"]`).getByText("Malattia", { exact: true });
    await chip.waitFor();
    assert.equal(await chip.evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(179, 38, 47)");
    await page.goto(`${APP}/app/ferie?mese=${NEXT}`);
  });

  await step("eliminazione con conferma", async () => {
    await page.goto(`${APP}/app/ferie?mese=${NEXT}`);
    await page.getByRole("button", { name: "Elimina Ferie di Anna Rossi" }).click();
    await page.getByRole("button", { name: "Sì, elimina" }).click();
    await page.getByRole("button", { name: "Elimina Malattia di Bruno Gallo" }).click();
    await page.getByRole("button", { name: "Sì, elimina" }).click();
    await page.getByText("Nessuna assenza in questo mese.").waitFor();
    assert.equal((await state()).leaves.length, 2); // restano il permesso e la malattia del mese in corso
  });

  await step("smartphone: il calendario scorre dentro il riquadro, non la pagina", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.context().addCookies(await page.context().cookies());
    await m.goto(`${APP}/app/ferie`);
    await m.screenshot({ path: `${SHOTS}/62-mobile-ferie.png` });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.close();
  });

  await step("nessun errore JavaScript nel browser", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
