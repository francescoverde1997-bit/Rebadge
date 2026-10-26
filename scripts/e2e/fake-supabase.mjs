// Finto Supabase in memoria, SOLO per i test end-to-end dell'interfaccia in locale.
// Implementa il minimo indispensabile di Auth, REST e Storage usato dall'app.
// La sicurezza (RLS) NON è emulata qui: è testata su Postgres con `npm run test:db`.
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54400);
const users = new Map(); // email -> { id, email, password, meta }
const reminderLog = []; // { company_id, local_date, sent_at }: promemoria serali inviati (solo service_role)
const tokens = new Map(); // access_token -> userId
const companies = new Map();
const members = [];
const settings = new Map();
const files = new Map(); // path -> { type, body }
const employees = [];
const devices = []; // { id, company_id, name, token, created_at, last_seen_at, revoked_at }
const punches = []; // { id, employee_id, company_id, kind, punched_at }
const pinFails = new Map(); // employeeId -> { n, until }
const leaves = [];
const closures = []; // { company_id, month, closed_at, closed_by, settings, totals, pdf_path }
const reportFiles = new Map(); // path -> bytes
const customRequests = []; // richieste di preventivo Personalizzato
const pins = new Map(); // employeeId -> pin (in chiaro: è un finto, solo per test)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function session(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, email: user.email, role: "authenticated", exp, aud: "authenticated" })}.fake`;
  tokens.set(access_token, user.id);
  return {
    access_token, refresh_token: randomUUID(), token_type: "bearer", expires_in: 3600, expires_at: exp,
    user: publicUser(user),
  };
}
const publicUser = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
  user_metadata: u.meta, app_metadata: { provider: "email" }, created_at: new Date().toISOString(),
});
const userFromReq = (req) => {
  const t = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const id = tokens.get(t);
  return id ? [...users.values()].find((u) => u.id === id) : null;
};

function signup(email, password, meta) {
  const user = { id: randomUUID(), email, password, meta };
  users.set(email, user);
  if ((meta.signup_kind ?? "owner") === "owner") {
    const id = randomUUID();
    companies.set(id, {
      id, name: (meta.company_name ?? email.split("@")[0]).trim(), logo_path: null, timezone: "Europe/Rome",
      plan_status: "trialing", trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      plan: null, stripe_customer_id: null, stripe_subscription_id: null, current_period_end: null, cancel_at_period_end: false,
      created_at: new Date().toISOString(),
    });
    members.push({ company_id: id, user_id: user.id, role: "owner", created_at: new Date().toISOString() });
    settings.set(id, {
      company_id: id, rounding_minutes: 0, auto_break_minutes: 0, auto_break_after_minutes: 360,
      daily_overtime_after_minutes: 480, max_shift_minutes: 960,
      track_night: true, night_start_minutes: 1320, night_end_minutes: 360, track_holiday: true,
      patron_month_day: null, patron_name: null, work_saturday: false,
      reminder_enabled: true, reminder_minutes: 1200,
    });
  }
  return user;
}

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
const eq = (url, col) => url.searchParams.get(col)?.replace(/^eq\./, "");

const romeMonth = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
const isClosed = (cid, month) => closures.some((c) => c.company_id === cid && c.month === month);
const leaveTouchesClosed = (l) => closures.some((c) => c.company_id === l.company_id && c.month >= l.start_date.slice(0, 7) && c.month <= l.end_date.slice(0, 7));
const CLOSED = { code: "55000", message: "Il mese è chiuso" };
// vincolo leave_inps_protocol della migrazione 12
const protocolOk = (l) => l.inps_protocol == null || (l.type === "malattia" && /^[A-Za-z0-9/-]{4,30}$/.test(l.inps_protocol));

/** Filtri PostgREST minimi: eq, gte, gt, lte, lt, is.null, not.is.null (stringhe ISO confrontabili). */
function applyFilters(rows, url) {
  const skip = new Set(["select", "order", "limit", "offset"]);
  const filters = [...url.searchParams.entries()].filter(([k]) => !skip.has(k));
  return rows.filter((r) => filters.every(([k, v]) => {
    const val = r[k] == null ? null : String(r[k]);
    if (v === "is.null") return val == null;
    if (v === "not.is.null") return val != null;
    const [op, ...rest] = v.split("."); const arg = rest.join(".");
    if (op === "eq") return val === arg;
    if (op === "gte") return val != null && val >= arg;
    if (op === "gt") return val != null && val > arg;
    if (op === "lte") return val != null && val <= arg;
    if (op === "lt") return val != null && val < arg;
    if (op === "neq") return val !== arg;
    return true;
  }));
}
function applyOrderAndRange(rows, url) {
  const order = url.searchParams.get("order");
  if (order) {
    const keys = order.split(",").map((o) => o.split("."));
    rows = [...rows].sort((a, b) => {
      for (const [k, dir] of keys) {
        const c = String(a[k] ?? "").localeCompare(String(b[k] ?? ""));
        if (c) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.get("limit");
  return rows.slice(offset, limit == null ? undefined : offset + Number(limit));
}

const SERVICE_KEY = "fake-service-role";
const isActive = (c) => c && (c.plan_status === "active" || c.plan_status === "past_due" ||
  (c.plan_status === "trialing" && new Date(c.trial_ends_at).getTime() > Date.now()));
const employeeLimit = (c) => (c.plan_status === "trialing" || !c.plan ? 30 : c.plan === "custom" ? (c.custom_employee_limit ?? 1000) : { base: 5, plus: 30 }[c.plan] ?? 30);
const activeCount = (cid, exceptId) => employees.filter((e) => e.company_id === cid && e.active && e.id !== exceptId).length;
const LIMIT = { code: "53400", message: "Limite del piano" };
const SUSPENDED = { code: "P0004", message: "Servizio sospeso" };

function rest(req, res, url, body, user) {
  const table = url.pathname.split("/")[3];
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const reply = (rows) => (single ? json(res, rows.length ? 200 : 406, rows[0] ?? { code: "PGRST116" }) : json(res, 200, rows));
  const admin = (req.headers.authorization ?? "") === `Bearer ${SERVICE_KEY}`;
  const mine = (cid) => admin || members.some((m) => m.company_id === cid && m.user_id === user?.id);

  if (table === "reminder_log") {
    if (!admin) return json(res, 403, { code: "42501", message: "permission denied" });
    const match = (r) => [...url.searchParams.entries()].filter(([k]) => !["select", "limit"].includes(k)).every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3));
    if (req.method === "POST") {
      const it = JSON.parse(body.toString());
      if (reminderLog.some((r) => r.company_id === it.company_id && r.local_date === it.local_date)) return json(res, 409, { code: "23505", message: "duplicate key" });
      reminderLog.push({ ...it, sent_at: new Date().toISOString() });
      return json(res, 201);
    }
    if (req.method === "DELETE") { for (const r of reminderLog.filter(match)) reminderLog.splice(reminderLog.indexOf(r), 1); return json(res, 204); }
    return reply(reminderLog.filter(match));
  }
  if (table === "company_members" && req.method === "GET" && admin) {
    const rows = members.filter((m) => m.company_id === eq(url, "company_id") && (!eq(url, "role") || m.role === eq(url, "role")));
    return reply(rows.slice(0, 1).map((m) => ({ user_id: m.user_id })));
  }
  if (table === "company_members" && req.method === "GET") {
    const rows = members.filter((m) => m.user_id === eq(url, "user_id") && m.user_id === user?.id)
      .map((m) => ({ role: m.role, companies: companies.get(m.company_id) }));
    return reply(rows.slice(0, 1));
  }
  if (table === "companies") {
    const rows = applyFilters([...companies.values()].filter((c) => mine(c.id)), url);
    if (req.method === "PATCH") {
      const patch = JSON.parse(body.toString());
      // come i grant a colonne: il client modifica solo nome, logo e fuso; il resto solo il server
      const allowed = admin ? patch : Object.fromEntries(Object.entries(patch).filter(([k]) => ["name", "logo_path", "timezone"].includes(k)));
      for (const c of rows) Object.assign(c, allowed);
      return json(res, 204);
    }
    return reply(rows);
  }
  if (table === "company_settings") {
    const s = settings.get(eq(url, "company_id"));
    if (!s || !mine(s.company_id)) return reply([]);
    if (req.method === "PATCH") { Object.assign(s, JSON.parse(body.toString())); return json(res, 204); }
    return reply([s]);
  }
  if (table === "employees") {
    // filtri semplici in stile PostgREST: col=eq.x, col=not.is.null
    const filters = [...url.searchParams.entries()].filter(([k]) => !["select", "order", "limit"].includes(k));
    const match = (e) => mine(e.company_id) && filters.every(([k, v]) => {
      if (v.startsWith("eq.")) return String(e[k]) === v.slice(3);
      if (v === "not.is.null") return e[k] != null;
      if (v === "is.null") return e[k] == null;
      return true;
    });
    if (req.method === "PATCH") {
      const patch = JSON.parse(body.toString());
      for (const e of employees.filter(match)) {
        if (patch.active === true && !e.active && activeCount(e.company_id, e.id) >= employeeLimit(companies.get(e.company_id))) return json(res, 400, LIMIT);
      }
      for (const e of employees.filter(match)) Object.assign(e, patch);
      return json(res, 204);
    }
    const rows = employees.filter(match)
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
    if (req.method === "HEAD") {
      res.writeHead(200, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      return res.end();
    }
    return reply(rows);
  }
  if (table === "month_closures") {
    if (req.method !== "GET") return json(res, 403, { code: "42501", message: "permission denied" });
    return reply(applyOrderAndRange(applyFilters(closures.filter((c) => mine(c.company_id)), url), url));
  }
  if (table === "leave_requests") {
    const visible = leaves.filter((x) => mine(x.company_id));
    if (req.method === "POST") {
      const it = JSON.parse(body.toString());
      if (!mine(it.company_id)) return json(res, 403, { code: "42501", message: "permission denied" });
      if (leaveTouchesClosed(it)) return json(res, 400, CLOSED);
      const hourly = (x) => x.type === "permesso" && x.hours != null;
      const clash = leaves.some((l) => l.employee_id === it.employee_id && l.start_date <= it.end_date && it.start_date <= l.end_date && !(hourly(l) && hourly(it)));
      if (clash) return json(res, 409, { code: "23P01", message: "overlap" });
      if (!protocolOk(it)) return json(res, 400, { code: "23514", message: "leave_inps_protocol" });
      leaves.push({ id: randomUUID(), status: "approved", inps_protocol: null, ...it });
      return json(res, 201);
    }
    if (req.method === "PATCH") { // modifica di un'assenza (stessi controlli dei trigger del DB)
      const patch = JSON.parse(body.toString());
      const targets = applyFilters(visible, url);
      for (const x of targets) {
        const next = { ...x, ...patch };
        if (leaveTouchesClosed(x) || leaveTouchesClosed(next)) return json(res, 400, CLOSED);
        if (!protocolOk(next)) return json(res, 400, { code: "23514", message: "leave_inps_protocol" });
        const hourly = (y) => y.type === "permesso" && y.hours != null;
        const clash = leaves.some((l) => l !== x && l.employee_id === next.employee_id && l.start_date <= next.end_date && next.start_date <= l.end_date && !(hourly(l) && hourly(next)));
        if (clash) return json(res, 409, { code: "23P01", message: "overlap" });
      }
      for (const x of targets) Object.assign(x, patch);
      return json(res, 200, targets.map((x) => ({ id: x.id })));
    }
    if (req.method === "DELETE") {
      const targets = applyFilters(visible, url);
      if (targets.some(leaveTouchesClosed)) return json(res, 400, CLOSED);
      for (const x of targets) leaves.splice(leaves.indexOf(x), 1);
      return json(res, 204);
    }
    return reply(applyOrderAndRange(applyFilters(visible, url).filter((x) => {
      const neq = url.searchParams.get("status");
      return !(neq && neq.startsWith("neq.") && x.status === neq.slice(4));
    }), url));
  }
  if (table === "punches") {
    const visible = punches.filter((x) => mine(x.company_id));
    if (req.method === "POST") {
      const items = [].concat(JSON.parse(body.toString()));
      for (const it of items) {
        if (!mine(it.company_id)) return json(res, 403, { code: "42501", message: "permission denied" });
        if (it.source === "manual" && (!it.note || !it.note.trim())) return json(res, 400, { code: "23514", message: "check" });
        if (it.source === "manual" && new Date(it.punched_at).getTime() > Date.now() + 5 * 60000) return json(res, 400, { code: "22023", message: "futuro" });
        if (isClosed(it.company_id, romeMonth(it.punched_at))) return json(res, 400, CLOSED);
        punches.push({ id: randomUUID(), voided_at: null, void_reason: null, note: null, ...it });
      }
      return json(res, 201);
    }
    if (req.method === "PATCH") {
      const patch = JSON.parse(body.toString());
      for (const x of applyFilters(visible, url)) {
        if (x.voided_at) continue;
        if (isClosed(x.company_id, romeMonth(x.punched_at))) return json(res, 400, CLOSED);
        if (!patch.void_reason || patch.void_reason.trim().length < 3) return json(res, 400, { code: "23514", message: "check" });
        x.voided_at = patch.voided_at; x.void_reason = patch.void_reason; x.voided_by = user.id;
      }
      return json(res, 204);
    }
    return reply(applyOrderAndRange(applyFilters(visible, url), url));
  }
  if (table === "devices") {
    const filters = [...url.searchParams.entries()].filter(([k]) => !["select", "order", "limit"].includes(k));
    const match = (d) => mine(d.company_id) && filters.every(([k, v]) =>
      v.startsWith("eq.") ? String(d[k]) === v.slice(3) : v === "is.null" ? d[k] == null : v === "not.is.null" ? d[k] != null : true);
    if (req.method === "PATCH") {
      const patch = JSON.parse(body.toString());
      for (const d of devices.filter(match)) Object.assign(d, patch);
      return json(res, 204);
    }
    const rows = devices.filter(match).map((d) => { const copy = { ...d }; delete copy.token; return copy; });
    if (req.method === "HEAD") {
      res.writeHead(200, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      return res.end();
    }
    return reply(rows);
  }
  if (table === "rpc") {
    const fn = url.pathname.split("/")[4];
    const a = JSON.parse(body.toString() || "{}");
    const deviceFor = (t) => {
      const d = devices.find((x) => x.token === t && !x.revoked_at);
      if (d) d.last_seen_at = new Date().toISOString();
      return d;
    };
    const unauthorized = () => json(res, 403, { code: "42501", message: "Tablet non autorizzato" });
    if (fn === "request_custom_plan") {
      const email = String(a.p_email ?? "").trim().toLowerCase();
      const ranges = ["31-50", "51-100", "101-250", "250+"];
      if (String(a.p_company_name ?? "").trim().length < 2 || String(a.p_contact_name ?? "").trim().length < 2 ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !ranges.includes(a.p_employees_range)) {
        return json(res, 400, { code: "23514", message: "check_violation" });
      }
      const hourAgo = Date.now() - 3600000;
      if (customRequests.filter((r) => r.email === email && new Date(r.created_at).getTime() > hourAgo).length >= 3) {
        return json(res, 400, { code: "P0005", message: "Troppe richieste" });
      }
      const m = user && members.find((x) => x.user_id === user.id);
      customRequests.push({ id: randomUUID(), created_at: new Date().toISOString(), company_id: m?.company_id ?? null, user_id: user?.id ?? null,
        company_name: a.p_company_name.trim(), contact_name: a.p_contact_name.trim(), email, phone: a.p_phone || null,
        employees_range: a.p_employees_range, locations: a.p_locations ?? null, message: a.p_message || null });
      return json(res, 204);
    }
    if (fn === "close_month") {
      if (!mine(a.p_company_id)) return json(res, 403, { code: "42501", message: "Non autorizzato" });
      if (a.p_month >= romeMonth(new Date().toISOString())) return json(res, 400, { code: "22023", message: "mese non finito" });
      if (!String(a.p_pdf_path).startsWith(`${a.p_company_id}/`)) return json(res, 400, { code: "22023", message: "pdf" });
      if (isClosed(a.p_company_id, a.p_month)) return json(res, 409, { code: "23505", message: "duplicate" });
      const c = { company_id: a.p_company_id, month: a.p_month, closed_at: new Date().toISOString(), closed_by: user.id,
        settings: a.p_settings, totals: a.p_totals, pdf_path: a.p_pdf_path };
      closures.push(c);
      return json(res, 200, c.closed_at);
    }
    if (fn === "create_device") {
      if (!mine(a.p_company_id)) return json(res, 403, { code: "42501", message: "Non autorizzato" });
      const d = { id: randomUUID(), company_id: a.p_company_id, name: a.p_name, token: randomUUID() + randomUUID(),
        created_at: new Date().toISOString(), last_seen_at: null, revoked_at: null };
      devices.push(d);
      return json(res, 200, d.token);
    }
    if (fn === "kiosk_info") {
      const d = deviceFor(a.p_token); if (!d) return unauthorized();
      if (!isActive(companies.get(d.company_id))) return json(res, 400, SUSPENDED);
      const c = companies.get(d.company_id);
      return json(res, 200, {
        device: { name: d.name },
        company: { name: c.name, logo_path: c.logo_path, timezone: c.timezone },
        employees: employees.filter((e) => e.company_id === d.company_id && e.active)
          .sort((x, y) => x.first_name.localeCompare(y.first_name))
          .map((e) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, has_pin: Boolean(e.pin_set_at) })),
      });
    }
    if (fn === "kiosk_punch") {
      const d = deviceFor(a.p_token); if (!d) return unauthorized();
      if (!isActive(companies.get(d.company_id))) return json(res, 400, SUSPENDED);
      const e = employees.find((x) => x.id === a.p_employee_id && x.company_id === d.company_id && x.active);
      if (!e) return json(res, 404, { code: "P0002", message: "Dipendente non trovato" });
      if (!pins.has(e.id)) return json(res, 200, { ok: false, error: "no_pin" });
      const f = pinFails.get(e.id) ?? { n: 0, until: 0 };
      const now = Date.now();
      if (f.until > now) return json(res, 200, { ok: false, error: "locked", locked_until: new Date(f.until).toISOString() });
      if (pins.get(e.id) !== a.p_pin) {
        f.n += 1;
        if (f.n >= 5) { f.n = 0; f.until = now + 5 * 60000; pinFails.set(e.id, f); return json(res, 200, { ok: false, error: "locked" }); }
        pinFails.set(e.id, f);
        return json(res, 200, { ok: false, error: "wrong_pin" });
      }
      pinFails.delete(e.id);
      const last = punches.filter((x) => x.employee_id === e.id && !x.voided_at).sort((x, y) => y.punched_at.localeCompare(x.punched_at))[0];
      if (last && now - new Date(last.punched_at).getTime() < 60000) {
        return json(res, 200, { ok: true, duplicate: true, kind: last.kind, punched_at: last.punched_at, first_name: e.first_name });
      }
      const kind = last && last.kind === "in" && now - new Date(last.punched_at).getTime() < 16 * 3600000 ? "out" : "in";
      const pr = { id: randomUUID(), employee_id: e.id, company_id: d.company_id, kind, punched_at: new Date(now).toISOString(), source: "kiosk", note: null, voided_at: null, void_reason: null };
      punches.push(pr);
      return json(res, 200, { ok: true, kind, punched_at: pr.punched_at, first_name: e.first_name });
    }
    if (fn === "create_employee" && mine(a.p_company_id) && activeCount(a.p_company_id) >= employeeLimit(companies.get(a.p_company_id))) {
      return json(res, 400, LIMIT);
    }
    if (fn === "create_employee") {
      if (!mine(a.p_company_id)) return json(res, 403, { code: "42501", message: "Non autorizzato" });
      if (!/^\d{4,6}$/.test(a.p_pin)) return json(res, 400, { code: "22023", message: "PIN" });
      const e = {
        id: randomUUID(), company_id: a.p_company_id, first_name: a.p_first_name.trim(), last_name: a.p_last_name.trim(),
        email: a.p_email || null, active: true, pin_set_at: new Date().toISOString(),
      };
      employees.push(e); pins.set(e.id, a.p_pin);
      return json(res, 200, e.id);
    }
    if (fn === "set_employee_pin") {
      const e = employees.find((x) => x.id === a.p_employee_id);
      if (!e || !mine(e.company_id)) return json(res, 403, { code: "42501", message: "Non autorizzato" });
      pins.set(e.id, a.p_pin); e.pin_set_at = new Date().toISOString();
      return json(res, 204);
    }
  }
  return json(res, 404, { message: `fake: ${req.method} ${table} non implementato` });
}

function storage(req, res, url, body) {
  const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
  let m;
  if ((m = p.match(/^\/object\/sign\/logos\/(.+)$/)) && req.method === "POST") {
    return json(res, 200, { signedURL: `/object/public-fake/logos/${m[1]}?token=x` });
  }
  if ((m = p.match(/^\/object\/(?:public-fake|public)\/logos\/(.+)$/))) {
    const f = files.get(m[1]);
    if (!f) return json(res, 404, {});
    res.writeHead(200, { "content-type": f.type }); return res.end(f.body);
  }
  if ((m = p.match(/^\/object\/logos\/(.+)$/)) && req.method === "POST") {
    let type = req.headers["content-type"] ?? "", data = body;
    const bnd = type.match(/boundary=(.+)$/)?.[1];
    if (bnd) { // multipart: prendi la parte con il file
      const part = body.toString("latin1").split(`--${bnd}`).find((x) => /filename=|name=""/.test(x)) ?? "";
      const [head, ...rest] = part.split("\r\n\r\n");
      type = head.match(/content-type: ?([^\r\n]+)/i)?.[1] ?? "application/octet-stream";
      data = Buffer.from(rest.join("\r\n\r\n").replace(/\r\n$/, ""), "latin1");
    }
    files.set(m[1], { type, body: data });
    return json(res, 200, { Key: `logos/${m[1]}`, Id: randomUUID() });
  }
  if ((m = p.match(/^\/object\/reports\/(.+)$/)) && req.method === "POST") {
    if (reportFiles.has(m[1])) return json(res, 409, { statusCode: "409", error: "Duplicate", message: "exists" });
    reportFiles.set(m[1], body);
    return json(res, 200, { Key: `reports/${m[1]}`, Id: randomUUID() });
  }
  if ((m = p.match(/^\/object\/(?:authenticated\/)?reports\/(.+)$/)) && req.method === "GET") {
    const f = reportFiles.get(m[1]);
    if (!f) return json(res, 404, { statusCode: "404", error: "not_found", message: "not found" });
    res.writeHead(200, { "content-type": "application/pdf" }); return res.end(f);
  }
  if (p === "/object/reports" && req.method === "DELETE") { // solo dal server (service_role): PDF orfano di una chiusura fallita
    for (const k of JSON.parse(body.toString()).prefixes ?? []) reportFiles.delete(k);
    return json(res, 200, []);
  }
  if (p === "/object/logos" && req.method === "DELETE") {
    for (const k of JSON.parse(body.toString()).prefixes ?? []) files.delete(k);
    return json(res, 200, []);
  }
  return json(res, 404, { message: `fake storage: ${req.method} ${p}` });
}

http.createServer(async (req, res) => {
  // CORS come Supabase: le chiamate dal browser (tablet) arrivano da un'altra origine
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,HEAD,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const body = await readBody(req);
  const user = userFromReq(req);
  const p = url.pathname;

  if (p === "/__reset") { users.clear(); tokens.clear(); companies.clear(); members.length = 0; settings.clear(); files.clear(); employees.length = 0; pins.clear(); devices.length = 0; punches.length = 0; pinFails.clear(); leaves.length = 0; closures.length = 0; reportFiles.clear(); customRequests.length = 0; reminderLog.length = 0; return json(res, 200, {}); }
  if (p === "/__punches" && req.method === "POST") { // solo test/demo: inserisce timbrature grezze
    for (const it of JSON.parse(body.toString())) {
      const e = employees.find((x) => x.id === it.employee_id);
      punches.push({ id: randomUUID(), company_id: e.company_id, source: "kiosk", note: null, voided_at: null, void_reason: null, ...it });
    }
    return json(res, 200, { count: punches.length });
  }
  if (p === "/__leaves" && req.method === "POST") { // solo demo: assenze grezze
    for (const it of JSON.parse(body.toString())) {
      const e = employees.find((x) => x.id === it.employee_id);
      leaves.push({ id: randomUUID(), company_id: e.company_id, status: "approved", hours: null, note: null, ...it });
    }
    return json(res, 200, {});
  }
  if (p === "/__company" && req.method === "POST") { // solo test: es. far scadere la prova
    const patch = JSON.parse(body.toString());
    const c = patch.id ? companies.get(patch.id) : [...companies.values()].at(-1);
    Object.assign(c, patch);
    return json(res, 200, c);
  }
  if (p === "/__shift") { // sposta indietro tutte le timbrature di N minuti
    const min = Number(url.searchParams.get("min") ?? 0);
    for (const x of punches) x.punched_at = new Date(new Date(x.punched_at).getTime() - min * 60000).toISOString();
    return json(res, 200, {});
  }
  if (p === "/__state") return json(res, 200, { companies: [...companies.values()], settings: [...settings.values()], files: [...files.keys()], employees, pins: Object.fromEntries(pins), devices, punches, leaves, closures, reportFiles: [...reportFiles.keys()], customRequests, reminderLog });

  if (p === "/auth/v1/signup") {
    const { email, password, data } = JSON.parse(body.toString());
    if (users.has(email)) return json(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    return json(res, 200, session(signup(email, password, data ?? {})));
  }
  if (p === "/auth/v1/token") {
    const { email, password } = JSON.parse(body.toString());
    const u = users.get(email);
    if (!u || u.password !== password) return json(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    return json(res, 200, session(u));
  }
  if (p === "/auth/v1/user") return user ? json(res, 200, publicUser(user)) : json(res, 401, { code: 401, error_code: "no_authorization", msg: "no user" });
  if (p === "/auth/v1/logout") return json(res, 204);
  if (p.startsWith("/auth/v1/admin/users/") && req.method === "GET") {
    if ((req.headers.authorization ?? "") !== `Bearer ${SERVICE_KEY}`) return json(res, 401, { msg: "not admin" });
    const u = [...users.values()].find((x) => x.id === p.split("/").pop());
    return u ? json(res, 200, publicUser(u)) : json(res, 404, { msg: "User not found" });
  }
  if (p.startsWith("/rest/v1/")) return rest(req, res, url, body, user);
  if (p.startsWith("/storage/v1/")) return storage(req, res, url, body);
  json(res, 404, { message: `fake: ${p}` });
}).listen(PORT, () => console.log(`fake supabase on ${PORT}`));
