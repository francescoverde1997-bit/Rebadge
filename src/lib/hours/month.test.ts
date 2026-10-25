import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_SETTINGS, type Punch } from "./calculate";
import {
  groupByWeek, currentMonth, currentStatus, daysOfMonth, fetchWindow, monthBounds, monthLabel, parseMonth, shiftMonth,
  summarizeMonth, toHoursSettings,
} from "./month";

const TZ = "Europe/Rome";
const at = (s: string) => fromZonedTime(s, TZ);
let n = 0;
const p = (kind: "in" | "out", s: string): Punch => ({ id: `p${++n}`, kind, at: at(s) });
const NOW = at("2026-10-22 10:00");

describe("mese", () => {
  it("mese corrente nel fuso aziendale (non UTC)", () => {
    // 31 ottobre 23:30 UTC = 1 novembre 00:30 a Roma (ora solare)
    expect(currentMonth(TZ, new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });
  it("parseMonth accetta solo mesi validi e non futuri", () => {
    expect(parseMonth("2026-09", TZ, NOW)).toBe("2026-09");
    expect(parseMonth("2026-13", TZ, NOW)).toBe("2026-10");
    expect(parseMonth("2027-01", TZ, NOW)).toBe("2026-10");
    expect(parseMonth("ciao", TZ, NOW)).toBe("2026-10");
    expect(parseMonth(undefined, TZ, NOW)).toBe("2026-10");
    // per pianificare le ferie si può andare avanti fino a 12 mesi
    expect(parseMonth("2027-01", TZ, NOW, 12)).toBe("2027-01");
    expect(parseMonth("2027-11", TZ, NOW, 12)).toBe("2026-10");
  });
  it("shiftMonth attraversa l'anno", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("confini del mese con il cambio d'ora", () => {
    const { start, end } = monthBounds("2026-10", TZ);
    expect(start.toISOString()).toBe("2026-09-30T22:00:00.000Z"); // ora legale
    expect(end.toISOString()).toBe("2026-10-31T23:00:00.000Z");   // ora solare
  });
  it("finestra di caricamento allargata del turno massimo", () => {
    const w = fetchWindow("2026-10", TZ, 960);
    expect(w.from.toISOString()).toBe("2026-09-30T06:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-01T15:00:00.000Z");
  });
  it("giorni del mese ed etichetta", () => {
    expect(daysOfMonth("2028-02")).toHaveLength(29);
    expect(daysOfMonth("2026-10").at(-1)).toBe("2026-10-31");
    expect(monthLabel("2026-10")).toBe("ottobre 2026");
  });
});

describe("riepilogo mensile", () => {
  it("considera solo i giorni del mese, anche con turni a cavallo", () => {
    const s = summarizeMonth([
      p("in", "2026-09-30 22:00"), p("out", "2026-10-01 06:00"), // turno del 30 settembre
      p("in", "2026-10-01 08:00"), p("out", "2026-10-01 17:00"),
      p("in", "2026-10-31 22:00"), p("out", "2026-11-01 06:00"), // turno del 31 ottobre (ora solare)
    ], DEFAULT_SETTINGS, TZ, "2026-10", NOW);
    expect(s.days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(s.totals.workedMinutes).toBe(540 + 480);
    expect(s.totals.overtimeMinutes).toBe(60);
  });
  it("un'uscita isolata all'inizio della finestra non sporca il mese", () => {
    const s = summarizeMonth([p("out", "2026-09-30 10:00"), p("in", "2026-10-02 08:00"), p("out", "2026-10-02 12:00")],
      DEFAULT_SETTINGS, TZ, "2026-10", NOW);
    expect(s.totals.anomalies).toBe(0);
    expect(s.totals.workedMinutes).toBe(240);
  });
  it("converte le impostazioni dal database", () => {
    expect(toHoursSettings({
      rounding_minutes: 15, auto_break_minutes: 30, auto_break_after_minutes: 360,
      daily_overtime_after_minutes: 450, max_shift_minutes: 960,
    })).toEqual({
      roundingMinutes: 15, autoBreakMinutes: 30, autoBreakAfterMinutes: 360, dailyOvertimeAfterMinutes: 450,
      maxShiftMinutes: 960, nightStartMinutes: 1320, nightEndMinutes: 360, trackNight: true, trackHoliday: true, patron: null, workSaturday: false,
    });
  });
});

describe("chi è al lavoro adesso", () => {
  it("entrata recente = presente da quell'ora", () => {
    const s = currentStatus([p("out", "2026-10-21 17:00"), p("in", "2026-10-22 08:02")], 960, NOW);
    expect(s.present).toBe(true);
    expect(s.since?.toISOString()).toBe(at("2026-10-22 08:02").toISOString());
  });
  it("uscito = non presente", () => {
    expect(currentStatus([p("in", "2026-10-22 06:00"), p("out", "2026-10-22 09:00")], 960, NOW).present).toBe(false);
  });
  it("entrata troppo vecchia (uscita dimenticata) = non presente", () => {
    expect(currentStatus([p("in", "2026-10-21 08:00")], 960, NOW).present).toBe(false);
  });
  it("nessuna timbratura = non presente", () => {
    expect(currentStatus([], 960, NOW)).toEqual({ present: false, since: null });
  });
});

describe("settimane del dettaglio dipendente", () => {
  const d = (date: string) => ({ date });
  it("raggruppa da lunedì a domenica, nell'ordine ricevuto (dal più recente)", () => {
    const weeks = groupByWeek([d("2026-10-22"), d("2026-10-19"), d("2026-10-18"), d("2026-10-12"), d("2026-10-11")]);
    expect(weeks.map((w) => [w.start, w.end, w.items.map((i) => i.date)])).toEqual([
      ["2026-10-19", "2026-10-25", ["2026-10-22", "2026-10-19"]],
      ["2026-10-12", "2026-10-18", ["2026-10-18", "2026-10-12"]],
      ["2026-10-05", "2026-10-11", ["2026-10-11"]],
    ]);
  });
  it("settimana a cavallo di due mesi e del cambio d'ora", () => {
    expect(groupByWeek([d("2026-11-01"), d("2026-10-26"), d("2026-10-25")]).map((w) => w.start))
      .toEqual(["2026-10-26", "2026-10-19"]);
  });
  it("nessun giorno, nessuna settimana", () => {
    expect(groupByWeek([])).toEqual([]);
  });
});
