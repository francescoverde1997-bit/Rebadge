// Operazioni sul progetto Supabase reale tramite la Management API (token in ~/.rebadge/supabase_token,
// mai nel progetto). Uso:
//   node scripts/supabase-remote.mjs migrate <ref>        applica le migrazioni non ancora applicate, in ordine
//   node scripts/supabase-remote.mjs sql <ref> "<query>"  esegue una query (solo per controlli)
//   node scripts/supabase-remote.mjs auth <ref> <url>     indirizzo del sito, link consentiti, password, testi email
//                                                         (da docs/email-templates.md): si rilancia a ogni nuovo indirizzo
// Le migrazioni applicate si registrano in supabase_migrations.schema_migrations (come la CLI di Supabase),
// così non vengono mai applicate due volte.
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TOKEN = readFileSync(join(homedir(), ".rebadge", "supabase_token"), "utf8").trim();
const [cmd, ref, arg] = process.argv.slice(2);
if (!cmd || !/^[a-z]{20}$/.test(ref ?? "")) { console.error("uso: node scripts/supabase-remote.mjs <migrate|sql|auth> <ref> [query|url]"); process.exit(2); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : [];
}

if (cmd === "sql") {
  console.log(JSON.stringify(await sql(arg), null, 1));
} else if (cmd === "migrate") {
  await sql(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  const done = new Set((await sql("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    if (done.has(version)) { console.log(`= ${f} (già applicata)`); continue; }
    const body = readFileSync(join(ROOT, "supabase/migrations", f), "utf8");
    // migrazione e registrazione nella stessa transazione: o tutto o niente
    await sql(`begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${rest.join("_")}');\ncommit;`);
    console.log(`✓ ${f}`);
  }
  console.log("migrazioni aggiornate");
} else if (cmd === "auth") {
  const site = (arg ?? "").replace(/\/$/, "");
  if (!/^https?:\/\/[^/]+$/.test(site)) { console.error("serve l'indirizzo del sito, es. https://rebadge.vercel.app"); process.exit(2); }
  // testi delle email: blocchi ```html dopo "## Confirm signup" e "## Reset password", oggetto dalla riga **Oggetto:**
  const md = readFileSync(join(ROOT, "docs/email-templates.md"), "utf8");
  const section = (title) => {
    const part = md.split(`## ${title}`)[1].split("\n## ")[0];
    return { subject: part.match(/\*\*Oggetto:\*\*\s*(.+)/)[1].trim(), html: part.match(/```html\n([\s\S]*?)```/)[1].trim() };
  };
  const confirm = section("Confirm signup"), recovery = section("Reset password");
  const allow = [`${site}/**`, ...(site.startsWith("http://localhost") ? [] : ["http://localhost:3000/**"])];
  const base = {
    site_url: site,
    uri_allow_list: allow.join(","),
    password_min_length: 8, // come la validazione dell'app
    mailer_autoconfirm: false, // conferma email obbligatoria
  };
  const templates = {
    mailer_subjects_confirmation: confirm.subject,
    mailer_templates_confirmation_content: confirm.html,
    mailer_subjects_recovery: recovery.subject,
    mailer_templates_recovery_content: recovery.html,
  };
  const patch = (body) => fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let r = await patch({ ...base, ...templates });
  if (r.status === 400 && /email template/i.test(await r.clone().text())) {
    // piano Free con l'email predefinita di Supabase: i testi si possono cambiare solo con un SMTP nostro (Resend, fase D7)
    console.log("⚠ testi email in italiano non applicati: serve il servizio email nostro (SMTP). Applico il resto.");
    r = await patch(base);
  }
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 600)}`);
  const d = await r.json();
  console.log({ site_url: d.site_url, uri_allow_list: d.uri_allow_list, password_min_length: d.password_min_length,
    oggetto_conferma: d.mailer_subjects_confirmation, oggetto_recupero: d.mailer_subjects_recovery, conferma_obbligatoria: !d.mailer_autoconfirm });
} else {
  console.error(`comando sconosciuto: ${cmd}`); process.exit(2);
}
