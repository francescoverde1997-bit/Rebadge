import { describe, expect, it } from "vitest";
import { isWorkingDay, leaveByDate, leaveLabel, leavePeriodLabel, leaveTotals, overlaps, type Leave } from "./leave";

const L = (o: Partial<Leave>): Leave => ({
  id: Math.random().toString(36), employee_id: "e1", type: "ferie",
  start_date: "2026-10-19", end_date: "2026-10-19", hours: null, note: null, ...o,
});
const FIVE = { workSaturday: false };
const SIX = { workSaturday: true };

describe("giorni lavorativi", () => {
  it("settimana di 5 o 6 giorni, domenica mai", () => {
    expect(isWorkingDay("2026-10-24", FIVE)).toBe(false); // sabato
    expect(isWorkingDay("2026-10-24", SIX)).toBe(true);
    expect(isWorkingDay("2026-10-25", SIX)).toBe(false);  // domenica
  });
  it("festivi e patrono non sono lavorativi", () => {
    expect(isWorkingDay("2026-12-08", FIVE)).toBe(false);
    expect(isWorkingDay("2026-06-24", { ...FIVE, patron: { monthDay: "06-24" } })).toBe(false);
  });
});

describe("totali del mese", () => {
  it("una settimana di ferie lun-dom = 5 giorni (o 6 col sabato)", () => {
    const f = [L({ start_date: "2026-10-19", end_date: "2026-10-25" })];
    expect(leaveTotals(f, "2026-10-01", "2026-10-31", FIVE).ferieDays).toBe(5);
    expect(leaveTotals(f, "2026-10-01", "2026-10-31", SIX).ferieDays).toBe(6);
  });
  it("ferie a cavallo del mese: si conta solo la parte del mese", () => {
    const f = [L({ start_date: "2026-10-29", end_date: "2026-11-04" })];
    expect(leaveTotals(f, "2026-10-01", "2026-10-31", FIVE).ferieDays).toBe(2);   // 29-30 ottobre
    expect(leaveTotals(f, "2026-11-01", "2026-11-30", FIVE).ferieDays).toBe(3);   // 2-4 novembre (1° è domenica)
  });
  it("le festività dentro le ferie non si contano", () => {
    const f = [L({ start_date: "2026-12-21", end_date: "2026-12-31" })];
    expect(leaveTotals(f, "2026-12-01", "2026-12-31", FIVE).ferieDays).toBe(8); // esclusi 25 e weekend (26 è sabato)
  });
  it("permessi a ore e a giornata", () => {
    const t = leaveTotals([
      L({ type: "permesso", hours: 2.5 }),
      L({ type: "permesso", hours: 1, start_date: "2026-10-20", end_date: "2026-10-20" }),
      L({ type: "permesso", start_date: "2026-10-21", end_date: "2026-10-21" }),
    ], "2026-10-01", "2026-10-31", FIVE);
    expect(t.permessoMinutes).toBe(210);
    expect(t.permessoDays).toBe(1);
  });
  it("permesso a ore fuori dal mese non conta", () => {
    expect(leaveTotals([L({ type: "permesso", hours: 2 })], "2026-11-01", "2026-11-30", FIVE).permessoMinutes).toBe(0);
  });
  it("la malattia conta i giorni di calendario", () => {
    const t = leaveTotals([L({ type: "malattia", start_date: "2026-10-23", end_date: "2026-10-26" })], "2026-10-01", "2026-10-31", FIVE);
    expect(t.malattiaDays).toBe(4);
  });
});

describe("calendario ed etichette", () => {
  it("mappa per data e giorni non lavorativi segnati", () => {
    const m = leaveByDate([L({ start_date: "2026-10-23", end_date: "2026-10-26" })], "2026-10-01", "2026-10-31", FIVE);
    expect([...m.keys()]).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(m.get("2026-10-24")![0].working).toBe(false);
  });
  it("etichette", () => {
    expect(leaveLabel({ type: "permesso", hours: 2.5 })).toBe("Permesso 2:30");
    expect(leaveLabel({ type: "malattia", hours: null })).toBe("Malattia");
  });
  it("sovrapposizioni: ammessi più permessi a ore nello stesso giorno", () => {
    const a = L({ start_date: "2026-10-19", end_date: "2026-10-23" });
    expect(overlaps(a, L({ start_date: "2026-10-23", end_date: "2026-10-30" }))).toBe(true);
    expect(overlaps(a, L({ start_date: "2026-10-24", end_date: "2026-10-30" }))).toBe(false);
    expect(overlaps(L({ type: "permesso", hours: 2 }), L({ type: "permesso", hours: 1 }))).toBe(false);
    expect(overlaps(L({ type: "permesso", hours: 2 }), L({ type: "ferie" }))).toBe(true);
  });
});

describe("periodo delle prossime assenze", () => {
  const fmt = (date: string) => `[${date.slice(8)}]`;
  const p = (start_date: string, end_date: string) => leavePeriodLabel({ start_date, end_date }, "2026-10-22", fmt);
  it("in corso, futura, di un giorno, finisce oggi", () => {
    expect(p("2026-10-18", "2026-10-25")).toBe("in corso fino a [25]");
    expect(p("2026-11-02", "2026-11-06")).toBe("dal [02] al [06]");
    expect(p("2026-10-29", "2026-10-29")).toBe("[29]");
    expect(p("2026-10-22", "2026-10-22")).toBe("oggi");
    expect(p("2026-10-20", "2026-10-22")).toBe("fino a oggi");
    expect(p("2026-10-22", "2026-10-24")).toBe("in corso fino a [24]");
  });
});
