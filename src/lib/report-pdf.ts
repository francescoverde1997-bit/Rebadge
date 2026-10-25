/**
 * PDF del report mensile (A4 verticale): prima pagina con il riepilogo aziendale,
 * poi una pagina per dipendente con il dettaglio giorno per giorno.
 */
import { jsPDF } from "jspdf";
import autoTable, { type CellHookData, type RowInput } from "jspdf-autotable";
import { decimalHours, hm, type MonthReport, type ReportEmployee } from "./report";

export interface PdfOptions {
  status: { kind: "draft" } | { kind: "final"; closedAtLabel: string };
  generatedAtLabel: string;           // "2 novembre 2026, 10:15"
  logo?: { png: Uint8Array; width: number; height: number } | null;
}

const INK: [number, number, number] = [27, 43, 68];
const SOFT: [number, number, number] = [74, 90, 112];
const LINE: [number, number, number] = [221, 226, 234];
const PAPER: [number, number, number] = [244, 246, 249];
const WARN: [number, number, number] = [168, 106, 12];
const DANGER: [number, number, number] = [179, 38, 47];
const DANGER_SOFT: [number, number, number] = [251, 230, 231]; // sfondo dei giorni di malattia
const M = 14; // margine mm

function leaveCells(e: { leave: ReportEmployee["leave"] }) {
  const l = e.leave;
  return [
    l.ferieDays ? String(l.ferieDays) : "—",
    l.permessoMinutes ? hm(l.permessoMinutes) : "—",
    l.permessoDays ? String(l.permessoDays) : "—",
    l.malattiaDays ? String(l.malattiaDays) : "—",
    l.altroDays ? String(l.altroDays) : "—",
  ];
}

export function buildReportPdf(report: MonthReport, opts: PdfOptions): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({
    title: `Presenze ${report.monthLabel} - ${report.companyName}`,
    subject: "Report mensile delle presenze",
    creator: "ReBadge",
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const draft = opts.status.kind === "draft";

  const header = () => {
    let x = M;
    if (opts.logo) {
      const h = 13, w = Math.min(36, (opts.logo.width / opts.logo.height) * h);
      doc.addImage(opts.logo.png, "PNG", M, 10, w, h);
      x = M + w + 4;
    }
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(14);
    doc.text(report.companyName, x, 15.5, { maxWidth: W - x - 70 });
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...SOFT);
    doc.text(`Presenze di ${report.monthLabel}`, x, 21);
    doc.setFontSize(9).setFont("helvetica", "bold");
    if (draft) {
      doc.setTextColor(...DANGER).text("BOZZA - non definitivo", W - M, 15.5, { align: "right" });
      doc.setFont("helvetica", "normal").setTextColor(...SOFT).text("Anteprima per controllo", W - M, 20.5, { align: "right" });
    } else if (opts.status.kind === "final") {
      doc.setTextColor(...INK).text("Definitivo", W - M, 15.5, { align: "right" });
      doc.setFont("helvetica", "normal").setTextColor(...SOFT).text(`Mese chiuso il ${opts.status.closedAtLabel}`, W - M, 20.5, { align: "right" });
    }
    doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, 26, W - M, 26);
  };

  const tableStyles = {
    theme: "plain" as const,
    styles: { font: "helvetica", fontSize: 8, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 }, lineColor: LINE, lineWidth: 0 },
    headStyles: { fontStyle: "bold" as const, textColor: SOFT, fillColor: [255, 255, 255] as [number, number, number], lineWidth: { bottom: 0.3 }, lineColor: LINE },
    margin: { top: 32, left: M, right: M, bottom: 18 },
    didDrawPage: header,
  };

  // ---------- Pagina 1: riepilogo ----------
  header();
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(12).text("Riepilogo del mese", M, 34);

  const head = ["Dipendente", "Giorni", "Ordinarie", "Straord."];
  if (report.showNight) head.push("di cui nott.");
  if (report.showHoliday) head.push("di cui fest.");
  head.push("Totale", "Totale (dec.)", "Ferie gg", "Perm. ore", "Perm. gg", "Malattia gg", "Altre gg");
  const row = (name: string, t: ReportEmployee["totals"], e: { leave: ReportEmployee["leave"] }, days: string) => {
    const r = [name, days, hm(t.ordinaryMinutes), hm(t.overtimeMinutes)];
    if (report.showNight) r.push(hm(t.nightMinutes));
    if (report.showHoliday) r.push(hm(t.holidayMinutes));
    r.push(hm(t.workedMinutes), decimalHours(t.workedMinutes), ...leaveCells(e));
    return r;
  };
  const sickCol = head.indexOf("Malattia gg");
  const body: RowInput[] = report.employees.map((e) => row(e.name, e.totals, e, String(e.totals.daysWorked)));
  autoTable(doc, {
    ...tableStyles,
    startY: 38,
    head: [head],
    body,
    foot: [row("Totale", report.totals, report, "")],
    footStyles: { fontStyle: "bold", textColor: INK, fillColor: PAPER },
    columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }])) as Record<number, { halign: "left" | "right" }>,
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: LINE },
    // la malattia in rosso, separata da ferie e permessi
    didParseCell: (data: CellHookData) => {
      if (data.column.index !== sickCol) return;
      if (data.section === "head" || String(data.cell.raw) !== "—") {
        data.cell.styles.textColor = DANGER;
        if (data.section !== "head") data.cell.styles.fontStyle = "bold";
      }
    },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...SOFT);
  const notes = [
    "Ore in ore:minuti (152:30 = 152 ore e 30 minuti). \"Totale (dec.)\" riporta le stesse ore in forma decimale.",
    "Ordinarie + straordinari = totale. Le ore notturne e festive sono già comprese nel totale (\"di cui\").",
    "Ferie e permessi a giornata in giorni lavorativi; malattia (in rosso) in giorni di calendario. Un turno conta nel giorno in cui inizia.",
  ];
  for (const n of notes) { doc.text(n, M, y, { maxWidth: W - 2 * M }); y += 4.2; }
  if (report.anomalies > 0) {
    doc.setTextColor(...DANGER).setFont("helvetica", "bold");
    doc.text(`Attenzione: ${report.anomalies} timbrature da sistemare. I turni incompleti non sono conteggiati.`, M, y + 1.5);
  }

  // ---------- Una pagina per dipendente ----------
  for (const e of report.employees) {
    doc.addPage();
    header();
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(13).text(e.name, M, 35);

    const kv: [string, string][] = [
      ["Ore lavorate", `${hm(e.totals.workedMinutes)} (${decimalHours(e.totals.workedMinutes)})`],
      ["Ordinarie", hm(e.totals.ordinaryMinutes)],
      ["Straordinari", hm(e.totals.overtimeMinutes)],
    ];
    if (report.showNight) kv.push(["di cui notturne", hm(e.totals.nightMinutes)]);
    if (report.showHoliday) kv.push(["di cui festive", hm(e.totals.holidayMinutes)]);
    kv.push(["Giorni lavorati", String(e.totals.daysWorked)]);
    const lv: [string, string][] = [
      ["Ferie", e.leave.ferieDays ? `${e.leave.ferieDays} gg` : "—"],
      ["Permessi", [e.leave.permessoMinutes && `${hm(e.leave.permessoMinutes)} ore`, e.leave.permessoDays && `${e.leave.permessoDays} gg`].filter(Boolean).join(" + ") || "—"],
      ["Malattia", e.leave.malattiaDays ? `${e.leave.malattiaDays} gg` : "—"],
      ["Altre assenze", e.leave.altroDays ? `${e.leave.altroDays} gg` : "—"],
    ];
    autoTable(doc, {
      ...tableStyles,
      startY: 39,
      head: [kv.map((k) => k[0])],
      body: [kv.map((k) => k[1])],
      bodyStyles: { fontStyle: "bold", fontSize: 9.5 },
      headStyles: { ...tableStyles.headStyles, lineWidth: 0 },
      tableLineWidth: 0.2, tableLineColor: LINE,
    });
    const sickIdx = lv.findIndex((k) => k[0] === "Malattia");
    autoTable(doc, {
      ...tableStyles,
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2,
      head: [lv.map((k) => k[0])],
      body: [lv.map((k) => k[1])],
      bodyStyles: { fontStyle: "bold", fontSize: 9.5 },
      headStyles: { ...tableStyles.headStyles, lineWidth: 0 },
      tableLineWidth: 0.2, tableLineColor: LINE,
      didParseCell: (data: CellHookData) => {
        if (data.column.index === sickIdx && e.leave.malattiaDays) data.cell.styles.textColor = DANGER;
      },
    });
    if (e.sickProtocols.length) {
      const yy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4.5;
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...DANGER);
      doc.text(`Malattia - protocollo certificato INPS: ${e.sickProtocols.join(", ")}`, M, yy, { maxWidth: W - 2 * M });
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY = yy;
    }

    const dHead = ["Giorno", "Entrate e uscite", "Ore", "Straord."];
    if (report.showNight) dHead.push("Nott.");
    if (report.showHoliday) dHead.push("Fest.");
    dHead.push("Assenze e note");
    const dBody = e.days.map((d) => {
      const z = (m: number) => (m ? hm(m) : ""); // nel dettaglio gli zeri restano vuoti
      const r = [d.label, d.entries || "", z(d.workedMinutes), z(d.overtimeMinutes)];
      if (report.showNight) r.push(z(d.nightMinutes));
      if (report.showHoliday) r.push(z(d.holidayMinutes));
      r.push([d.absence, d.anomaly, d.holiday].filter(Boolean).join(" - "));
      return r;
    });
    const notesCol = dHead.length - 1;
    autoTable(doc, {
      ...tableStyles,
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5,
      head: [dHead],
      body: dBody,
      styles: { ...tableStyles.styles, fontSize: 7.6, cellPadding: { top: 0.9, bottom: 0.9, left: 1.6, right: 1.6 } },
      bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: LINE },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 58 },
        ...Object.fromEntries(Array.from({ length: notesCol - 2 }, (_, i) => [i + 2, { halign: "right" as const, cellWidth: 14 }])),
      },
      didParseCell: (data: CellHookData) => {
        if (data.section !== "body") return;
        const day = e.days[data.row.index];
        if (day.nonWorking) data.cell.styles.fillColor = PAPER;
        if (day.sick) data.cell.styles.fillColor = DANGER_SOFT;
        if (day.anomaly && (data.column.index === notesCol || data.column.index === 1)) data.cell.styles.textColor = DANGER;
        else if (day.sick && (data.column.index === notesCol || data.column.index === 0)) {
          data.cell.styles.textColor = DANGER;
          data.cell.styles.fontStyle = "bold";
        } else if (day.absence && data.column.index === notesCol) data.cell.styles.textColor = WARN;
      },
    });

    // firma
    const fy = Math.min((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14, H - 24);
    doc.setDrawColor(...SOFT).setLineWidth(0.2);
    doc.line(M, fy, M + 70, fy);
    doc.line(W - M - 70, fy, W - M, fy);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...SOFT);
    doc.text("Firma del dipendente", M, fy + 4);
    doc.text("Firma del datore di lavoro", W - M - 70, fy + 4);
  }

  // ---------- piè di pagina su tutte le pagine ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...SOFT);
    doc.text(`Generato il ${opts.generatedAtLabel} con ReBadge`, M, H - 9);
    doc.text(`Pagina ${i} di ${pages}`, W - M, H - 9, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
