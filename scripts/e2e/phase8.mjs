// Test end-to-end: pagina pubblica Prezzi e richiesta del piano Personalizzato.
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "it-IT" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const plan = (id) => page.locator(`[data-plan="${id}"]`);

try {
  await step("pagina Prezzi pubblica, raggiungibile da Accedi", async () => {
    await page.goto(`${APP}/accedi`);
    await page.getByRole("link", { name: "Vedi piani e prezzi" }).click();
    await page.waitForURL(/\/prezzi$/);
    await page.getByRole("heading", { name: /da 0,33 € al giorno/ }).waitFor();
    await plan("base").getByText("9,99 €", { exact: true }).waitFor();
    await plan("plus").getByText("29,99 €", { exact: true }).waitFor();
    await plan("base").getByText("Adatto a te").waitFor(); // 4 dipendenti di partenza
  });
  await page.screenshot({ path: `${SHOTS}/95-prezzi.png`, fullPage: true });

  await step("calcolatore: il piano si aggiorna con il numero di dipendenti", async () => {
    const slider = page.getByLabel("Quanti dipendenti hai?");
    await slider.fill("12");
    await plan("plus").getByText("Adatto a te").waitFor();
    await page.getByText("circa 9 centesimi al giorno a dipendente", { exact: false }).waitFor();
    assert.equal(await plan("base").getByText("Adatto a te").count(), 0);
    await slider.fill("45");
    await plan("custom").getByText("Adatto a te").waitFor();
    await page.getByText("Oltre 30 dipendenti: piano Personalizzato", { exact: false }).waitFor();
  });

  await step("prezzo al giorno", async () => {
    await page.getByRole("button", { name: "Al giorno" }).click();
    await plan("base").getByText("0,33 €", { exact: true }).waitFor();
    await plan("base").getByText("al giorno", { exact: true }).waitFor();
    await plan("base").getByText("Equivale a 9,99 € al mese + IVA · fatturazione mensile").waitFor();
    assert.equal(await page.getByRole("button", { name: "Al giorno" }).getAttribute("aria-pressed"), "true");
  });

  await step("prova gratuita porta alla registrazione", async () => {
    assert.equal(await plan("plus").getByRole("link", { name: "Prova gratis 14 giorni" }).getAttribute("href"), "/registrati");
  });

  await step("richiesta di preventivo da visitatore non registrato", async () => {
    await plan("custom").getByRole("link", { name: "Richiedi un preventivo" }).click();
    const form = page.locator("#personalizzato form");
    await form.getByLabel("Azienda").fill("Hotel Bellavista");
    await form.getByLabel("Il tuo nome").fill("Giulia Bianchi");
    await form.getByLabel("Email").fill("giulia@bellavista");
    await form.getByLabel("Dipendenti").selectOption("51-100");
    await form.getByLabel("Di cosa avete bisogno?").fill("Tre reparti, turni notturni");
    await form.getByRole("button", { name: "Richiedi un preventivo" }).click();
    await form.getByText("Email non valida").waitFor();
    await form.getByLabel("Email").fill("giulia@bellavista.it");
    await form.getByRole("button", { name: "Richiedi un preventivo" }).click();
    await page.getByText("Richiesta inviata").waitFor();
    const r = (await state()).customRequests.at(-1);
    assert.deepEqual([r.company_name, r.email, r.employees_range, r.message, r.company_id],
      ["Hotel Bellavista", "giulia@bellavista.it", "51-100", "Tre reparti, turni notturni", null]);
  });

  await step("campo trappola: i bot non salvano nulla", async () => {
    const before = (await state()).customRequests.length;
    await page.goto(`${APP}/prezzi`);
    const form = page.locator("#personalizzato form");
    await form.locator('input[name="website"]').fill("http://spam", { force: true });
    await form.getByLabel("Azienda").fill("Spam Srl");
    await form.getByLabel("Il tuo nome").fill("Bot Bot");
    await form.getByLabel("Email").fill("bot@spam.it");
    await form.getByLabel("Dipendenti").selectOption("31-50");
    await form.getByRole("button", { name: "Richiedi un preventivo" }).click();
    await page.getByText("Richiesta inviata").waitFor();
    assert.equal((await state()).customRequests.length, before);
  });

  await step("smartphone: Prezzi senza scroll orizzontale", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.goto(`${APP}/prezzi`);
    await m.screenshot({ path: `${SHOTS}/96-mobile-prezzi.png`, fullPage: true });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.close();
  });

  await step("nessun errore JavaScript", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
