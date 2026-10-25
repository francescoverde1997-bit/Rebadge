// Test end-to-end Fase C: Oggi con riepilogo, menu da smartphone, Presenze a schede,
// dettaglio a settimane con collegamento diretto al giorno, filtro per iniziale sulla timbratrice.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const SHOTS = "e2e-shots";
const TZ = "Europe/Rome";
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}
const post = async (path, body, token) => (await fetch(`${FAKE}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})).json();

// --- dati: un'azienda con 13 dipendenti (oltre la soglia del filtro) e un mese passato con un'uscita dimenticata
await fetch(`${FAKE}/__reset`);
const EMAIL = "fasec@trattoria.it", PASSWORD = "segreta123";
const session = await post("/auth/v1/signup", { email: EMAIL, password: PASSWORD, data: { company_name: "Trattoria Fase C", signup_kind: "owner" } });
const companyId = (await (await fetch(`${FAKE}/__state`)).json()).companies[0].id;
const TEAM = [
  ["Anna", "Rossi", "4821"], ["Bruno", "Gallo", "7316"], ["Carla", "Neri", "5092"], ["Dario", "Fabbri", "6148"],
  ["Elena", "Romano", "3907"], ["Fabio", "Riva", "2851"], ["Giulia", "Marino", "9264"], ["Ivo", "Sala", "1739"],
  ["Luca", "Conti", "8412"], ["Marco", "Costa", "3586"], ["Marta", "Villa", "7025"], ["Nadia", "Greco", "4690"],
  ["Paolo", "Fontana", "6371"],
];
for (const [first, last, pin] of TEAM) {
  await post("/rest/v1/rpc/create_employee", { p_company_id: companyId, p_first_name: first, p_last_name: last, p_email: null, p_pin: pin }, session.access_token);
}
const employees = (await (await fetch(`${FAKE}/__state`)).json()).employees;
const idOf = (first) => employees.find((e) => e.first_name === first).id;

// mese scorso: lunedì 9–17, martedì solo entrata (uscita dimenticata)
const now = new Date();
const thisMonth = formatInTimeZone(now, TZ, "yyyy-MM");
const [y, m] = thisMonth.split("-").map(Number);
const PREV = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
let monday = 8;
while (new Date(`${PREV}-${String(monday).padStart(2, "0")}T12:00:00Z`).getUTCDay() !== 1) monday++;
const MON = `${PREV}-${String(monday).padStart(2, "0")}`;
const TUE = `${PREV}-${String(monday + 1).padStart(2, "0")}`;
const at = (date, hh) => fromZonedTime(`${date}T${hh}:00`, TZ).toISOString();
await fetch(`${FAKE}/__punches`, {
  method: "POST",
  body: JSON.stringify([
    { employee_id: idOf("Anna"), kind: "in", punched_at: at(MON, "09:00") },
    { employee_id: idOf("Anna"), kind: "out", punched_at: at(MON, "17:00") },
    { employee_id: idOf("Anna"), kind: "in", punched_at: at(TUE, "09:00") },
  ]),
});

const browser = await chromium.launch();
async function login(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${APP}/accedi`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL(/\/app$/);
  return page;
}
const noHorizontalScroll = async (page) =>
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `scroll orizzontale su ${page.url()}`);

try {
  const desk = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "it-IT", timezoneId: TZ });
  const page = await login(desk);

  await step("Oggi: riepilogo del mese, passo mancante e report del mese scorso", async () => {
    await page.getByRole("link", { name: "Attiva il tablet per le timbrature" }).waitFor();
    await page.getByText("Ore di ", { exact: false }).first().waitFor();
    await page.getByText("Da sistemare", { exact: true }).waitFor();
    await page.getByText("Report di ", { exact: false }).waitFor();
    await page.getByRole("link", { name: "Apri il report" }).waitFor();
    await page.getByRole("heading", { name: /Al lavoro adesso\s*0 di 13/ }).waitFor();
    assert.equal(await page.getByRole("row").filter({ hasText: "non in servizio" }).count(), 13);
  });

  await step("dettaglio dipendente: giorni raggruppati per settimana con il totale", async () => {
    await page.goto(`${APP}/app/presenze/${idOf("Anna")}?mese=${PREV}`);
    const week = page.getByRole("region", { name: /^Settimana / }).filter({ has: page.locator(`[data-day="${MON}"]`) });
    await week.getByRole("heading", { name: /8:00/ }).waitFor();
    await week.locator(`[data-day="${TUE}"]`).getByText("Manca l'uscita").waitFor();
  });

  await step("l'avviso porta al giorno da sistemare e apre la correzione", async () => {
    await page.getByRole("link", { name: "Aggiungi l'uscita" }).click();
    await page.waitForURL(new RegExp(`#g-${TUE}$`));
    const tue = page.locator(`[data-day="${TUE}"]`);
    await tue.getByRole("heading", { name: "Aggiungi una timbratura dimenticata" }).waitFor();
    assert.equal(await tue.getByRole("radio", { name: "Uscita" }).isChecked(), true);
  });
  await page.screenshot({ path: `${SHOTS}/110-dettaglio-settimane.png`, fullPage: true });

  await step("le giornate senza anomalie hanno un pulsante compatto Correggi", async () => {
    const mon = page.locator(`[data-day="${MON}"]`);
    await mon.getByRole("button", { name: /^Correggi / }).click();
    await mon.getByRole("heading", { name: "Timbrature del giorno" }).waitFor();
  });
  await desk.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "it-IT", timezoneId: TZ, hasTouch: true, isMobile: true });
  const mob = await login(phone);

  await step("smartphone: menu in basso con tutte le sezioni (Altro)", async () => {
    const nav = mob.getByRole("navigation", { name: "Sezioni" });
    assert.equal(await nav.count(), 1, "una sola barra di navigazione visibile");
    await nav.getByRole("link", { name: "Ferie" }).waitFor();
    await nav.getByRole("button", { name: "Altro" }).click();
    await mob.getByRole("link", { name: "Dipendenti" }).click();
    await mob.waitForURL(/\/app\/dipendenti$/);
    await mob.getByRole("button", { name: "Altro" }).click();
    await mob.getByRole("button", { name: "Esci" }).waitFor();
    await mob.keyboard.press("Escape");
    assert.equal(await mob.getByRole("button", { name: "Esci" }).count(), 0);
    await noHorizontalScroll(mob);
  });

  await step("smartphone: Presenze a schede con il totale ben visibile", async () => {
    await mob.goto(`${APP}/app/presenze?mese=${PREV}`);
    await mob.getByText("Totale del mese").waitFor();
    const card = mob.getByRole("link", { name: /^Anna Rossi: 8:00 ore, 1 da sistemare$/ });
    await card.waitFor();
    assert.equal(await mob.getByRole("table").count(), 0, "la tabella resta solo da computer");
    await noHorizontalScroll(mob);
    await mob.screenshot({ path: `${SHOTS}/111-presenze-smartphone.png`, fullPage: true });
    await card.click();
    await mob.getByRole("heading", { name: "Anna Rossi" }).waitFor();
    await noHorizontalScroll(mob);
  });
  await phone.close();

  const tabletCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: "it-IT", timezoneId: TZ });
  const tablet = await login(tabletCtx);

  await step("timbratrice: con più di 12 dipendenti compare il filtro per iniziale", async () => {
    await tablet.goto(`${APP}/app/tablet`);
    await tablet.getByRole("button", { name: "Attiva questo tablet" }).click();
    await tablet.getByLabel("Nome del tablet").fill("Sala");
    await tablet.getByRole("button", { name: "Attiva e apri la timbratrice" }).click();
    await tablet.waitForURL(/\/timbra/);
    const filter = tablet.getByRole("group", { name: "Filtra per iniziale del nome" });
    await filter.getByRole("button", { name: "Tutti" }).waitFor();
    assert.equal(await tablet.getByRole("listitem").count(), 13);
    await filter.getByRole("button", { name: "M", exact: true }).click();
    assert.equal(await tablet.getByRole("listitem").count(), 2);
    await tablet.getByText("2 con la M").waitFor();
    await tablet.screenshot({ path: `${SHOTS}/112-timbratrice-filtro.png` });
  });

  await step("il filtro si azzera dopo la timbratura", async () => {
    await tablet.getByRole("button", { name: /Marta/ }).click();
    for (const d of "7025") await tablet.getByRole("button", { name: d, exact: true }).click();
    await tablet.getByRole("button", { name: "Conferma" }).click();
    await tablet.getByRole("status").filter({ hasText: /Entrata alle/ }).waitFor();
    await tablet.getByText("Tocca per continuare").click();
    await tablet.getByRole("group", { name: "Filtra per iniziale del nome" }).getByRole("button", { name: "Tutti", pressed: true }).waitFor();
    assert.equal(await tablet.getByRole("listitem").count(), 13);
  });
  await tabletCtx.close();
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
