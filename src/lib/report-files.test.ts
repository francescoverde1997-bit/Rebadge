import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_SETTINGS, type Punch } from "./hours/calculate";
import { buildMonthReport } from "./report";
import { buildReportPdf } from "./report-pdf";
import { buildReportXlsx } from "./report-xlsx";
import { pdfText as readPdfText } from "../../scripts/pdf-text.mjs";

const TZ = "Europe/Rome";
let n = 0;
const p = (kind: "in" | "out", s: string): Punch => ({ id: `p${++n}`, kind, at: fromZonedTime(s, TZ) });

const report = buildMonthReport({
  companyName: "Caffè Città",
  month: "2026-10",
  timeZone: TZ,
  settings: DEFAULT_SETTINGS,
  now: fromZonedTime("2026-11-02 10:00", TZ),
  employees: [
    { id: "a", first_name: "Anna", last_name: "Rossi", active: true },
    { id: "b", first_name: "Bruno", last_name: "Gallo", active: true },
  ],
  punches: new Map([
    ["a", [p("in", "2026-10-05 08:00"), p("out", "2026-10-05 17:30"), p("in", "2026-10-17 22:00"), p("out", "2026-10-18 06:00")]],
    ["b", [p("in", "2026-10-06 07:00"), p("out", "2026-10-06 15:00")]],
  ]),
  leaves: [
    { id: "l1", employee_id: "b", type: "ferie", start_date: "2026-10-19", end_date: "2026-10-23", hours: null, note: null },
    { id: "l2", employee_id: "a", type: "malattia", start_date: "2026-10-26", end_date: "2026-10-28", hours: null, note: null, inps_protocol: "987654321" },
  ],
});

const dir = mkdtempSync(join(tmpdir(), "report-"));
const pdfText = (bytes: Uint8Array): Promise<string> => {
  const f = join(dir, `r${++n}.pdf`);
  writeFileSync(f, bytes);
  return readPdfText(f);
};

describe("PDF", () => {
  it("bozza: intestazione, riepilogo, una pagina per dipendente, accenti corretti", async () => {
    const logoPng = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#24508a" } }).png().toBuffer();
    const bytes = buildReportPdf(report, {
      status: { kind: "draft" },
      generatedAtLabel: "2 novembre 2026, 10:00",
      logo: { png: new Uint8Array(logoPng), width: 200, height: 100 },
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const t = await pdfText(bytes);
    expect(t).toContain("Caffè Città");
    expect(t).toContain("Presenze di ottobre 2026");
    expect(t).toContain("BOZZA - non definitivo");
    expect(t).toContain("Riepilogo del mese");
    // 5/10: 8:00–17:30 = 9:30 (1:30 straordinario); 17/10: 22–06 = 8:00 notturne, 6:00 festive
    expect(t).toMatch(/Anna Rossi\s+2\s+16:00\s+1:30\s+8:00\s+6:00\s+17:30\s+17,50/);
    expect(t).toContain("22:00–06:00 (+1)");
    expect(t).toContain("Firma del dipendente");
    expect(t).toContain("Generato il 2 novembre 2026, 10:00 con ReBadge");
    expect(t).toContain("Pagina 3 di 3");
    expect(t).toMatch(/lun 19.*Ferie/);
    expect(t).toMatch(/lun 26.*Malattia/);
    expect(t).toContain("Malattia - protocollo certificato INPS: 987654321");
    expect(t).toContain("malattia (in rosso)");
  });

  it("definitivo: data di chiusura, nessuna scritta bozza", async () => {
    const t = await pdfText(buildReportPdf(report, { status: { kind: "final", closedAtLabel: "2 novembre 2026" }, generatedAtLabel: "x" }));
    expect(t).toContain("Mese chiuso il 2 novembre 2026");
    expect(t).not.toContain("BOZZA");
  });
});

describe("Excel", () => {
  it("riepilogo con ore decimali e foglio giornaliero", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await buildReportXlsx(report, "Bozza")) as unknown as ArrayBuffer);
    const s = wb.getWorksheet("Riepilogo")!;
    expect(s.getCell("A1").value).toBe("Caffè Città");
    const header = (s.getRow(4).values as unknown[]).slice(1);
    expect(header).toContain("Totale ore");
    const anna = (s.getRow(5).values as unknown[]).slice(1);
    expect(anna[0]).toBe("Anna Rossi");
    expect(anna[header.indexOf("Totale ore")]).toBe(17.5);
    expect(anna[header.indexOf("di cui notturne")]).toBe(8);
    const bruno = (s.getRow(6).values as unknown[]).slice(1);
    expect(bruno[header.indexOf("Ferie (giorni)")]).toBe(5);
    // malattia: colonna separata, in rosso, con il protocollo INPS
    const mal = header.indexOf("Malattia (giorni)");
    expect(anna[mal]).toBe(3);
    expect(bruno[mal]).toBe(0);
    expect(anna[header.indexOf("Protocolli certificati INPS")]).toBe("987654321");
    expect(s.getRow(5).getCell(mal + 1).font?.color?.argb).toBe("FFB3262F");
    const total = (s.getRow(7).values as unknown[]).slice(1);
    expect(total[0]).toBe("Totale");
    expect(total[header.indexOf("Totale ore")]).toBe(25.5);

    const d = wb.getWorksheet("Giornaliero")!;
    expect(d.rowCount).toBe(1 + 31 * 2);
    const row = (d.getRow(6).values as unknown[]).slice(1); // Anna, 5 ottobre
    expect(row[3]).toBe("08:00–17:30");
    expect(row[4]).toBe(9.5);
  });
});
