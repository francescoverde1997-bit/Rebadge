// Test end-to-end Fase B: intestazioni di sicurezza, pagina 404 in italiano,
// webhook Stripe che rilegge l'abbonamento (eventi fuori ordine), nessun secondo abbonamento.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import Stripe from "stripe";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const STRIPE = process.env.FAKE_STRIPE_URL ?? "http://localhost:54500";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_fake";

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}
const company = async () => (await (await fetch(`${FAKE}/__state`)).json()).companies.at(-1);
const stripeState = async () => (await fetch(`${STRIPE}/__state`)).json();

await fetch(`${FAKE}/__reset`);
await fetch(`${STRIPE}/__reset`);
const browser = await chromium.launch();
try {
  await step("intestazioni di sicurezza su pagine pubbliche e area riservata", async () => {
    for (const path of ["/", "/accedi", "/app", "/timbra"]) {
      const r = await fetch(`${APP}${path}`, { redirect: "manual" });
      assert.equal(r.headers.get("x-frame-options"), "DENY", path);
      assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'none'", path);
      assert.equal(r.headers.get("x-content-type-options"), "nosniff", path);
      assert.match(r.headers.get("permissions-policy") ?? "", /geolocation=\(\)/, path);
      assert.equal(r.headers.get("x-powered-by"), null, path);
    }
  });

  await step("telefoni stretti (320 px): intestazione pubblica senza scorrimento orizzontale", async () => {
    const small = await browser.newPage({ viewport: { width: 320, height: 700 } });
    for (const path of ["/", "/prezzi"]) {
      await small.goto(`${APP}${path}`);
      assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= 320), `scroll orizzontale su ${path}`);
      const btn = small.getByRole("banner").getByRole("link", { name: "Prova gratis" });
      assert.ok((await btn.boundingBox()).x + (await btn.boundingBox()).width <= 320, `"Prova gratis" fuori schermo su ${path}`);
    }
    await small.close();
  });

  await step("homepage: \"Guarda come funziona\" apre il video, che parte con l'audio e si ferma alla chiusura", async () => {
    const home = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const videoReqs = []; home.on("request", (r) => r.url().endsWith(".mp4") && videoReqs.push(r.url()));
    await home.goto(`${APP}/`, { waitUntil: "networkidle" });
    assert.equal(videoReqs.length, 0, "il video non si scarica prima del clic");
    await home.getByRole("button", { name: /Guarda come funziona/ }).click();
    const dialog = home.getByRole("dialog", { name: "Video: come funziona ReBadge" });
    await dialog.waitFor();
    await home.waitForFunction(() => document.querySelector("dialog video").currentTime > 0.5, null, { timeout: 15000 });
    assert.equal(await home.evaluate(() => document.querySelector("dialog video").muted), false);
    await home.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await home.waitForFunction(() => document.querySelector("dialog video").paused, null, { timeout: 2000 });
    // Safari e iPhone chiedono il video a pezzi (Range): il server deve rispondere 206
    const r = await fetch(`${APP}/video/rebadge-presentazione.mp4`, { headers: { Range: "bytes=0-1023" } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("content-type"), "video/mp4");
    await home.close();
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "it-IT" });

  await step("pagina inesistente: 404 in italiano con le strade per tornare", async () => {
    const r = await page.goto(`${APP}/pagina-che-non-esiste`);
    assert.equal(r.status(), 404);
    await page.getByRole("heading", { name: "Pagina non trovata" }).waitFor();
    await page.getByRole("link", { name: "Vai alla tua azienda" }).waitFor();
    assert.equal(await page.getByText("This page could not be found").count(), 0);
  });

  // un'azienda con abbonamento Base attivo
  await page.goto(`${APP}/registrati`);
  await page.getByLabel("Nome").fill("Ottica Fase B");
  await page.getByLabel("Email").fill("faseb@ottica.it");
  await page.getByLabel("Password").fill("segreta123");
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL(/\/app$/);
  await page.goto(`${APP}/app/abbonamento`);
  await page.getByRole("button", { name: "Attiva il piano" }).click();
  await page.waitForURL(new RegExp(`^${STRIPE}/checkout/`));
  await page.getByRole("button", { name: "Paga" }).click();
  await page.waitForURL(/\/app\/abbonamento\?esito=ok/);
  await page.getByText("Abbonamento attivo. Grazie!").waitFor();

  await step("webhook arrivato in ritardo: vince lo stato attuale di Stripe", async () => {
    const sub = (await stripeState()).subscriptions.at(-1);
    // un vecchio evento "annullato" consegnato dopo: l'app rilegge l'abbonamento e resta attiva
    const payload = JSON.stringify({
      id: "evt_vecchio", object: "event", type: "customer.subscription.updated", created: 1, livemode: false,
      data: { object: { ...sub, status: "canceled" } },
    });
    const header = new Stripe("sk_test_fake").webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const r = await fetch(`${APP}/api/stripe/webhook`, { method: "POST", body: payload, headers: { "content-type": "application/json", "stripe-signature": header } });
    assert.equal(r.status, 200);
    assert.equal((await company()).plan_status, "active");
  });

  await step("nessun secondo abbonamento se Stripe ne ha già uno attivo", async () => {
    // come se il webhook non fosse ancora arrivato: l'app crede di essere in prova e mostra di nuovo "Attiva il piano"
    await fetch(`${FAKE}/__company`, { method: "POST", body: JSON.stringify({ plan_status: "trialing", stripe_subscription_id: null, plan: null }) });
    await page.goto(`${APP}/app/abbonamento`);
    await page.getByRole("button", { name: "Attiva il piano" }).click();
    await page.getByText("Hai già un abbonamento attivo", { exact: false }).waitFor();
    assert.ok(page.url().startsWith(APP), "nessun nuovo Checkout aperto");
    assert.equal((await stripeState()).subscriptions.length, 1);
  });
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
