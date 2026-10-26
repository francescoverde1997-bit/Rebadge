// Test end-to-end: promemoria serale al titolare (decisione 74).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const MAIL = process.env.FAKE_EMAIL_URL ?? "http://localhost:54600";
const CRON = process.env.CRON_SECRET ?? "cron_fake";
const TZ = "Europe/Rome";

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
const emails = async () => (await fetch(`${MAIL}/__emails`)).json();
const at = (date, hm) => fromZonedTime(`${date}T${hm}:00`, TZ);
const cron = (date, hm, auth = true) => fetch(`${APP}/api/cron/promemoria?ora=${encodeURIComponent(at(date, hm).toISOString())}`, {
  headers: auth ? { authorization: `Bearer ${CRON}` } : {},
});
const dayShift = (date, n) => formatInTimeZone(new Date(at(date, "12:00").getTime() + n * 86_400_000), TZ, "yyyy-MM-dd");

// --- dati: un'azienda, tre dipendenti, tre giorni fa la sera del promemoria
await fetch(`${FAKE}/__reset`);
await fetch(`${MAIL}/__reset`);
const EMAIL = "titolare@ferraro.test", PASSWORD = "segreta123";
const session = await post("/auth/v1/signup", { email: EMAIL, password: PASSWORD, data: { company_name: "Ferraro Impianti", signup_kind: "owner" } });
const companyId = (await (await fetch(`${FAKE}/__state`)).json()).companies[0].id;
for (const [first, last, pin] of [["Anna", "Rossi", "4821"], ["Bruno", "Gallo", "7316"], ["Chiara", "Esposito", "5092"]]) {
  await post("/rest/v1/rpc/create_employee", { p_company_id: companyId, p_first_name: first, p_last_name: last, p_email: null, p_pin: pin }, session.access_token);
}
const idOf = async (first) => (await (await fetch(`${FAKE}/__state`)).json()).employees.find((e) => e.first_name === first).id;
const D = dayShift(formatInTimeZone(new Date(), TZ, "yyyy-MM-dd"), -3); // la sera del test
const D2 = dayShift(D, -2);
await fetch(`${FAKE}/__punches`, {
  method: "POST",
  body: JSON.stringify([
    { employee_id: await idOf("Anna"), kind: "in", punched_at: at(D, "14:02").toISOString() },   // pomeriggio senza uscita
    { employee_id: await idOf("Bruno"), kind: "in", punched_at: at(D2, "08:01").toISOString() },  // due giorni prima, senza uscita
    { employee_id: await idOf("Bruno"), kind: "in", punched_at: at(D, "08:00").toISOString() },
    { employee_id: await idOf("Bruno"), kind: "out", punched_at: at(D, "17:00").toISOString() },
    { employee_id: await idOf("Chiara"), kind: "in", punched_at: at(D, "08:00").toISOString() },  // in regola
    { employee_id: await idOf("Chiara"), kind: "out", punched_at: at(D, "17:00").toISOString() },
  ]),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "it-IT", timezoneId: TZ });
await page.goto(`${APP}/accedi`);
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Accedi" }).click();
await page.waitForURL(/\/app$/);
const settings = async () => (await (await fetch(`${FAKE}/__state`)).json()).settings.find((s) => s.company_id === companyId);

try {
  await step("Impostazioni: il titolare vede il promemoria (attivo, 20:00) e sceglie le 20:30", async () => {
    await page.goto(`${APP}/app/impostazioni`);
    const sec = page.getByRole("region", { name: "Promemoria serale" });
    assert.equal(await sec.getByLabel("Mandami il promemoria serale").isChecked(), true);
    assert.equal(await sec.getByLabel("Orario").inputValue(), "1200");
    await sec.getByText(`Arriva a ${EMAIL}`, { exact: false }).waitFor();
    await sec.getByLabel("Orario").selectOption("1230");
    await sec.getByRole("button", { name: "Salva promemoria" }).click();
    await sec.getByText("Promemoria salvato").waitFor();
    assert.equal((await settings()).reminder_minutes, 1230);
  });

  await step("il servizio serale rifiuta chi non ha il codice segreto", async () => {
    assert.equal((await cron(D, "21:00", false)).status, 401);
  });

  await step("prima dell'orario scelto non parte nulla", async () => {
    const r = await (await cron(D, "20:15")).json();
    assert.equal(r.risultati.find((x) => x.company === companyId).esito, "non ancora l'ora");
    assert.equal((await emails()).length, 0);
  });

  await step("all'orario: una sola email al titolare con chi è ancora al lavoro e le timbrature da sistemare", async () => {
    const r = await (await cron(D, "20:35")).json();
    assert.match(r.risultati.find((x) => x.company === companyId).esito, /^inviato \(1 al lavoro, 1 da sistemare\)/);
    const [m] = await emails();
    assert.deepEqual(m.to, [EMAIL]);
    assert.equal(m.subject, "ReBadge · 2 timbrature da controllare");
    assert.match(m.text, /Anna Rossi: entrata alle 14:02, nessuna uscita \(da 6:33 ore\)/);
    assert.match(m.text, /Bruno Gallo: .*, entrata alle 08:01 senza uscita/);
    assert.ok(!m.text.includes("Chiara"), "chi è in regola non compare");
    assert.ok(m.text.includes(`${APP}/app/presenze/${await idOf("Bruno")}?mese=${D2.slice(0, 7)}#g-${D2}`));
  });

  await step("la stessa sera non arriva una seconda email", async () => {
    const r = await (await cron(D, "22:35")).json();
    assert.equal(r.risultati.find((x) => x.company === companyId).esito, "già inviato oggi");
    assert.equal((await emails()).length, 1);
  });

  await step("la sera dopo le dimenticanze non sistemate vengono ricordate di nuovo", async () => {
    const r = await (await cron(dayShift(D, 1), "20:40")).json();
    assert.match(r.risultati.find((x) => x.company === companyId).esito, /^inviato \(0 al lavoro, 2 da sistemare\)/);
    const m = (await emails())[1];
    assert.match(m.text, /Anna Rossi: .*entrata alle 14:02 senza uscita/);
    assert.match(m.text, /Bruno Gallo/);
  });

  await step("il link dell'email apre il giorno da correggere", async () => {
    const m = (await emails())[0];
    const href = m.text.match(new RegExp(`${APP}/app/presenze/[^\\s]+#g-${D2}`))[0];
    await page.goto(href);
    await page.locator(`[data-day="${D2}"]`).getByRole("heading", { name: "Aggiungi una timbratura dimenticata" }).waitFor();
  });

  await step("promemoria disattivato: nessuna email", async () => {
    await page.goto(`${APP}/app/impostazioni`);
    const sec = page.getByRole("region", { name: "Promemoria serale" });
    await sec.getByLabel("Mandami il promemoria serale").uncheck();
    await sec.getByRole("button", { name: "Salva promemoria" }).click();
    await sec.getByText("Promemoria disattivato").waitFor();
    const s = await settings();
    assert.deepEqual([s.reminder_enabled, s.reminder_minutes], [false, 1230], "l'orario scelto si conserva");
    const r = await (await cron(dayShift(D, 2), "21:00")).json();
    assert.equal(r.risultati.find((x) => x.company === companyId).esito, "promemoria disattivato");
    assert.equal((await emails()).length, 2);
  });
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
