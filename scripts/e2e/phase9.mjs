// Test end-to-end: homepage pubblica.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "it-IT" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const loadAllImages = async (p) => {
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
  });
  await p.waitForFunction(() => [...document.images].filter((i) => i.offsetParent !== null).every((i) => i.complete && i.naturalWidth > 0));
};

try {
  await step("la radice mostra la homepage, non rimanda all'accesso", async () => {
    await page.goto(`${APP}/`);
    assert.equal(new URL(page.url()).pathname, "/");
    await page.getByRole("heading", { level: 1, name: "Il cartellino presenze, senza carta." }).waitFor();
    await page.getByText("da 0,33 € al giorno", { exact: false }).first().waitFor();
  });

  await step("schermate vere dell'app caricate", async () => {
    await loadAllImages(page);
    const n = await page.locator("main img").count();
    assert.ok(n >= 5, `immagini: ${n}`);
    for (const alt of await page.locator("main img").evaluateAll((els) => els.map((e) => e.getAttribute("alt")))) {
      assert.ok(alt && alt.length > 10, "ogni schermata ha un testo alternativo");
    }
  });
  await page.screenshot({ path: `${SHOTS}/97-home.png`, fullPage: true });

  await step("marchio ReBadge: logo, slogan, titolo e icona", async () => {
    await page.goto(`${APP}/`);
    assert.match(await page.title(), /^ReBadge · Timbra\. Controlla\. Invia\.$/);
    await page.getByRole("link", { name: "ReBadge, pagina iniziale" }).first().waitFor();
    await page.getByRole("heading", { name: "Timbra. Controlla. Invia." }).waitFor();
    const icon = await fetch(`${APP}/icon.svg`);
    assert.equal(icon.status, 200);
    assert.match(await icon.text(), /<svg/);
    for (const f of ["/brand/rebadge-logo.png", "/brand/icon-192.png", "/brand/icon-512.png", "/apple-icon.png"]) {
      assert.equal((await fetch(`${APP}${f}`)).status, 200, f);
    }
    const manifest = await (await fetch(`${APP}/manifest.webmanifest`)).json();
    assert.equal(manifest.name, "ReBadge — Timbratrice");
    await page.goto(`${APP}/accedi`);
    assert.match(await page.title(), /ReBadge/);
    await page.goto(`${APP}/`);
  });

  await step("come funziona: tre passaggi", async () => {
    await page.getByRole("link", { name: "Come funziona" }).click();
    await page.waitForURL(/#come-funziona$/);
    for (const t of ["Timbrano dal tablet", "Tu controlli, le ore si contano da sole", "A fine mese, mandi il report al consulente"]) {
      await page.getByRole("heading", { name: t }).waitFor();
    }
  });

  await step("prezzi dinamici con calcolatore", async () => {
    const plan = (id) => page.locator(`[data-plan="${id}"]`);
    await plan("base").getByText("9,99 €", { exact: true }).waitFor();
    await plan("plus").getByText("29,99 €", { exact: true }).waitFor();
    await page.getByLabel("Quanti dipendenti hai?").fill("40");
    await plan("custom").getByText("Adatto a te").waitFor();
    assert.equal(await plan("custom").getByRole("link", { name: "Richiedi un preventivo" }).getAttribute("href"), "/prezzi#personalizzato");
  });

  await step("inviti all'azione: registrazione e prezzi", async () => {
    await page.goto(`${APP}/`);
    await page.getByRole("link", { name: "Prova gratis 14 giorni" }).first().click();
    await page.waitForURL(/\/registrati$/);
    await page.goto(`${APP}/`);
    await page.getByRole("link", { name: "Vedi i prezzi" }).click();
    await page.waitForURL(/\/prezzi$/);
    await page.getByRole("link", { name: "ReBadge, pagina iniziale" }).first().click();
    await page.waitForURL((u) => new URL(u).pathname === "/");
    await page.getByRole("link", { name: "Crea l'account gratis" }).click();
    await page.waitForURL(/\/registrati$/);
  });

  await step("smartphone: homepage senza scroll orizzontale", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.goto(`${APP}/`);
    await loadAllImages(m);
    await m.screenshot({ path: `${SHOTS}/98-mobile-home.png`, fullPage: true });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.close();
  });

  await step("nessun errore JavaScript", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
