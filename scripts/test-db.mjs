// Test del database: Postgres temporaneo + emulazione di Supabase + migrazioni + test (RLS, tablet, chiusura…).
// Funziona su Mac e Linux senza installare nulla: usa il Postgres 17 incluso nei pacchetti di sviluppo
// (embedded-postgres); se c'è PGBIN o un Postgres di sistema in /usr/lib/postgresql, usa quello.
// I file SQL usano solo due comandi di psql (\set ed \echo): qui \set si ignora (ogni errore ferma comunque
// il file) ed \echo si stampa. Uso: npm run test:db
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PGPORT ?? 54329);

function postgresBin() {
  if (process.env.PGBIN) return process.env.PGBIN;
  const system = existsSync("/usr/lib/postgresql") && readdirSync("/usr/lib/postgresql").sort().at(-1);
  if (system) return `/usr/lib/postgresql/${system}/bin`;
  const bundled = join(ROOT, "node_modules", "@embedded-postgres", `${process.platform}-${process.arch}`, "native", "bin");
  if (existsSync(join(bundled, "postgres"))) return bundled;
  throw new Error(`Postgres non trovato per ${process.platform}-${process.arch}: imposta PGBIN o esegui npm install`);
}

const BIN = postgresBin();
const DATA = mkdtempSync(join(tmpdir(), "rebadge-pg-"));
// initdb rifiuta l'utente root (container/CI): in quel caso si usa un utente dedicato
const asUser = process.getuid?.() === 0 ? ["runuser", "-u", "pgtest", "--"] : [];
if (asUser.length) {
  try { execFileSync("id", ["pgtest"], { stdio: "ignore" }); } catch { execFileSync("useradd", ["-M", "pgtest"]); }
  execFileSync("chown", ["pgtest", DATA]);
}
const pgExec = (tool, args) => asUser.length
  ? execFileSync(asUser[0], [...asUser.slice(1), join(BIN, tool), ...args], { stdio: "ignore" })
  : execFileSync(join(BIN, tool), args, { stdio: "ignore" });

pgExec("initdb", ["-D", DATA, "-U", "postgres", "-A", "trust"]);
pgExec("pg_ctl", ["-D", DATA, "-o", `-p ${PORT} -k ${DATA} -c listen_addresses=''`, "-l", join(DATA, "log"), "start", "-w"]);

let failed = false;
async function runFile(file) {
  const echoes = [];
  const sql = readFileSync(file, "utf8").split("\n").map((line) => {
    if (/^\\set\b/.test(line)) return "";
    const echo = line.match(/^\\echo\s+'(.*)'\s*$/);
    if (echo) { echoes.push(echo[1]); return ""; }
    if (/^\\/.test(line)) throw new Error(`comando psql non supportato in ${file}: ${line}`);
    return line;
  }).join("\n");
  const client = new pg.Client({ host: DATA, port: PORT, user: "postgres", database: "postgres" });
  await client.connect();
  const name = file.slice(ROOT.length);
  try {
    await client.query(sql);
    for (const e of echoes) console.log(`  ${e}`);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed = true;
    console.log(`✗ ${name}\n  ${e.message}${e.where ? `\n  ${e.where}` : ""}`);
  } finally {
    await client.end();
  }
}

const sqlFiles = (dir, pattern) => readdirSync(join(ROOT, dir)).filter((f) => pattern.test(f)).sort().map((f) => join(ROOT, dir, f));
try {
  console.log(`Postgres: ${execFileSync(join(BIN, "postgres"), ["--version"]).toString().trim()}`);
  await runFile(join(ROOT, "supabase/tests/00_supabase_stub.sql"));
  for (const f of sqlFiles("supabase/migrations", /\.sql$/)) if (!failed) await runFile(f);
  if (!failed) for (const f of sqlFiles("supabase/tests", /^[1-9].*\.sql$/)) await runFile(f);
} finally {
  pgExec("pg_ctl", ["-D", DATA, "stop", "-m", "fast"]);
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failed ? "\nTEST DB FALLITI" : "\nTutti i test del database sono superati.");
process.exit(failed ? 1 : 0);
