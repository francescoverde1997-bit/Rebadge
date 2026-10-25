// Test end-to-end Fase 2: gestione dipendenti e PIN.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const state = async () => (await fetch(`${FAKE}/__state`)).json();

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

try {
  await page.goto(`${APP}/registrati`);
  await page.getByLabel("Nome").fill("Officina Verdi");
  await page.getByLabel("Email").fill("titolare@officina.it");
  await page.getByLabel("Password").fill("segreta123");
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL(/\/app$/);

  await step("dalla dashboard si arriva ai dipendenti; senza dipendenti il form è già aperto", async () => {
    await page.getByRole("link", { name: "Aggiungi i dipendenti e il loro PIN" }).click();
    await page.waitForURL(/\/app\/dipendenti$/);
    await page.getByRole("heading", { name: "Nuovo dipendente" }).waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/10-dipendenti-vuoto.png` });

  await step("errori di validazione senza perdere quanto scritto", async () => {
    await page.getByLabel("Nome", { exact: true }).fill("Luca");
    await page.getByLabel("PIN per il tablet").fill("1234");
    await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
    await page.getByText("Inserisci il cognome").waitFor();
    await page.getByText("PIN troppo facile", { exact: false }).waitFor();
    assert.equal(await page.getByLabel("Nome", { exact: true }).inputValue(), "Luca");
    assert.equal((await state()).employees.length, 0);
  });

  await step("il PIN accetta solo cifre", async () => {
    await page.getByLabel("PIN per il tablet").fill("");
    await page.getByLabel("PIN per il tablet").pressSequentially("4a8b21");
    assert.equal(await page.getByLabel("PIN per il tablet").inputValue(), "4821");
  });

  await step("aggiunta dipendente con PIN", async () => {
    await page.getByLabel("Cognome").fill("Verdi");
    await page.getByLabel("Email (facoltativa)").fill("luca@officina.it");
    await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
    await page.getByText("Luca Verdi aggiunto", { exact: false }).waitFor();
    const s = await state();
    assert.equal(s.employees.length, 1);
    assert.equal(s.pins[s.employees[0].id], "4821");
    await page.getByRole("listitem").filter({ hasText: "Luca Verdi" }).getByText("PIN impostato").waitFor();
    // form svuotato per il prossimo
    assert.equal(await page.getByLabel("Nome", { exact: true }).inputValue(), "");
  });

  await step("secondo dipendente con PIN generato", async () => {
    await page.getByLabel("Nome", { exact: true }).fill("Sara");
    await page.getByLabel("Cognome").fill("Neri");
    await page.getByRole("button", { name: "Genera" }).click();
    const pin = await page.getByLabel("PIN per il tablet").inputValue();
    assert.match(pin, /^\d{4}$/);
    await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
    await page.getByText("Sara Neri aggiunto", { exact: false }).waitFor();
    const s = await state();
    assert.equal(s.pins[s.employees.find((e) => e.first_name === "Sara").id], pin);
  });

  await step("elenco in ordine di cognome", async () => {
    await page.reload();
    const names = await page.locator("ul > li p.font-semibold").allTextContents();
    assert.deepEqual(names, ["Sara Neri", "Luca Verdi"]);
  });
  await page.screenshot({ path: `${SHOTS}/11-dipendenti-elenco.png` });

  await step("modifica nome ed email", async () => {
    await page.getByRole("button", { name: "Modifica Luca Verdi" }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Luca Verdi" });
    await row.getByLabel("Cognome").fill("");
    await row.getByRole("button", { name: "Salva modifiche" }).click();
    await row.getByText("Inserisci il cognome").waitFor();
    await row.getByLabel("Cognome").fill("Verdi Rossi");
    await row.getByLabel("Email (facoltativa)").fill("");
    await row.getByRole("button", { name: "Salva modifiche" }).click();
    await page.getByText("Luca Verdi Rossi").waitFor();
    const e = (await state()).employees.find((x) => x.first_name === "Luca");
    assert.equal(e.last_name, "Verdi Rossi");
    assert.equal(e.email, null);
  });

  await step("cambio PIN", async () => {
    await page.getByRole("button", { name: "Cambia PIN di Luca Verdi Rossi" }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Luca Verdi Rossi" });
    await row.getByLabel("Nuovo PIN").fill("0000");
    await row.getByRole("button", { name: "Salva PIN" }).click();
    await row.getByText("PIN troppo facile", { exact: false }).waitFor();
    await row.getByLabel("Nuovo PIN").fill("736291");
    await row.getByRole("button", { name: "Salva PIN" }).click();
    await page.getByText("PIN aggiornato", { exact: false }).waitFor();
    const s = await state();
    assert.equal(s.pins[s.employees.find((x) => x.first_name === "Luca").id], "736291");
  });

  await step("disattiva e riattiva", async () => {
    await page.getByRole("button", { name: "Disattiva Sara Neri" }).click();
    await page.getByText("Disattivati (1)").waitFor();
    assert.equal((await state()).employees.find((x) => x.first_name === "Sara").active, false);
    await page.getByText("Disattivati (1)").click();
    await page.screenshot({ path: `${SHOTS}/12-dipendenti-disattivati.png` });
    await page.getByRole("button", { name: "Riattiva Sara Neri" }).click();
    await page.getByText("Disattivati (1)").waitFor({ state: "detached" });
    assert.equal((await state()).employees.find((x) => x.first_name === "Sara").active, true);
  });

  await step("la dashboard passa al passo successivo: il tablet", async () => {
    await page.getByRole("link", { name: "Oggi" }).click();
    await page.waitForURL(/\/app$/);
    await page.getByRole("link", { name: "Attiva il tablet per le timbrature" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Aggiungi i dipendenti e il loro PIN" }).count(), 0);
  });

  await step("vista smartphone senza scroll orizzontale", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.context().addCookies(await page.context().cookies());
    await m.goto(`${APP}/app/dipendenti`);
    await m.getByRole("button", { name: "Cambia PIN di Sara Neri" }).click();
    await m.screenshot({ path: `${SHOTS}/13-mobile-dipendenti.png`, fullPage: true });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.close();
  });

  await step("nessun errore JavaScript nel browser", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
