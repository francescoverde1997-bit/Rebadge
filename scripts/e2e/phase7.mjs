// Test end-to-end Fase 7: abbonamento con Stripe (simulato).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const STRIPE = process.env.FAKE_STRIPE_URL ?? "http://localhost:54500";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const state = async () => (await fetch(`${FAKE}/__state`)).json();
const stripeState = async () => (await fetch(`${STRIPE}/__state`)).json();
const company = async () => (await state()).companies.at(-1);

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}

await fetch(`${FAKE}/__reset`);
await fetch(`${STRIPE}/__reset`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "it-IT" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => { if (page.url().startsWith(APP)) errors.push(e.message); });

let pin = 4820;
async function addEmployee(first, expectOk = true) {
  await page.goto(`${APP}/app/dipendenti`);
  if (!(await page.getByRole("heading", { name: "Nuovo dipendente" }).isVisible())) {
    await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
  }
  await page.getByLabel("Nome", { exact: true }).fill(first);
  await page.getByLabel("Cognome").fill("Prova");
  await page.getByLabel("PIN per il tablet").fill(String(++pin * 7).slice(0, 4).replace(/^(\d)\1{3}$/, "5813"));
  await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
  if (expectOk) await page.getByText(`${first} Prova aggiunto`, { exact: false }).waitFor();
}

try {
  await page.goto(`${APP}/registrati`);
  await page.getByLabel("Nome").fill("Enoteca Vigna");
  await page.getByLabel("Email").fill("vigna@enoteca.it");
  await page.getByLabel("Password").fill("segreta123");
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL(/\/app$/);
  for (const n of ["Anna", "Bruno"]) await addEmployee(n);

  await step("in prova: stato, piano adatto ai dipendenti e prezzi", async () => {
    await page.getByRole("link", { name: /Prova gratuita: 14 giorni/ }).click();
    await page.waitForURL(/\/app\/abbonamento/);
    await page.getByText("Prova gratuita: 14 giorni rimasti").waitFor();
    await page.getByText("Hai 2 dipendenti attivi: il piano adatto è", { exact: false }).waitFor();
    const plan = (id) => page.locator(`[data-plan="${id}"]`);
    // all'apertura: prezzo al giorno in primo piano, come equivalente del mensile
    assert.equal(await page.getByRole("button", { name: "Al giorno" }).getAttribute("aria-pressed"), "true");
    await plan("base").getByText("0,33 €", { exact: true }).waitFor();
    await plan("base").getByText("Equivale a 9,99 € al mese + IVA · fatturazione mensile").waitFor();
    await plan("base").getByText("Adatto a te").waitFor();
    await plan("plus").getByText("0,99 €", { exact: true }).waitFor();
    await plan("plus").getByText("Equivale a 29,99 € al mese + IVA · fatturazione mensile").waitFor();
    await plan("custom").getByText("Su misura", { exact: true }).waitFor();
    await plan("custom").getByText("Da sviluppare, cucito per te").waitFor();
    assert.equal(await page.locator('[data-plan="pro"]').count(), 0);
    // si può passare al mensile
    await page.getByRole("button", { name: "Al mese" }).click();
    assert.equal(await page.getByRole("button", { name: "Al mese" }).getAttribute("aria-pressed"), "true");
    await plan("base").getByText("9,99 €", { exact: true }).waitFor();
    await plan("base").getByText("0,33 € al giorno").waitFor();
    await plan("plus").getByText("29,99 €", { exact: true }).waitFor();
  });

  await step("richiesta Personalizzato dall'app: dati dell'azienda già compilati", async () => {
    const form = page.locator("#personalizzato");
    assert.equal(await form.getByLabel("Azienda").inputValue(), "Enoteca Vigna");
    assert.equal(await form.getByLabel("Email").inputValue(), "vigna@enoteca.it");
    await form.getByRole("button", { name: "Richiedi un preventivo" }).click();
    await form.getByText("Scrivi il tuo nome").waitFor();
    await form.getByText("Scegli quanti dipendenti avete").waitFor();
    await form.getByLabel("Il tuo nome").fill("Vera Vigna");
    await form.getByLabel("Dipendenti").selectOption("31-50");
    await form.getByLabel("Sedi").fill("2");
    await form.getByRole("button", { name: "Richiedi un preventivo" }).click();
    await form.getByText("Richiesta inviata").waitFor();
    const r = (await state()).customRequests.at(-1);
    assert.deepEqual([r.company_name, r.contact_name, r.email, r.employees_range, r.locations, Boolean(r.company_id)],
      ["Enoteca Vigna", "Vera Vigna", "vigna@enoteca.it", "31-50", 2, true]);
  });
  await page.screenshot({ path: `${SHOTS}/90-abbonamento-prova.png`, fullPage: true });

  await step("attivazione: Checkout di Stripe con il piano Base, ritorno con abbonamento attivo", async () => {
    await page.getByRole("button", { name: "Attiva il piano" }).click();
    await page.waitForURL(new RegExp(`^${STRIPE}/checkout/`));
    await page.getByText("price_base").waitFor();
    await page.getByRole("button", { name: "Paga" }).click();
    await page.waitForURL(/\/app\/abbonamento\?esito=ok/);
    await page.getByText("Piano Base attivo").waitFor();
    await page.getByText("Abbonamento attivo. Grazie!").waitFor();
    const c = await company();
    assert.deepEqual([c.plan, c.plan_status, Boolean(c.stripe_customer_id), Boolean(c.stripe_subscription_id)], ["base", "active", true, true]);
    assert.ok((await stripeState()).events.every((e) => e.status === 200), "webhook accettati (firma valida)");
    await page.getByRole("link", { name: "Piano Base" }).waitFor(); // intestazione
  });
  await page.screenshot({ path: `${SHOTS}/91-abbonamento-attivo.png`, fullPage: true });

  await step("webhook con firma falsa rifiutato", async () => {
    const r = await fetch(`${APP}/api/stripe/webhook`, {
      method: "POST", body: JSON.stringify({ type: "customer.subscription.updated" }), headers: { "stripe-signature": "t=1,v1=falsa" },
    });
    assert.equal(r.status, 400);
  });

  await step("piano Base: massimo 5 dipendenti attivi, messaggio chiaro al sesto", async () => {
    for (const n of ["Carla", "Dario", "Elisa"]) await addEmployee(n);
    await addEmployee("Fabio", false);
    await page.getByText("numero massimo di dipendenti attivi del tuo piano", { exact: false }).waitFor();
    assert.equal((await state()).employees.filter((e) => e.active).length, 5);
  });

  await step("cambio a Plus: Stripe aggiornato, sesto dipendente ammesso", async () => {
    await page.goto(`${APP}/app/abbonamento`);
    await page.getByRole("button", { name: "Passa a Plus" }).click();
    await page.getByText("Piano cambiato: ora hai il piano Plus").waitFor();
    assert.equal((await company()).plan, "plus");
    assert.equal((await stripeState()).subscriptions[0].items.data[0].price.id, "price_plus");
    await addEmployee("Fabio");
  });

  await step("tornare a Base non è possibile con 6 dipendenti attivi", async () => {
    await page.goto(`${APP}/app/abbonamento`);
    await page.getByText("Hai 6 dipendenti attivi: troppi per questo piano.").waitFor();
  });

  // tablet attivato da un secondo dispositivo, per verificare la sospensione
  const tabletCtx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const tablet = await tabletCtx.newPage();
  await tablet.goto(`${APP}/accedi`);
  await tablet.getByLabel("Email").fill("vigna@enoteca.it");
  await tablet.getByLabel("Password").fill("segreta123");
  await tablet.getByRole("button", { name: "Accedi" }).click();
  await tablet.waitForURL(/\/app$/);
  await tablet.goto(`${APP}/app/tablet`);
  await tablet.getByRole("button", { name: "Attiva questo tablet" }).click();
  await tablet.getByRole("button", { name: "Attiva e apri la timbratrice" }).click();
  await tablet.getByRole("heading", { name: "Tocca il tuo nome" }).waitFor();

  await step("portale: disdetta a fine periodo, servizio ancora attivo", async () => {
    await page.getByRole("button", { name: "Pagamenti, fatture e disdetta" }).click();
    await page.waitForURL(new RegExp(`^${STRIPE}/portal/`));
    await page.getByRole("button", { name: "Disdici a fine periodo" }).click();
    await page.getByText("disdetto a fine periodo").waitFor();
    await page.getByRole("link", { name: "Torna all'app" }).click();
    await page.getByText(/Abbonamento disdetto: resta attivo fino al/).waitFor();
    await page.goto(`${APP}/app/presenze`);
    await page.waitForURL(/\/app\/presenze/);
  });

  await step("pagamento non riuscito: avviso, servizio non bloccato", async () => {
    await page.goto(`${APP}/app/abbonamento`);
    await page.getByRole("button", { name: "Pagamenti, fatture e disdetta" }).click();
    await page.getByRole("button", { name: "Simula pagamento non riuscito" }).click();
    await page.getByRole("link", { name: "Torna all'app" }).click();
    await page.getByText("Pagamento non riuscito", { exact: true }).first().waitFor();
    await page.goto(`${APP}/app/dipendenti`);
    await page.waitForURL(/\/app\/dipendenti/);
  });

  await step("abbonamento terminato: app sospesa, report sempre scaricabili", async () => {
    await page.goto(`${APP}/app/abbonamento`);
    await page.getByRole("button", { name: "Pagamenti, fatture e disdetta" }).click();
    await page.getByRole("button", { name: "Termina subito l'abbonamento" }).click();
    await page.getByRole("link", { name: "Torna all'app" }).click();
    await page.getByText("Abbonamento terminato").waitFor();
    assert.equal((await company()).plan_status, "canceled");
    await page.goto(`${APP}/app/dipendenti`);
    await page.waitForURL(/\/app\/abbonamento\?motivo=scaduto/);
    await page.getByText("Il servizio è sospeso", { exact: false }).waitFor();
    await page.goto(`${APP}/app/report`);
    await page.waitForURL(/\/app\/report/);
    await page.getByRole("link", { name: "Scarica Excel" }).waitFor();
    await page.getByRole("link", { name: "Servizio sospeso" }).waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/92-abbonamento-terminato.png`, fullPage: true });

  await step("tablet sospeso senza perdere l'attivazione, riparte al rinnovo", async () => {
    await tablet.reload();
    await tablet.getByRole("heading", { name: "Servizio sospeso" }).waitFor();
    assert.ok(await tablet.evaluate(() => localStorage.getItem("presenze.tablet")), "token conservato");
    await tablet.screenshot({ path: `${SHOTS}/93-tablet-sospeso.png` });
    // riattivazione
    await page.goto(`${APP}/app/abbonamento`);
    await page.getByRole("button", { name: "Riattiva il piano" }).click();
    await page.getByText("price_plus").waitFor(); // 6 dipendenti → Plus
    await page.getByRole("button", { name: "Paga" }).click();
    await page.getByText("Piano Plus attivo").waitFor();
    await tablet.reload();
    await tablet.getByRole("heading", { name: "Tocca il tuo nome" }).waitFor();
  });
  await tabletCtx.close();

  await step("prova scaduta senza abbonamento: sospeso e invito ad attivare", async () => {
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await c2.newPage();
    await p2.goto(`${APP}/registrati`);
    await p2.getByLabel("Nome").fill("Panetteria Fine Prova");
    await p2.getByLabel("Email").fill("fine@prova.it");
    await p2.getByLabel("Password").fill("segreta123");
    await p2.getByRole("button", { name: "Crea account" }).click();
    await p2.waitForURL(/\/app$/);
    await fetch(`${FAKE}/__company`, { method: "POST", body: JSON.stringify({ trial_ends_at: new Date(Date.now() - 86400000).toISOString() }) });
    await p2.goto(`${APP}/app`);
    await p2.waitForURL(/\/app\/abbonamento\?motivo=scaduto/);
    await p2.getByText("La prova gratuita è terminata").waitFor();
    await p2.getByRole("button", { name: "Attiva il piano" }).waitFor();
    await c2.close();
  });

  await step("smartphone: pagina Abbonamento senza scroll orizzontale", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.context().addCookies(await ctx.cookies());
    await m.goto(`${APP}/app/abbonamento`);
    await m.screenshot({ path: `${SHOTS}/94-mobile-abbonamento.png`, fullPage: true });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.close();
  });

  await step("nessun errore JavaScript nell'app", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
