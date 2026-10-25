// Test end-to-end: micro-animazioni rapide e rispetto di "riduci movimento".
import { chromium } from "playwright";
import assert from "node:assert/strict";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}
const ms = (v) => Math.max(...v.split(",").map((x) => parseFloat(x) * (x.trim().endsWith("ms") ? 1 : 1000)));

const browser = await chromium.launch();
try {
  await step("durate tra 150 e 250 ms su pulsanti, schede e cambi di prezzo", async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(`${APP}/prezzi`);
    const btn = await p.getByRole("button", { name: "Al giorno" }).evaluate((el) => getComputedStyle(el).transitionDuration);
    assert.equal(ms(btn), 150);
    const card = await p.locator('[data-plan="plus"]').evaluate((el) => getComputedStyle(el).transitionDuration);
    assert.ok(ms(card) >= 150 && ms(card) <= 250, `scheda: ${card}`);
    await p.getByRole("button", { name: "Al giorno" }).click();
    const price = await p.locator('[data-plan="base"] .price-in').evaluate((el) => getComputedStyle(el).animationDuration);
    assert.ok(ms(price) >= 150 && ms(price) <= 250, `prezzo: ${price}`);
    await p.close();
  });

  await step("riduci movimento: nessuna animazione, tutto visibile e utilizzabile", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.goto(`${APP}/prezzi`);
    await p.getByRole("button", { name: "Al giorno" }).click();
    const s = await p.locator('[data-plan="base"] .price-in').evaluate((el) => ({ a: getComputedStyle(el).animationName, o: getComputedStyle(el).opacity }));
    assert.deepEqual(s, { a: "none", o: "1" });
    const t = await p.getByRole("button", { name: "Al mese" }).evaluate((el) => getComputedStyle(el).transitionDuration);
    assert.equal(ms(t), 0);
    assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "auto");
    // la richiesta di preventivo funziona e la conferma è visibile, con la spunta già disegnata
    const f = p.locator("#personalizzato form");
    await f.getByLabel("Azienda").fill("Hotel Calmo");
    await f.getByLabel("Il tuo nome").fill("Rita Piano");
    await f.getByLabel("Email").fill("rita@calmo.it");
    await f.getByLabel("Dipendenti").selectOption("31-50");
    await f.getByRole("button", { name: "Richiedi un preventivo" }).click();
    await p.getByText("Richiesta inviata").waitFor();
    assert.equal(await p.getByText("Richiesta inviata").evaluate((el) => getComputedStyle(el.parentElement).opacity), "1");
    await ctx.close();
  });
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
