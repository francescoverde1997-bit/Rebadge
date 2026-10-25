// Test end-to-end Fase 1: registrazione → dashboard → impostazioni → logout → login.
// Uso: npm run e2e (avvia da solo il finto Supabase e l'app).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

// Logo di prova: PNG 1x1 blu
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPpfDwAE3gIRw3wB8wAAAABJRU5ErkJggg==", "base64");
writeFileSync(`${SHOTS}/logo.png`, PNG);

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}

await fetch(`${FAKE}/__reset`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "it-IT" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  await step("utente non collegato viene mandato all'accesso", async () => {
    await page.goto(`${APP}/app`);
    await page.waitForURL(/\/accedi$/);
  });
  await page.screenshot({ path: `${SHOTS}/01-accedi.png` });

  await step("la registrazione mostra gli errori di validazione", async () => {
    await page.goto(`${APP}/registrati`);
    await page.getByRole("button", { name: "Crea account" }).click();
    await page.getByText("Inserisci il nome").waitFor();
    await page.getByText("Inserisci un'email valida").waitFor();
    await page.getByText("almeno 8 caratteri", { exact: false }).first().waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/02-registrati-errori.png` });

  await step("registrazione con Nome, Email, Password porta alla dashboard col nome azienda", async () => {
    await page.getByLabel("Nome").fill("Bar Centrale");
    await page.getByLabel("Email").fill("mario@barcentrale.it");
    await page.getByLabel("Password").fill("segreta123");
    await page.getByRole("button", { name: "Crea account" }).click();
    await page.waitForURL(/\/app$/);
    assert.equal((await page.getByRole("heading", { level: 1 }).textContent()).trim(), "Bar Centrale");
    await page.getByText("Prova gratuita: 14 giorni").waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/03-dashboard.png` });

  await step("utente collegato che apre /accedi torna alla dashboard", async () => {
    await page.goto(`${APP}/accedi`);
    await page.waitForURL(/\/app$/);
  });

  await step("il titolare cambia il nome e la dashboard si aggiorna", async () => {
    await page.goto(`${APP}/app/impostazioni`);
    const name = page.locator("#nome").getByLabel("Nome");
    await name.fill("");
    await page.getByRole("button", { name: "Salva nome" }).click();
    await page.locator("#nome").getByText("Inserisci il nome").waitFor();
    assert.equal(await name.inputValue(), "", "dopo l'errore il campo non deve tornare al vecchio valore");
    await name.fill("Bar Centrale di Mario");
    await page.getByRole("button", { name: "Salva nome" }).click();
    await page.getByText("Nome salvato").waitFor();
    await page.getByRole("heading", { level: 1, name: "Bar Centrale di Mario" }).waitFor();
  });

  await step("il titolare carica il logo e compare nell'intestazione", async () => {
    await page.locator("#f-logo").setInputFiles(`${SHOTS}/logo.png`);
    await page.getByRole("button", { name: "Carica logo" }).click();
    await page.getByText("Logo aggiornato").waitFor();
    await page.locator("header img").waitFor();
    const loaded = await page.locator("header img").evaluate((img) => img.complete && img.naturalWidth > 0);
    assert.ok(loaded, "il logo nell'intestazione non si carica");
    const state = await (await fetch(`${FAKE}/__state`)).json();
    assert.equal(state.files.length, 1);
    assert.match(state.companies[0].logo_path, new RegExp(`^${state.companies[0].id}/logo-\\d+\\.png$`));
  });

  await step("un file non ammesso viene rifiutato", async () => {
    writeFileSync(`${SHOTS}/logo.pdf`, "%PDF-1.4");
    await page.locator("#f-logo").setInputFiles(`${SHOTS}/logo.pdf`);
    await page.getByRole("button", { name: "Carica logo" }).click();
    await page.getByText("Formato non supportato", { exact: false }).waitFor();
  });

  await step("le regole ore si salvano convertite in minuti", async () => {
    await page.reload();
    await page.getByLabel("Arrotondamento di entrata e uscita").selectOption("15");
    await page.getByLabel("Detrarre una pausa quando non viene timbrata?").selectOption("30");
    await page.getByLabel("Detrai la pausa nei giorni con almeno (ore)").fill("6");
    await page.getByLabel("Straordinario oltre (ore al giorno)").fill("7.5");
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.getByText("Regole salvate", { exact: false }).waitFor();
    const s = (await (await fetch(`${FAKE}/__state`)).json()).settings[0];
    assert.equal(s.rounding_minutes, 15);
    assert.equal(s.auto_break_minutes, 30);
    assert.equal(s.auto_break_after_minutes, 360);
    assert.equal(s.daily_overtime_after_minutes, 450);
  });
  await page.screenshot({ path: `${SHOTS}/04-impostazioni.png`, fullPage: true });

  await step("i valori fuori limite vengono rifiutati", async () => {
    await page.getByLabel("Turno massimo (ore)").fill("30");
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.locator("#regole").getByText(/massimo|less than|<=|24/i).first().waitFor();
    assert.equal(await page.getByLabel("Turno massimo (ore)").inputValue(), "30", "il valore inserito resta visibile");
    assert.equal(await page.getByLabel("Arrotondamento di entrata e uscita").inputValue(), "15");
  });

  await step("esci e accedi: password errata respinta, corretta accettata", async () => {
    await page.goto(`${APP}/app`);
    await page.getByRole("button", { name: "Esci" }).click();
    await page.waitForURL(/\/accedi$/);
    await page.getByLabel("Email").fill("mario@barcentrale.it");
    await page.getByLabel("Password").fill("sbagliata1");
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.getByText("Email o password non corretti").waitFor();
    await page.getByLabel("Password").fill("segreta123");
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL(/\/app$/);
    await page.getByRole("heading", { level: 1, name: "Bar Centrale di Mario" }).waitFor();
  });

  await step("registrazione con email già usata dà un messaggio chiaro", async () => {
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(`${APP}/registrati`);
    await p2.getByLabel("Nome").fill("Altro");
    await p2.getByLabel("Email").fill("mario@barcentrale.it");
    await p2.getByLabel("Password").fill("segreta123");
    await p2.getByRole("button", { name: "Crea account" }).click();
    await p2.getByText("Esiste già un account", { exact: false }).waitFor();
    await ctx.close();
  });

  await step("vista smartphone", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.context().addCookies(await page.context().cookies());
    await m.goto(`${APP}/app/impostazioni`);
    await m.screenshot({ path: `${SHOTS}/05-mobile-impostazioni.png` });
    await m.goto(`${APP}/app`);
    await m.screenshot({ path: `${SHOTS}/06-mobile-dashboard.png` });
    const truncated = await m.locator("header h1").evaluate((h) => h.scrollWidth > h.clientWidth);
    assert.equal(truncated, false, "nome azienda troncato su mobile");
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, "scroll orizzontale su mobile");
    await m.close();
  });

  await step("nessun errore JavaScript nel browser", async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
