// Test di sicurezza del database eseguiti sul progetto Supabase REALE, senza lasciare traccia:
// ogni file gira in una transazione che alla fine viene sempre annullata (ROLLBACK).
// Uso: node scripts/test-db-remote.mjs <ref>   (token in ~/.rebadge/supabase_token)
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TOKEN = readFileSync(join(homedir(), ".rebadge", "supabase_token"), "utf8").trim();
const ref = process.argv[2];
if (!/^[a-z]{20}$/.test(ref ?? "")) { console.error("uso: node scripts/test-db-remote.mjs <ref>"); process.exit(2); }

let failed = false;
for (const f of readdirSync(join(ROOT, "supabase/tests")).filter((x) => /^[1-9].*\.sql$/.test(x)).sort()) {
  const echoes = [];
  const body = readFileSync(join(ROOT, "supabase/tests", f), "utf8").split("\n").map((l) => {
    if (/^\\set\b/.test(l)) return "";
    const m = l.match(/^\\echo\s+'(.*)'\s*$/); if (m) { echoes.push(m[1]); return ""; }
    return l;
  }).join("\n");
  // l'errore di un test interrompe la transazione; in ogni caso si chiude con ROLLBACK: nessun dato resta nel database
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: `begin;\n${body}\n;rollback;` }),
  });
  if (r.ok) console.log(`✓ ${f}${echoes.length ? `  (${echoes.join(", ")})` : ""}`);
  else { failed = true; console.log(`✗ ${f}\n  ${(await r.text()).slice(0, 500)}`); }
}
console.log(failed ? "\nTEST SUL DATABASE REALE FALLITI" : "\nTutti i test passano anche sul database reale (nessun dato lasciato).");
process.exit(failed ? 1 : 0);
