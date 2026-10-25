/**
 * Excel del report mensile: un foglio di riepilogo e un foglio giornaliero.
 * Le ore sono numeri decimali (7,50) così il consulente può sommarle o importarle.
 */
import ExcelJS from "exceljs";
import type { MonthReport } from "./report";

const dec = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export async function buildReportXlsx(report: MonthReport, statusLabel: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ReBadge";
  wb.created = new Date();

  // ---------- Riepilogo ----------
  const s = wb.addWorksheet("Riepilogo", { views: [{ state: "frozen", ySplit: 4 }] });
  s.addRow([report.companyName]).font = { bold: true, size: 14 };
  s.addRow([`Presenze di ${report.monthLabel}`, "", "", statusLabel]);
  s.addRow(["Ore in forma decimale (7,50 = 7 ore e 30 minuti). Notturne e festive sono già comprese nel totale."]).font = { italic: true, color: { argb: "FF4A5A70" } };

  const cols: { header: string; key: string; width: number; hours?: boolean }[] = [
    { header: "Dipendente", key: "name", width: 26 },
    { header: "Giorni lavorati", key: "days", width: 10 },
    { header: "Ore ordinarie", key: "ord", width: 12, hours: true },
    { header: "Straordinari", key: "ot", width: 12, hours: true },
  ];
  if (report.showNight) cols.push({ header: "di cui notturne", key: "night", width: 12, hours: true });
  if (report.showHoliday) cols.push({ header: "di cui festive", key: "hol", width: 12, hours: true });
  cols.push(
    { header: "Totale ore", key: "tot", width: 12, hours: true },
    { header: "Ferie (giorni)", key: "ferie", width: 11 },
    { header: "Permessi (ore)", key: "permH", width: 11, hours: true },
    { header: "Permessi (giorni)", key: "permD", width: 11 },
    { header: "Malattia (giorni)", key: "mal", width: 11 },
    { header: "Protocolli certificati INPS", key: "prot", width: 24 },
    { header: "Altre assenze (giorni)", key: "altro", width: 12 },
    { header: "Timbrature da sistemare", key: "an", width: 13 },
  );
  const headerRow = s.addRow(cols.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.alignment = { wrapText: true, vertical: "middle" };
  headerRow.height = 32;
  headerRow.getCell(cols.findIndex((c) => c.key === "mal") + 1).font = { bold: true, color: { argb: "FFB3262F" } };
  cols.forEach((c, i) => { s.getColumn(i + 1).width = c.width; });

  const values = (name: string, t: MonthReport["totals"], l: MonthReport["leave"], days: number | null): Record<string, string | number | null> => ({
    name, days, ord: dec(t.ordinaryMinutes), ot: dec(t.overtimeMinutes), night: dec(t.nightMinutes), hol: dec(t.holidayMinutes),
    tot: dec(t.workedMinutes), ferie: l.ferieDays, permH: dec(l.permessoMinutes), permD: l.permessoDays,
    mal: l.malattiaDays, prot: null, altro: l.altroDays, an: t.anomalies,
  });
  const RED = { argb: "FFB3262F" };
  const malCol = cols.findIndex((c) => c.key === "mal") + 1;
  for (const e of report.employees) {
    const v: Record<string, string | number | null> = { ...values(e.name, e.totals, e.leave, e.totals.daysWorked), prot: e.sickProtocols.join(", ") || null };
    const r = s.addRow(cols.map((c) => v[c.key]));
    if (e.leave.malattiaDays) r.getCell(malCol).font = { bold: true, color: RED };
  }
  const v = values("Totale", report.totals, report.leave, null);
  const totalRow = s.addRow(cols.map((c) => v[c.key]));
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => { cell.border = { top: { style: "thin" } }; });
  cols.forEach((c, i) => { if (c.hours) s.getColumn(i + 1).numFmt = "0.00"; });

  // ---------- Giornaliero ----------
  const d = wb.addWorksheet("Giornaliero", { views: [{ state: "frozen", ySplit: 1 }] });
  const dcols: { header: string; key: string; width: number; hours?: boolean }[] = [
    { header: "Dipendente", key: "name", width: 24 },
    { header: "Data", key: "date", width: 11 },
    { header: "Giorno", key: "label", width: 9 },
    { header: "Entrate e uscite", key: "entries", width: 30 },
    { header: "Ore lavorate", key: "worked", width: 11, hours: true },
    { header: "Straordinari", key: "ot", width: 11, hours: true },
  ];
  if (report.showNight) dcols.push({ header: "Notturne", key: "night", width: 10, hours: true });
  if (report.showHoliday) dcols.push({ header: "Festive", key: "hol", width: 10, hours: true });
  dcols.push(
    { header: "Assenza", key: "absence", width: 16 },
    { header: "Festività", key: "holiday", width: 20 },
    { header: "Da sistemare", key: "anomaly", width: 16 },
  );
  d.addRow(dcols.map((c) => c.header)).font = { bold: true };
  dcols.forEach((c, i) => { d.getColumn(i + 1).width = c.width; });
  for (const e of report.employees) {
    for (const day of e.days) {
      const [y, m, dd] = day.date.split("-").map(Number);
      const row: Record<string, string | number | Date | null> = {
        name: e.name, date: new Date(Date.UTC(y, m - 1, dd)), label: day.label, entries: day.entries || null,
        worked: day.workedMinutes ? dec(day.workedMinutes) : null, ot: day.overtimeMinutes ? dec(day.overtimeMinutes) : null,
        night: day.nightMinutes ? dec(day.nightMinutes) : null, hol: day.holidayMinutes ? dec(day.holidayMinutes) : null,
        absence: day.absence, holiday: day.holiday, anomaly: day.anomaly,
      };
      const dr = d.addRow(dcols.map((c) => row[c.key]));
      if (day.sick) dr.getCell(dcols.findIndex((c) => c.key === "absence") + 1).font = { bold: true, color: { argb: "FFB3262F" } };
    }
  }
  d.getColumn(2).numFmt = "dd/mm/yyyy";
  dcols.forEach((c, i) => { if (c.hours) d.getColumn(i + 1).numFmt = "0.00"; });
  d.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: dcols.length } };

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
