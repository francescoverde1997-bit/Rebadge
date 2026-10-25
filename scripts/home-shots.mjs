// Genera le schermate vere dell'app per la homepage (public/home/*.webp).
// Uso: avvia `npm run demo` in un terminale, poi `npm run shots:home` in un altro.
// Le immagini vengono dalla demo (dati di esempio "Bar Centrale"): nessuna schermata inventata.
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const OUT = "public/home";
// nasconde l'indicatore di sviluppo di Next.js
const HIDE_DEV = "nextjs-portal { display: none !important; }";
mkdirSync(OUT, { recursive: true });

async function shot(page, name, width, { crop = false } = {}) {
  await page.addStyleTag({ content: HIDE_DEV });
  // crop: taglia lo spazio vuoto sotto il contenuto della pagina
  const clip = crop
    ? await page.evaluate(() => {
        const bottom = Math.max(...[...document.querySelectorAll("main > *")].map((e) => e.getBoundingClientRect().bottom));
        return { x: 0, y: 0, width: window.innerWidth, height: Math.min(window.innerHeight, Math.ceil(bottom) + 40) };
      })
    : undefined;
  await sharp(await page.screenshot({ clip })).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`);
  console.log(`✓ ${OUT}/${name}.webp`);
}

async function login(page) {
  await page.goto(`${APP}/accedi`);
  await page.getByLabel("Email").fill("demo@presenze.it");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL(/\/app$/);
}

const browser = await chromium.launch();
try {
  // --- tablet (iPad orizzontale): prima, così la configurazione risulta completa ---
  const tctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, locale: "it-IT" });
  const tablet = await tctx.newPage();
  await login(tablet);
  await tablet.goto(`${APP}/app/tablet`);
  await tablet.getByRole("button", { name: "Attiva questo tablet" }).click();
  await tablet.getByLabel("Nome del tablet").fill("Bancone");
  await tablet.getByRole("button", { name: "Attiva e apri la timbratrice" }).click();
  await tablet.waitForURL(/\/timbra$/);
  await tablet.getByRole("heading", { name: "Tocca il tuo nome" }).waitFor();
  await shot(tablet, "tablet-nomi", 1400);
  await tablet.getByRole("button", { name: /Bruno/ }).click();
  await tablet.getByText("Inserisci il tuo PIN").waitFor();
  for (const d of "73") await tablet.getByRole("button", { name: d, exact: true }).click();
  await shot(tablet, "tablet-pin", 1400);
  await tctx.close();

  // abbonamento attivo nella demo, per un'intestazione pulita ("Piano Base")
  await fetch(`${FAKE}/__company`, { method: "POST", body: JSON.stringify({ plan_status: "active", plan: "base" }) });

  // --- gestionale (desktop) ---------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2, locale: "it-IT" });
  const page = await ctx.newPage();
  await login(page);
  for (const [path, name] of [["/app", "oggi"], ["/app/presenze", "presenze"], ["/app/report", "report"], ["/app/ferie", "ferie"]]) {
    await page.goto(`${APP}${path}`);
    await page.waitForLoadState("networkidle");
    await shot(page, name, 1600, { crop: true });
  }
  await ctx.close();
} finally {
  await browser.close();
}
