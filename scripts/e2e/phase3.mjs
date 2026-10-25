// Test end-to-end Fase 3: attivazione tablet e timbratura.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const state = async () => (await fetch(`${FAKE}/__state`)).json();
const hhmm = (d = new Date()) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(d);

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}

await fetch(`${FAKE}/__reset`);
const browser = await chromium.launch();
// il "tablet": orizzontale, schermo touch
const tabletCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: "it-IT" });
const tablet = await tabletCtx.newPage();
const errors = [];
tablet.on("pageerror", (e) => errors.push(e.message));

async function addEmployee(page, first, last, pin) {
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
const pressPin = async (pin) => { for (const d of pin) await tablet.getByRole("button", { name: d, exact: true }).click(); };

try {
  await step("tablet non attivato: schermata con istruzioni", async () => {
    await tablet.goto(`${APP}/timbra`);
    await tablet.getByRole("heading", { name: "Tablet non attivato" }).waitFor();
  });

  // il titolare accede dal tablet e prepara i dipendenti
  await tablet.goto(`${APP}/registrati`);
  await tablet.getByLabel("Nome").fill("Panificio Aurora");
  await tablet.getByLabel("Email").fill("aurora@panificio.it");
  await tablet.getByLabel("Password").fill("segreta123");
  await tablet.getByRole("button", { name: "Crea account" }).click();
  await tablet.waitForURL(/\/app$/);
  await addEmployee(tablet, "Anna", "Rossi", "4821");
  await addEmployee(tablet, "Bruno", "Gallo", "7316");

  await step("il titolare attiva il tablet e si apre la timbratrice", async () => {
    await tablet.getByRole("link", { name: "Tablet" }).click();
    await tablet.getByRole("button", { name: "Attiva questo tablet" }).click();
    await tablet.getByLabel("Nome del tablet").fill("Bancone");
    await tablet.getByRole("button", { name: "Attiva e apri la timbratrice" }).click();
    await tablet.waitForURL(/\/timbra$/);
    await tablet.getByRole("heading", { name: "Tocca il tuo nome" }).waitFor();
    assert.equal((await state()).devices.length, 1);
  });
  await tablet.screenshot({ path: `${SHOTS}/20-tablet-nomi.png` });

  await step("sul tablet la sessione del titolare è chiusa", async () => {
    const p = await tabletCtx.newPage();
    await p.goto(`${APP}/app`);
    await p.waitForURL(/\/accedi$/);
    await p.close();
  });

  await step("nome azienda e orologio visibili", async () => {
    await tablet.getByText("Panificio Aurora").waitFor();
    await tablet.getByText(hhmm()).first().waitFor();
  });

  await step("PIN errato: messaggio e nuovo tentativo", async () => {
    await tablet.getByRole("button", { name: /Anna/ }).click();
    await tablet.getByText("Inserisci il tuo PIN").waitFor();
    await pressPin("9999");
    await tablet.getByRole("button", { name: "Conferma" }).click();
    await tablet.getByText("PIN non corretto, riprova").waitFor();
  });
  await tablet.screenshot({ path: `${SHOTS}/21-tablet-pin.png` });

  await step("PIN corretto: entrata con l'ora del server", async () => {
    await pressPin("4821");
    await tablet.getByRole("button", { name: "Conferma" }).click();
    await tablet.getByRole("status").filter({ hasText: /^Entrata alle \d\d:\d\d$/ }).waitFor();
    await tablet.getByText("Buon lavoro, Anna.").waitFor();
    const s = await state();
    assert.equal(s.punches.length, 1);
    assert.equal(s.punches[0].kind, "in");
  });
  await tablet.screenshot({ path: `${SHOTS}/22-tablet-entrata.png` });

  await step("dopo 4 secondi torna all'elenco", async () => {
    await tablet.getByRole("heading", { name: "Tocca il tuo nome" }).waitFor({ timeout: 7000 });
  });

  await step("doppio tocco: nessuna seconda timbratura", async () => {
    await tablet.getByRole("button", { name: /Anna/ }).click();
    await tablet.keyboard.type("4821");
    await tablet.keyboard.press("Enter");
    await tablet.getByText(/già registrata/).waitFor();
    assert.equal((await state()).punches.length, 1);
    await tablet.getByRole("button", { name: /Tocca per continuare/ }).click();
  });

  await step("dopo qualche ora: uscita", async () => {
    await fetch(`${FAKE}/__shift?min=240`);
    await tablet.getByRole("button", { name: /Anna/ }).click();
    await tablet.keyboard.type("4821");
    await tablet.keyboard.press("Enter");
    await tablet.getByRole("status").filter({ hasText: /^Uscita alle \d\d:\d\d$/ }).waitFor();
    assert.deepEqual((await state()).punches.map((p) => p.kind), ["in", "out"]);
  });
  await tablet.screenshot({ path: `${SHOTS}/23-tablet-uscita.png` });
  await tablet.getByRole("button", { name: /Tocca per continuare/ }).click();

  await step("\"Non sono io\" torna all'elenco", async () => {
    await tablet.getByRole("button", { name: /Bruno/ }).click();
    await tablet.getByRole("button", { name: "Non sono io" }).click();
    await tablet.getByRole("heading", { name: "Tocca il tuo nome" }).waitFor();
  });

  await step("5 PIN errati bloccano il dipendente", async () => {
    await tablet.getByRole("button", { name: /Bruno/ }).click();
    for (let i = 0; i < 4; i++) {
      await pressPin("1111");
      await tablet.getByRole("button", { name: "Conferma" }).click();
      await tablet.getByText("PIN non corretto, riprova").waitFor();
    }
    await pressPin("1111");
    await tablet.getByRole("button", { name: "Conferma" }).click();
    await tablet.getByText("PIN bloccato").waitFor();
    assert.equal((await state()).punches.filter((p) => p.kind).length, 2);
    await tablet.getByRole("button", { name: /Tocca per continuare/ }).click();
  });

  await step("senza rete: avviso chiaro, nessuna finta conferma", async () => {
    await tablet.route("**/rest/v1/rpc/kiosk_punch", (r) => r.abort("internetdisconnected"));
    await tablet.getByRole("button", { name: /Anna/ }).click();
    await tablet.keyboard.type("4821");
    await tablet.keyboard.press("Enter");
    await tablet.getByText("Timbratura non registrata").waitFor();
    await tablet.getByText("Connessione assente", { exact: false }).first().waitFor();
    assert.equal((await state()).punches.length, 2);
    await tablet.unroute("**/rest/v1/rpc/kiosk_punch");
    await tablet.getByRole("button", { name: /Tocca per continuare/ }).click();
  });

  await step("vista verticale senza scroll orizzontale", async () => {
    await tablet.setViewportSize({ width: 820, height: 1180 });
    await tablet.getByRole("button", { name: /Bruno/ }).click();
    await tablet.screenshot({ path: `${SHOTS}/24-tablet-verticale-pin.png` });
    assert.equal(await tablet.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await tablet.getByRole("button", { name: "Non sono io" }).click();
  });

  // il titolare, dal suo computer, vede il tablet e lo disattiva
  const owner = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await step("il titolare vede il tablet attivo e la dashboard operativa", async () => {
    await owner.goto(`${APP}/accedi`);
    await owner.getByLabel("Email").fill("aurora@panificio.it");
    await owner.getByLabel("Password").fill("segreta123");
    await owner.getByRole("button", { name: "Accedi" }).click();
    await owner.waitForURL(/\/app$/);
    // preparazione completata: la checklist lascia il posto a chi è al lavoro
    await owner.getByRole("heading", { name: /Al lavoro adesso/ }).waitFor();
    assert.equal(await owner.getByRole("heading", { name: "Prepara l'azienda per le timbrature" }).count(), 0);
    await owner.getByRole("link", { name: "Tablet" }).click();
    await owner.getByText("Bancone").waitFor();
    await owner.getByText(/Ultimo utilizzo:/).waitFor();
  });
  await owner.screenshot({ path: `${SHOTS}/25-tablet-gestione.png` });

  await step("tablet disattivato dal titolare: non timbra più", async () => {
    await owner.getByRole("button", { name: "Disattiva il tablet Bancone" }).click();
    await owner.getByRole("button", { name: "Sì, disattiva" }).click();
    await owner.getByText("Nessun tablet attivo.").waitFor();
    await tablet.reload();
    await tablet.getByRole("heading", { name: "Tablet disattivato" }).waitFor();
    const stored = await tablet.evaluate(() => localStorage.getItem("presenze.tablet"));
    assert.equal(stored, null, "token rimosso dal tablet");
  });

  await step("nessun errore JavaScript nel browser", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
