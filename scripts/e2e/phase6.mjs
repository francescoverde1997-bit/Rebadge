// Test end-to-end Fase 6: report PDF/Excel e chiusura del mese.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { pdfText as readPdfText } from "../pdf-text.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const FAKE = process.env.FAKE_URL ?? "http://localhost:54400";
const TZ = "Europe/Rome";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });
const state = async () => (await fetch(`${FAKE}/__state`)).json();

const now = new Date();
const CUR = formatInTimeZone(now, TZ, "yyyy-MM");
const [cy, cm] = CUR.split("-").map(Number);
const pd = new Date(Date.UTC(cy, cm - 2, 1));
const PREV = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}`;
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const PREV_LABEL = `${MONTHS[pd.getUTCMonth()]} ${pd.getUTCFullYear()}`;
const iso = (day, hm) => fromZonedTime(`${PREV}-${day}T${hm}:00`, TZ).toISOString();

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message.split("\n")[0]]); throw e; }
}

await fetch(`${FAKE}/__reset`);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "it-IT", acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function download(trigger) {
  const [dl] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const path = `${SHOTS}/${dl.suggestedFilename()}`;
  await dl.saveAs(path);
  return { name: dl.suggestedFilename(), path, bytes: readFileSync(path) };
}
// pdftotext se c'è, altrimenti pdfjs (macOS senza poppler)
const pdfText = (path) => readPdfText(path);
async function xlsxRow(path, sheet, firstCell) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(sheet);
  const header = ws.getRow(4).values.slice(1);
  let row;
  ws.eachRow((r) => { if (r.getCell(1).value === firstCell) row = r.values.slice(1); });
  return Object.fromEntries(header.map((h, i) => [h, row?.[i]]));
}

try {
  await page.goto(`${APP}/registrati`);
  await page.getByLabel("Nome").fill("Osteria del Ponte");
  await page.getByLabel("Email").fill("ponte@osteria.it");
  await page.getByLabel("Password").fill("segreta123");
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL(/\/app$/);
  await page.goto(`${APP}/app/dipendenti`);
  await page.getByLabel("Nome", { exact: true }).fill("Anna");
  await page.getByLabel("Cognome").fill("Rossi");
  await page.getByLabel("PIN per il tablet").fill("4821");
  await page.getByRole("button", { name: "Aggiungi dipendente" }).click();
  await page.getByText("Anna Rossi aggiunto", { exact: false }).waitFor();

  // logo per il PDF
  const png = await sharp({ create: { width: 240, height: 120, channels: 3, background: "#1b2b44" } }).png().toBuffer();
  writeFileSync(`${SHOTS}/logo6.png`, png);
  await page.goto(`${APP}/app/impostazioni`);
  await page.locator("#f-logo").setInputFiles(`${SHOTS}/logo6.png`);
  await page.getByRole("button", { name: "Carica logo" }).click();
  await page.getByText("Logo aggiornato").waitFor();

  const anna = (await state()).employees[0].id;
  await fetch(`${FAKE}/__punches`, {
    method: "POST",
    body: JSON.stringify([
      { employee_id: anna, kind: "in", punched_at: iso("03", "08:00") },
      { employee_id: anna, kind: "out", punched_at: iso("03", "17:30") },
      { employee_id: anna, kind: "in", punched_at: iso("04", "08:00") }, // uscita dimenticata
    ]),
  });
  await fetch(`${FAKE}/__leaves`, {
    method: "POST",
    body: JSON.stringify([{ employee_id: anna, type: "ferie", start_date: `${PREV}-10`, end_date: `${PREV}-10` }]),
  });

  await step("Report si apre sul mese appena finito, da chiudere", async () => {
    await page.getByRole("link", { name: "Report", exact: true }).click();
    await page.waitForURL(/\/app\/report/);
    await page.getByRole("heading", { name: new RegExp(PREV_LABEL, "i") }).waitFor();
    await page.getByText("Da chiudere").waitFor();
  });

  await step("con timbrature da sistemare il PDF definitivo non è disponibile", async () => {
    await page.getByText("Prima del PDF definitivo sistema 1 timbratura", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "PDF definitivo per il consulente" }).count(), 0);
  });
  await page.screenshot({ path: `${SHOTS}/80-report-da-sistemare.png` });

  await step("anteprima PDF: bozza con logo, ore e ferie", async () => {
    const f = await download(() => page.getByRole("link", { name: "Anteprima PDF" }).click());
    assert.equal(f.name, `presenze-${PREV}-osteria-del-ponte-bozza.pdf`);
    const t = await pdfText(f.path);
    assert.match(t, /BOZZA - non definitivo/);
    assert.match(t, /Osteria del Ponte/);
    assert.match(t, new RegExp(`Presenze di ${PREV_LABEL}`));
    assert.match(t, /Anna Rossi\s+1\s+8:00\s+1:30/);
    assert.match(t, /08:00–\?\s.*Manca l'uscita/);
    assert.ok(f.bytes.includes(Buffer.from("/Subtype /Image")), "il PDF contiene il logo");
    assert.equal((await state()).closures.length, 0, "l'anteprima non chiude il mese");
  });

  await step("Excel: ore decimali e ferie", async () => {
    const f = await download(() => page.getByRole("link", { name: "Scarica Excel" }).click());
    assert.equal(f.name, `presenze-${PREV}-osteria-del-ponte-bozza.xlsx`);
    const r = await xlsxRow(f.path, "Riepilogo", "Anna Rossi");
    assert.equal(r["Totale ore"], 9.5);
    assert.equal(r["Straordinari"], 1.5);
    assert.equal(r["Ferie (giorni)"], 1);
    assert.equal(r["Timbrature da sistemare"], 1);
  });

  await step("sistemata l'uscita, compare il PDF definitivo con avvertenze chiare", async () => {
    await page.goto(`${APP}/app/presenze?mese=${PREV}`);
    await page.getByRole("link", { name: "Anna Rossi" }).click();
    const d4 = page.locator(`[data-day="${PREV}-04"]`);
    await d4.getByRole("button", { name: /Aggiungi l'uscita/ }).click();
    await d4.getByLabel("Ora").fill("16:00");
    await d4.getByLabel("Motivo").fill("Uscita dimenticata");
    await d4.getByRole("button", { name: "Aggiungi timbratura" }).click();
    await d4.getByText("Manca l'uscita").waitFor({ state: "detached" });
    await page.goto(`${APP}/app/report?mese=${PREV}`);
    await page.getByRole("button", { name: "PDF definitivo per il consulente" }).click();
    await page.getByText("Per riaprire il mese dovrai contattare l'assistenza.").waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/81-report-conferma.png` });

  let finalBytes;
  await step("PDF definitivo: si scarica, il mese si chiude e il PDF resta archiviato", async () => {
    const f = await download(() => page.getByRole("button", { name: new RegExp(`Scarica e chiudi ${PREV_LABEL}`, "i") }).click());
    finalBytes = f.bytes;
    assert.equal(f.name, `presenze-${PREV}-osteria-del-ponte.pdf`);
    const t = await pdfText(f.path);
    assert.match(t, /Definitivo/);
    assert.match(t, /Mese chiuso il/);
    assert.doesNotMatch(t, /BOZZA/);
    assert.match(t, /Anna Rossi\s+2\s+16:00\s+1:30/);
    const s = await state();
    assert.equal(s.closures.length, 1);
    assert.equal(s.closures[0].month, PREV);
    assert.equal(s.reportFiles.length, 1);
    await page.getByText(/Chiuso il/).waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/82-report-chiuso.png` });

  await step("il PDF inviato si riscarica identico", async () => {
    const f = await download(() => page.getByRole("link", { name: "Scarica il PDF inviato" }).click());
    assert.ok(Buffer.compare(f.bytes, finalBytes) === 0);
  });

  await step("mese chiuso: in Presenze niente correzioni", async () => {
    await page.goto(`${APP}/app/presenze?mese=${PREV}`);
    await page.getByText("Mese chiuso il", { exact: false }).waitFor();
    await page.getByRole("link", { name: "Anna Rossi" }).click();
    await page.getByText("Mese chiuso il", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Correggi|Aggiungi/ }).count(), 0);
  });

  await step("mese chiuso: in Ferie niente eliminazioni né nuove assenze", async () => {
    await page.goto(`${APP}/app/ferie?mese=${PREV}`);
    await page.getByText("Questo mese è chiuso", { exact: false }).waitFor();
    await page.getByText("mese chiuso", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^Elimina/ }).count(), 0);
    await page.getByRole("button", { name: "Aggiungi assenza" }).click();
    await page.getByLabel("Dipendente").selectOption({ label: "Anna Rossi" });
    await page.getByLabel("Dal").fill(`${PREV}-20`);
    await page.getByRole("button", { name: "Aggiungi assenza" }).click();
    await page.getByText("Il mese è chiuso", { exact: false }).first().waitFor();
    assert.equal((await state()).leaves.length, 1);
  });

  await step("cambiare le regole non cambia i numeri di un mese chiuso", async () => {
    await page.goto(`${APP}/app/impostazioni`);
    await page.getByLabel("Straordinario oltre (ore al giorno)").fill("6");
    await page.getByRole("button", { name: "Salva regole" }).click();
    await page.getByText("Regole salvate", { exact: false }).waitFor();
    await page.goto(`${APP}/app/presenze?mese=${PREV}`);
    const cells = (await page.getByRole("row", { name: /Anna Rossi/ }).locator("th, td").allTextContents()).map((t) => t.trim());
    assert.equal(cells[3], "1:30", "straordinari congelati alla chiusura");
    const f = await download(async () => { await page.goto(`${APP}/app/report?mese=${PREV}`); await page.getByRole("link", { name: "Scarica Excel" }).click(); });
    assert.equal((await xlsxRow(f.path, "Riepilogo", "Anna Rossi"))["Straordinari"], 1.5);
  });

  await step("mese in corso: niente PDF definitivo", async () => {
    await page.goto(`${APP}/app/report?mese=${CUR}`);
    await page.getByText("In corso", { exact: true }).waitFor();
    await page.getByText("Il mese è in corso", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "PDF definitivo per il consulente" }).count(), 0);
  });

  await step("smartphone: pagina Report senza scroll orizzontale", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await m.context().addCookies(await context.cookies());
    await m.goto(`${APP}/app/report?mese=${PREV}`);
    await m.screenshot({ path: `${SHOTS}/83-mobile-report.png` });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await m.close();
  });

  await step("nessun errore JavaScript nel browser", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  for (const r of results) console.log(r.join("  "));
}
