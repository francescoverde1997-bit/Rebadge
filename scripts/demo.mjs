// Modalità dimostrativa: avvia l'app con un finto Supabase in memoria e dati di esempio.
// Uso: npm run demo   → poi apri http://localhost:3000
// I dati si perdono alla chiusura. Per l'uso reale collega Supabase (SUPABASE_SETUP.md).
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const FAKE_PORT = 54400;
const APP_PORT = Number(process.env.PORT ?? 3000);
const FAKE = `http://localhost:${FAKE_PORT}`;
const children = [];
const stop = () => { for (const c of children) c.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const STRIPE_PORT = 54500;
const stripeFake = spawn(process.execPath, ["scripts/e2e/fake-stripe.mjs"], {
  env: { ...process.env, FAKE_STRIPE_PORT: String(STRIPE_PORT), APP_WEBHOOK_URL: `http://localhost:${APP_PORT}/api/stripe/webhook`, STRIPE_WEBHOOK_SECRET: "whsec_demo" },
  stdio: "ignore",
});
children.push(stripeFake);

const fake = spawn(process.execPath, ["scripts/e2e/fake-supabase.mjs"], {
  env: { ...process.env, FAKE_SUPABASE_PORT: String(FAKE_PORT) },
  stdio: "ignore",
});
children.push(fake);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { await fetch(url); return; } catch { await sleep(500); }
  }
  throw new Error(`Non risponde: ${url}`);
}
await waitFor(`${FAKE}/__state`);

// --- dati di esempio --------------------------------------------------------
const post = async (path, body, token) => {
  const r = await fetch(`${FAKE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return r.json();
};
const session = await post("/auth/v1/signup", {
  email: "demo@presenze.it", password: "demo1234", data: { company_name: "Bar Centrale", signup_kind: "owner" },
});
const companyId = (await (await fetch(`${FAKE}/__state`)).json()).companies[0].id;
const team = [
  ["Anna", "Rossi", "4821"], ["Bruno", "Gallo", "7316"], ["Chiara", "Esposito", "5092"],
  ["Davide", "Russo", "6148"], ["Elena", "Romano", "3907"],
];
for (const [first, last, pin] of team) {
  await post("/rest/v1/rpc/create_employee", {
    p_company_id: companyId, p_first_name: first, p_last_name: last, p_email: null, p_pin: pin,
  }, session.access_token);
}

// --- timbrature di esempio: dal 1° del mese scorso a oggi --------------------
const { formatInTimeZone, fromZonedTime } = await import("date-fns-tz");
const TZ = "Europe/Rome";
const employees = (await (await fetch(`${FAKE}/__state`)).json()).employees;
const idOf = (first) => employees.find((e) => e.first_name === first).id;
let seed = 7;
const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); }; // deterministico
// ora locale + scostamento in minuti (anche negativo): calcolato sull'istante, mai sulla stringa
const at = (date, h, m) => new Date(fromZonedTime(`${date}T${String(h).padStart(2, "0")}:00:00`, TZ).getTime() + m * 60_000);

const now = new Date();
const today = formatInTimeZone(now, TZ, "yyyy-MM-dd");
const [y, mo] = today.split("-").map(Number);
const first = new Date(Date.UTC(y, mo - 2, 1));
const punches = [];
// orari tipo: [entrata, pausa (inizio, fine) o null, uscita]
const profiles = {
  Anna: [[8, 0], [[12, 30], [13, 30]], [17, 0]],
  Bruno: [[7, 0], null, [15, 0]],
  Chiara: [[9, 0], [[13, 0], [14, 0]], [18, 0]],
  Davide: [[15, 30], null, [23, 30]], // turno serale: 1:30 notturne al giorno
  Elena: [[8, 30], [[12, 30], [13, 0]], [17, 0]],
};
for (let d = new Date(first); ; d.setUTCDate(d.getUTCDate() + 1)) {
  const date = d.toISOString().slice(0, 10);
  if (date > today) break;
  const wd = d.getUTCDay();
  if (wd === 6) continue;
  for (const [name, [inT, brk, outT]] of Object.entries(profiles)) {
    // la domenica lavora solo Bruno, la mattina (ore festive)
    if (wd === 0 && name !== "Bruno") continue;
    const daysAgo = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
    if (name === "Elena" && daysAgo <= 4) continue; // in ferie questa settimana
    const j = () => rnd(11) - 5; // ±5 minuti
    if (wd === 0) {
      const sunday = [["in", at(date, 7, j())], ["out", at(date, 13, j())]];
      for (const [kind, when] of sunday) if (when <= now) punches.push({ employee_id: idOf(name), kind, punched_at: when.toISOString() });
      continue;
    }
    const list = [["in", at(date, inT[0], inT[1] + j())]];
    if (brk) list.push(["out", at(date, brk[0][0], brk[0][1] + j())], ["in", at(date, brk[1][0], brk[1][1] + j())]);
    const extra = rnd(10) === 0 ? 45 : 0; // ogni tanto si resta di più
    list.push(["out", at(date, outT[0], outT[1] + j() + extra)]);
    if (name === "Davide" && daysAgo === 3) list.pop(); // uscita dimenticata da sistemare
    for (const [kind, when] of list) {
      if (Number.isNaN(when.getTime())) throw new Error(`Orario di esempio non valido: ${date} ${name}`);
      if (when <= now) punches.push({ employee_id: idOf(name), kind, punched_at: when.toISOString() });
    }
  }
}
await fetch(`${FAKE}/__punches`, { method: "POST", body: JSON.stringify(punches) });

// --- assenze di esempio ------------------------------------------------------
const shift = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextMonth = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
await fetch(`${FAKE}/__leaves`, {
  method: "POST",
  body: JSON.stringify([
    // Elena è in ferie questa settimana (per questo non ha timbrature negli ultimi giorni)
    { employee_id: idOf("Elena"), type: "ferie", start_date: shift(today, -4), end_date: shift(today, 3), note: "Ferie estive recuperate" },
    // Chiara ha preso un permesso di 2 ore la settimana scorsa
    { employee_id: idOf("Chiara"), type: "permesso", start_date: shift(today, -7), end_date: shift(today, -7), hours: 2, note: "Visita medica" },
    // Anna ha già pianificato le ferie il mese prossimo
    { employee_id: idOf("Anna"), type: "ferie", start_date: `${nextMonth}-09`, end_date: `${nextMonth}-13` },
  ]),
});

// --- app ----------------------------------------------------------------------
const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: FAKE, NEXT_PUBLIC_SUPABASE_ANON_KEY: "demo", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
    NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
    // pagamenti simulati: nessun addebito reale
    STRIPE_SECRET_KEY: "sk_test_demo", STRIPE_WEBHOOK_SECRET: "whsec_demo", STRIPE_API_BASE: `http://localhost:${STRIPE_PORT}`,
    STRIPE_PRICE_BASE: "price_base", STRIPE_PRICE_PLUS: "price_plus",
  },
  stdio: ["ignore", "ignore", "inherit"],
  shell: process.platform === "win32",
});
children.push(app);
await waitFor(`http://localhost:${APP_PORT}/accedi`);

console.log(`
  Presenze — modalità dimostrativa pronta

  Apri:      http://localhost:${APP_PORT}/accedi
  Email:     demo@presenze.it
  Password:  demo1234

  Dipendenti di esempio e PIN per il tablet:
${team.map(([f, l, p]) => `    ${`${f} ${l}`.padEnd(18)} ${p}`).join("\n")}

  Ci sono già 7 settimane di timbrature (con un'uscita dimenticata da sistemare),
  turni serali e domenicali, ferie e un permesso.
  Per provare il tablet: Tablet → "Attiva questo tablet".
  Abbonamento: i pagamenti sono simulati (nessun addebito), si può provare tutto il percorso.
  Dati in memoria: si azzerano quando chiudi (Ctrl+C).
`);
