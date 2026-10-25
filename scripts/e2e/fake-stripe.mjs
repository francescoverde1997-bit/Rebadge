// Stripe simulato, SOLO per test e demo in locale.
// Implementa le poche API usate dall'app (clienti, Checkout, abbonamenti, portale) e invia
// all'app i webhook firmati con lo stesso segreto, come farebbe Stripe.
import http from "node:http";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";

const PORT = Number(process.env.FAKE_STRIPE_PORT ?? 54500);
const BASE = `http://localhost:${PORT}`;
const WEBHOOK_URL = process.env.APP_WEBHOOK_URL ?? "http://localhost:3100/api/stripe/webhook";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_fake";
const stripe = new Stripe("sk_test_fake");

const customers = new Map();
const sessions = new Map();
const subscriptions = new Map();
const events = [];
const id = (p) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 14)}`;

/** Corpo application/x-www-form-urlencoded con chiavi annidate (a[b][0][c]=1) → oggetto */
function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) o[part] = v;
      else o = o[part] ??= {};
    });
  }
  return out;
}

async function webhook(type, object) {
  const payload = JSON.stringify({ id: id("evt"), object: "event", type, data: { object }, created: Math.floor(Date.now() / 1000), livemode: false });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  const res = await fetch(WEBHOOK_URL, { method: "POST", body: payload, headers: { "content-type": "application/json", "stripe-signature": header } });
  events.push({ type, status: res.status });
}

function subscriptionObject(s) {
  return {
    id: s.id, object: "subscription", customer: s.customer, status: s.status, metadata: s.metadata,
    cancel_at_period_end: s.cancel_at_period_end,
    items: { object: "list", data: [{ id: s.itemId, object: "subscription_item", price: { id: s.price, object: "price" }, current_period_end: s.periodEnd }] },
  };
}

const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const html = (res, body) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="it"><meta charset="utf-8"><title>Stripe simulato</title>
<body style="font-family:system-ui;max-width:520px;margin:48px auto;padding:0 16px;color:#1b2b44">
<p style="background:#635bff;color:#fff;padding:6px 10px;border-radius:6px;display:inline-block">Stripe simulato (test)</p>${body}</body></html>`);
};
const readBody = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c).toString())); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  const body = await readBody(req);
  const form = parseForm(body);
  let m;

  if (p === "/__reset") { customers.clear(); sessions.clear(); subscriptions.clear(); events.length = 0; return json(res, 200, {}); }
  if (p === "/__state") return json(res, 200, { customers: [...customers.values()], subscriptions: [...subscriptions.values()].map(subscriptionObject), events });

  // ----- API -----
  if (p === "/v1/customers" && req.method === "POST") {
    const c = { id: id("cus"), object: "customer", email: form.email, name: form.name, metadata: form.metadata ?? {} };
    customers.set(c.id, c);
    return json(res, 200, c);
  }
  if (p === "/v1/checkout/sessions" && req.method === "POST") {
    const s = {
      id: id("cs"), object: "checkout.session", mode: form.mode, customer: form.customer,
      client_reference_id: form.client_reference_id, price: form.line_items["0"].price,
      metadata: form.subscription_data?.metadata ?? {}, success_url: form.success_url, cancel_url: form.cancel_url,
    };
    s.url = `${BASE}/checkout/${s.id}`;
    sessions.set(s.id, s);
    return json(res, 200, s);
  }
  if (p === "/v1/subscriptions" && req.method === "GET") {
    const customer = url.searchParams.get("customer");
    const data = [...subscriptions.values()].filter((x) => !customer || x.customer === customer).map(subscriptionObject);
    return json(res, 200, { object: "list", data, has_more: false, url: "/v1/subscriptions" });
  }
  if ((m = p.match(/^\/v1\/subscriptions\/([^/]+)$/))) {
    const s = subscriptions.get(m[1]);
    if (!s) return json(res, 404, { error: { message: "No such subscription", type: "invalid_request_error" } });
    if (req.method === "POST") {
      if (form.items?.["0"]?.price) s.price = form.items["0"].price;
      if (form.cancel_at_period_end !== undefined) s.cancel_at_period_end = form.cancel_at_period_end === "true";
      await webhook("customer.subscription.updated", subscriptionObject(s));
    }
    return json(res, 200, subscriptionObject(s));
  }
  if (p === "/v1/billing_portal/sessions" && req.method === "POST") {
    return json(res, 200, { id: id("bps"), object: "billing_portal.session", url: `${BASE}/portal/${form.customer}?return=${encodeURIComponent(form.return_url)}` });
  }

  // ----- pagine "ospitate" da Stripe -----
  if ((m = p.match(/^\/checkout\/([^/]+)$/))) {
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, {});
    return html(res, `<h1>Pagamento abbonamento</h1><p>Prezzo: <code>${s.price}</code></p>
      <form method="post" action="/checkout/${s.id}/pay"><button style="font-size:18px;padding:10px 18px">Paga</button></form>
      <p><a href="${s.cancel_url}">Annulla e torna indietro</a></p>`);
  }
  if ((m = p.match(/^\/checkout\/([^/]+)\/pay$/)) && req.method === "POST") {
    const s = sessions.get(m[1]);
    const sub = {
      id: id("sub"), customer: s.customer, status: "active", metadata: s.metadata, itemId: id("si"), price: s.price,
      cancel_at_period_end: false, periodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
    };
    subscriptions.set(sub.id, sub);
    await webhook("checkout.session.completed", { id: s.id, object: "checkout.session", mode: "subscription", subscription: sub.id, customer: s.customer, client_reference_id: s.client_reference_id });
    res.writeHead(303, { location: s.success_url }); return res.end();
  }
  if ((m = p.match(/^\/portal\/([^/]+)$/))) {
    const back = url.searchParams.get("return");
    const sub = [...subscriptions.values()].find((x) => x.customer === m[1] && x.status !== "canceled");
    return html(res, `<h1>Portale abbonamento</h1>
      ${sub ? `<p>Stato: <strong>${sub.status}</strong>${sub.cancel_at_period_end ? " (disdetto a fine periodo)" : ""}</p>
      <form method="post" action="/portal/${m[1]}/cancel?return=${encodeURIComponent(back)}"><button>Disdici a fine periodo</button></form>
      <form method="post" action="/portal/${m[1]}/fail?return=${encodeURIComponent(back)}"><button>Simula pagamento non riuscito</button></form>
      <form method="post" action="/portal/${m[1]}/end?return=${encodeURIComponent(back)}"><button>Termina subito l'abbonamento</button></form>` : "<p>Nessun abbonamento attivo.</p>"}
      <p><a href="${back}">Torna all'app</a></p>`);
  }
  if ((m = p.match(/^\/portal\/([^/]+)\/(cancel|fail|end)$/)) && req.method === "POST") {
    const sub = [...subscriptions.values()].find((x) => x.customer === m[1] && x.status !== "canceled");
    if (sub) {
      if (m[2] === "cancel") { sub.cancel_at_period_end = true; await webhook("customer.subscription.updated", subscriptionObject(sub)); }
      if (m[2] === "fail") { sub.status = "past_due"; await webhook("customer.subscription.updated", subscriptionObject(sub)); }
      if (m[2] === "end") { sub.status = "canceled"; await webhook("customer.subscription.deleted", subscriptionObject(sub)); }
    }
    res.writeHead(303, { location: `/portal/${m[1]}?return=${encodeURIComponent(url.searchParams.get("return"))}` }); return res.end();
  }
  json(res, 404, { error: { message: `fake stripe: ${req.method} ${p}` } });
}).listen(PORT, () => console.log(`fake stripe on ${PORT}`));
