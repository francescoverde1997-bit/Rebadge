import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_SETTINGS, type Punch } from "./hours/calculate";
import type { Leave } from "./leave";
import { buildMonthReport, decimalHours, hm, reportFileName } from "./report";

const TZ = "Europe/Rome";
let n = 0;
const p = (kind: "in" | "out", s: string): Punch => ({ id: `p${++n}`, kind, at: fromZonedTime(s, TZ) });
const emp = (id: string, first: string, last: string, active = true) => ({ id, first_name: first, last_name: last, active });
const leave = (o: Partial<Leave>): Leave => ({
  id: `l${++n}`, employee_id: "a", type: "ferie", start_date: "2026-10-19", end_date: "2026-10-19", hours: null, note: null, ...o,
});

const base = {
  companyName: "Bar Centrale",
  month: "2026-10",
  timeZone: TZ,
  settings: DEFAULT_SETTINGS,
  now: fromZonedTime("2026-11-02 10:00", TZ),
};

describe("report mensile", () => {
  const report = buildMonthReport({
    ...base,
    employees: [emp("b", "Bruno", "Gallo"), emp("a", "Anna", "Rossi"), emp("x", "Ex", "Dipendente", false)],
    punches: new Map([
      ["a", [
        p("in", "2026-10-05 08:00"), p("out", "2026-10-05 12:30"), p("in", "2026-10-05 13:30"), p("out", "2026-10-05 18:00"),
        p("in", "2026-10-17 22:00"), p("out", "2026-10-18 06:00"), // sabato notte → domenica
      ]],
      ["b", [p("in", "2026-10-06 07:00")]], // uscita dimenticata
    ]),
    leaves: [
      leave({ employee_id: "a", start_date: "2026-10-19", end_date: "2026-10-23" }),
      leave({ employee_id: "b", type: "permesso", start_date: "2026-10-07", end_date: "2026-10-07", hours: 2 }),
    ],
  });

  it("intestazione e dipendenti in ordine alfabetico, disattivati senza attività esclusi", () => {
    expect(report.monthLabel).toBe("ottobre 2026");
    expect(report.employees.map((e) => e.name)).toEqual(["Anna Rossi", "Bruno Gallo"]);
  });

  it("totali del dipendente: ore, straordinari, notturne, festive, ferie", () => {
    const a = report.employees[0];
    expect(a.totals.workedMinutes).toBe(540 + 480);
    expect(a.totals.overtimeMinutes).toBe(60);
    expect(a.totals.nightMinutes).toBe(480);
    expect(a.totals.holidayMinutes).toBe(360);
    expect(a.leave.ferieDays).toBe(5);
  });

  it("dettaglio giornaliero: un giorno per riga, orari leggibili, turno notturno marcato (+1)", () => {
    const a = report.employees[0];
    expect(a.days).toHaveLength(31);
    const d5 = a.days.find((d) => d.date === "2026-10-05")!;
    expect(d5.label).toBe("lun 5");
    expect(d5.entries).toBe("08:00–12:30, 13:30–18:00");
    expect(d5.workedMinutes).toBe(540);
    expect(a.days.find((d) => d.date === "2026-10-17")!.entries).toBe("22:00–06:00 (+1)");
    expect(a.days.find((d) => d.date === "2026-10-19")!.absence).toBe("Ferie");
    expect(a.days.find((d) => d.date === "2026-10-04")!.holiday).toBe("San Francesco d'Assisi");
    expect(a.days.find((d) => d.date === "2026-10-04")!.nonWorking).toBe(true);
  });

  it("anomalie segnalate nel giorno e nel totale", () => {
    const b = report.employees[1];
    const d6 = b.days.find((d) => d.date === "2026-10-06")!;
    expect(d6.entries).toBe("07:00–?");
    expect(d6.anomaly).toBe("Manca l'uscita");
    expect(report.anomalies).toBe(1);
    expect(b.leave.permessoMinutes).toBe(120);
  });

  it("totali aziendali", () => {
    expect(report.totals.workedMinutes).toBe(1020);
    expect(report.leave.ferieDays).toBe(5);
    expect(report.leave.permessoMinutes).toBe(120);
  });

  it("dipendente disattivato con ore nel mese resta nel report", () => {
    const r = buildMonthReport({
      ...base,
      employees: [emp("x", "Ex", "Dipendente", false)],
      punches: new Map([["x", [p("in", "2026-10-01 08:00"), p("out", "2026-10-01 12:00")]]]),
      leaves: [],
    });
    expect(r.employees).toHaveLength(1);
  });
});

describe("malattia nel report", () => {
  const r = buildMonthReport({
    ...base,
    employees: [emp("a", "Anna", "Rossi")],
    punches: new Map(),
    leaves: [
      leave({ employee_id: "a", type: "malattia", start_date: "2026-10-16", end_date: "2026-10-19", inps_protocol: "123456789" }),
      leave({ employee_id: "a", type: "permesso", start_date: "2026-10-22", end_date: "2026-10-22", hours: 2 }),
    ],
  });
  const a = r.employees[0];
  it("giorni di malattia separati da ferie e permessi (calendario: weekend compreso)", () => {
    expect(a.leave.malattiaDays).toBe(4);
    expect(a.leave.ferieDays).toBe(0);
    expect(a.leave.permessoDays).toBe(0);
    expect(a.leave.permessoMinutes).toBe(120);
  });
  it("giorni marcati come malattia e protocollo INPS riportato", () => {
    expect(a.days.filter((d) => d.sick).map((d) => d.date)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(a.days.find((d) => d.date === "2026-10-22")!.sick).toBe(false);
    expect(a.sickProtocols).toEqual(["123456789"]);
  });
});

describe("formati", () => {
  it("ore decimali all'italiana e ore:minuti", () => {
    expect(decimalHours(9150)).toBe("152,50");
    expect(decimalHours(20)).toBe("0,33");
    expect(hm(0)).toBe("—");
    expect(hm(450)).toBe("7:30");
  });
  it("nome del file senza accenti né spazi", () => {
    expect(reportFileName("Caffè Città & Co.", "2026-10", "pdf")).toBe("presenze-2026-10-caffe-citta-co.pdf");
    expect(reportFileName("Bar", "2026-10", "xlsx", true)).toBe("presenze-2026-10-bar-bozza.xlsx");
  });
});
