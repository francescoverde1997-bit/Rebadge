import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  calculateDays, DEFAULT_SETTINGS, formatMinutes, minutesToDecimalHours, roundToNearest, totals,
  type HoursSettings, type Punch,
} from "./calculate";
import { isHoliday, italianHolidays, workingDaysBetween } from "./holidays";

const TZ = "Europe/Rome";
let seq = 0;
const p = (kind: "in" | "out", local: string): Punch => ({
  id: `p${++seq}`, kind, at: fromZonedTime(local, TZ),
});
const NOW = fromZonedTime("2026-12-31 23:00", TZ);
const calc = (punches: Punch[], s: Partial<HoursSettings> = {}, now = NOW) =>
  calculateDays(punches, { ...DEFAULT_SETTINGS, ...s }, TZ, now);

describe("giornata standard", () => {
  it("8 ore con pausa timbrata", () => {
    const [d] = calc([
      p("in", "2026-10-19 08:00"), p("out", "2026-10-19 12:30"),
      p("in", "2026-10-19 13:30"), p("out", "2026-10-19 17:00"),
    ]);
    expect(d.date).toBe("2026-10-19");
    expect(d.workedMinutes).toBe(480);
    expect(d.overtimeMinutes).toBe(0);
    expect(d.ordinaryMinutes).toBe(480);
    expect(d.anomalies).toHaveLength(0);
  });

  it("straordinario oltre le 8 ore", () => {
    const [d] = calc([p("in", "2026-10-19 08:00"), p("out", "2026-10-19 18:15")]);
    expect(d.workedMinutes).toBe(615);
    expect(d.ordinaryMinutes).toBe(480);
    expect(d.overtimeMinutes).toBe(135);
  });

  it("soglia straordinario configurabile", () => {
    const [d] = calc([p("in", "2026-10-19 08:00"), p("out", "2026-10-19 15:00")], { dailyOvertimeAfterMinutes: 360 });
    expect(d.overtimeMinutes).toBe(60);
  });

  it("ordine delle timbrature in input non conta", () => {
    const [d] = calc([p("out", "2026-10-19 12:00"), p("in", "2026-10-19 08:00")]);
    expect(d.workedMinutes).toBe(240);
  });
});

describe("arrotondamento", () => {
  it("disattivato per default", () => {
    const [d] = calc([p("in", "2026-10-19 07:53"), p("out", "2026-10-19 17:07")]);
    expect(d.workedMinutes).toBe(554);
  });
  it("al quarto d'ora più vicino", () => {
    const [d] = calc([p("in", "2026-10-19 07:53"), p("out", "2026-10-19 17:07")], { roundingMinutes: 15 });
    expect(d.workedMinutes).toBe(540); // 08:00 → 17:00
  });
  it("roundToNearest", () => {
    expect(roundToNearest(new Date("2026-01-01T08:07:00Z"), 15).toISOString()).toBe("2026-01-01T08:00:00.000Z");
    expect(roundToNearest(new Date("2026-01-01T08:08:00Z"), 15).toISOString()).toBe("2026-01-01T08:15:00.000Z");
  });
});

describe("pausa automatica", () => {
  it("disattivata per default", () => {
    const [d] = calc([p("in", "2026-10-19 08:00"), p("out", "2026-10-19 16:00")]);
    expect(d.breakDeductedMinutes).toBe(0);
  });
  it("detrae la pausa se non timbrata e il giorno supera la soglia", () => {
    const [d] = calc([p("in", "2026-10-19 08:00"), p("out", "2026-10-19 16:30")], { autoBreakMinutes: 30 });
    expect(d.breakDeductedMinutes).toBe(30);
    expect(d.workedMinutes).toBe(480);
  });
  it("non detrae sotto soglia", () => {
    const [d] = calc([p("in", "2026-10-19 08:00"), p("out", "2026-10-19 13:00")], { autoBreakMinutes: 30 });
    expect(d.breakDeductedMinutes).toBe(0);
  });
  it("detrae solo la differenza se la pausa timbrata è più corta", () => {
    const [d] = calc([
      p("in", "2026-10-19 08:00"), p("out", "2026-10-19 12:00"),
      p("in", "2026-10-19 12:10"), p("out", "2026-10-19 16:10"),
    ], { autoBreakMinutes: 30 });
    expect(d.breakDeductedMinutes).toBe(20);
    expect(d.workedMinutes).toBe(460);
  });
  it("non detrae se la pausa timbrata basta", () => {
    const [d] = calc([
      p("in", "2026-10-19 08:00"), p("out", "2026-10-19 12:00"),
      p("in", "2026-10-19 13:00"), p("out", "2026-10-19 17:00"),
    ], { autoBreakMinutes: 30 });
    expect(d.breakDeductedMinutes).toBe(0);
  });
});

describe("turni notturni e ora legale", () => {
  it("turno a cavallo della mezzanotte resta sul giorno di entrata", () => {
    const days = calc([p("in", "2026-10-20 22:00"), p("out", "2026-10-21 06:00")]);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-10-20");
    expect(days[0].workedMinutes).toBe(480);
  });
  it("notte del cambio ora (25/10/2026): conta il tempo reale, 9 ore", () => {
    const [d] = calc([p("in", "2026-10-24 22:00"), p("out", "2026-10-25 06:00")]);
    expect(d.workedMinutes).toBe(540);
  });
  it("notte del passaggio all'ora legale (29/03/2026): 7 ore", () => {
    const [d] = calc([p("in", "2026-03-28 22:00"), p("out", "2026-03-29 06:00")]);
    expect(d.workedMinutes).toBe(420);
  });
});

describe("anomalie", () => {
  it("uscita dimenticata seguita da nuova entrata", () => {
    const days = calc([
      p("in", "2026-10-19 08:00"),
      p("in", "2026-10-20 08:00"), p("out", "2026-10-20 16:00"),
    ]);
    expect(days[0].anomalies[0].type).toBe("missing_out");
    expect(days[0].workedMinutes).toBe(0);
    expect(days[1].workedMinutes).toBe(480);
  });
  it("uscita senza entrata", () => {
    const [d] = calc([p("out", "2026-10-19 17:00")]);
    expect(d.anomalies[0].type).toBe("missing_in");
  });
  it("turno oltre la durata massima diventa anomalia", () => {
    const days = calc([p("in", "2026-10-19 08:00"), p("out", "2026-10-20 09:00")]);
    const types = days.flatMap((d) => d.anomalies.map((a) => a.type));
    expect(types).toEqual(["missing_out", "missing_in"]);
    expect(totals(days).workedMinutes).toBe(0);
  });
  it("turno aperto recente = in corso, non anomalia", () => {
    const now = fromZonedTime("2026-10-21 11:00", TZ);
    const [d] = calc([p("in", "2026-10-21 08:00")], {}, now);
    expect(d.inProgress).toBe(true);
    expect(d.anomalies).toHaveLength(0);
  });
  it("turno aperto vecchio = uscita dimenticata", () => {
    const now = fromZonedTime("2026-10-22 11:00", TZ);
    const [d] = calc([p("in", "2026-10-21 08:00")], {}, now);
    expect(d.inProgress).toBe(false);
    expect(d.anomalies[0].type).toBe("missing_out");
  });
});

describe("totali e formati", () => {
  it("somma più giorni", () => {
    const t = totals(calc([
      p("in", "2026-10-19 08:00"), p("out", "2026-10-19 17:00"),
      p("in", "2026-10-20 08:00"), p("out", "2026-10-20 16:00"),
    ]));
    expect(t).toEqual({
      workedMinutes: 1020, ordinaryMinutes: 960, overtimeMinutes: 60, nightMinutes: 0, holidayMinutes: 0,
      daysWorked: 2, anomalies: 0,
    });
  });
  it("formatta minuti", () => {
    expect(formatMinutes(450)).toBe("7:30");
    expect(formatMinutes(5)).toBe("0:05");
    expect(minutesToDecimalHours(450)).toBe(7.5);
    expect(minutesToDecimalHours(20)).toBe(0.33);
  });
});

describe("festività italiane", () => {
  it("Pasqua e Pasquetta", () => {
    expect(italianHolidays(2026).get("2026-04-05")).toBe("Pasqua");
    expect(italianHolidays(2026).get("2026-04-06")).toBe("Lunedì dell'Angelo");
    expect(italianHolidays(2027).get("2027-03-28")).toBe("Pasqua");
  });
  it("San Francesco dal 2026", () => {
    expect(italianHolidays(2026).has("2026-10-04")).toBe(true);
    expect(italianHolidays(2025).has("2025-10-04")).toBe(false);
  });
  it("patrono: nome e giorni lavorativi", () => {
    const patron = { monthDay: "12-07", name: "Sant'Ambrogio" };
    expect(isHoliday("2026-12-07", patron)).toBe("Sant'Ambrogio");
    expect(isHoliday("2026-12-07", { monthDay: "12-07" })).toBe("Santo Patrono");
    expect(isHoliday("2026-12-07")).toBeUndefined();
    expect(workingDaysBetween("2026-12-07", "2026-12-09", patron)).toEqual(["2026-12-09"]); // 8 = Immacolata
  });
  it("giorni lavorativi escludono weekend e festivi", () => {
    // 21–31 dicembre 2026: esclusi weekend (26-27) e Natale (25) e S. Stefano (26, sabato)
    expect(workingDaysBetween("2026-12-21", "2026-12-31")).toEqual([
      "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
    ]);
  });
});

describe("ore notturne e festive", () => {
  it("turno di giorno feriale: niente notturno né festivo", () => {
    const [d] = calc([p("in", "2026-10-21 08:00"), p("out", "2026-10-21 17:00")]); // mercoledì
    expect([d.nightMinutes, d.holidayMinutes]).toEqual([0, 0]);
  });
  it("turno serale: solo le ore dopo le 22", () => {
    const [d] = calc([p("in", "2026-10-21 18:00"), p("out", "2026-10-21 23:30")]);
    expect(d.nightMinutes).toBe(90);
  });
  it("turno notturno completo 22-06: tutto notturno", () => {
    const [d] = calc([p("in", "2026-10-21 22:00"), p("out", "2026-10-22 06:00")]);
    expect(d.nightMinutes).toBe(480);
  });
  it("prima mattina: notturno fino alle 6", () => {
    const [d] = calc([p("in", "2026-10-21 04:30"), p("out", "2026-10-21 12:00")]);
    expect(d.nightMinutes).toBe(90);
  });
  it("notte del cambio d'ora (25/10): 9 ore reali, tutte notturne", () => {
    const [d] = calc([p("in", "2026-10-24 22:00"), p("out", "2026-10-25 06:00")]);
    expect(d.workedMinutes).toBe(540);
    expect(d.nightMinutes).toBe(540);
  });
  it("fascia notturna configurabile (00-06, come in alcuni contratti)", () => {
    const [d] = calc([p("in", "2026-10-21 22:00"), p("out", "2026-10-22 06:00")], { nightStartMinutes: 0, nightEndMinutes: 360 });
    expect(d.nightMinutes).toBe(360);
  });
  it("fascia notturna disattivata (inizio = fine)", () => {
    const [d] = calc([p("in", "2026-10-21 22:00"), p("out", "2026-10-22 06:00")], { nightStartMinutes: 0, nightEndMinutes: 0 });
    expect(d.nightMinutes).toBe(0);
  });
  it("domenica: tutto festivo", () => {
    const [d] = calc([p("in", "2026-10-18 09:00"), p("out", "2026-10-18 13:00")]);
    expect(d.holidayMinutes).toBe(240);
  });
  it("festività nazionale infrasettimanale (8 dicembre)", () => {
    const [d] = calc([p("in", "2026-12-08 10:00"), p("out", "2026-12-08 14:00")]);
    expect(d.holidayMinutes).toBe(240);
  });
  it("sabato notte → domenica: festive solo dopo mezzanotte", () => {
    const [d] = calc([p("in", "2026-10-17 22:00"), p("out", "2026-10-18 06:00")]);
    expect(d.date).toBe("2026-10-17");
    expect(d.holidayMinutes).toBe(360);
    expect(d.nightMinutes).toBe(480);
  });
  it("domenica sera → lunedì: festive fino a mezzanotte", () => {
    const [d] = calc([p("in", "2026-10-18 20:00"), p("out", "2026-10-19 02:00")]);
    expect(d.holidayMinutes).toBe(240);
    expect(d.nightMinutes).toBe(240);
  });
  it("con la pausa automatica le notturne non superano il lavorato", () => {
    const [d] = calc([p("in", "2026-10-21 22:00"), p("out", "2026-10-22 06:00")], { autoBreakMinutes: 30 });
    expect(d.workedMinutes).toBe(450);
    expect(d.nightMinutes).toBe(450);
  });
  it("arrotondamento applicato anche alle notturne", () => {
    const [d] = calc([p("in", "2026-10-21 21:53"), p("out", "2026-10-21 23:07")], { roundingMinutes: 15 });
    expect(d.nightMinutes).toBe(60); // 22:00 → 23:00
  });
  it("Santo Patrono dell'azienda conta come festivo", () => {
    const patron = { monthDay: "06-24", name: "San Giovanni" };
    const [d] = calc([p("in", "2026-06-24 08:00"), p("out", "2026-06-24 12:00")], { patron }); // mercoledì
    expect(d.holidayMinutes).toBe(240);
    const [n] = calc([p("in", "2026-06-24 08:00"), p("out", "2026-06-24 12:00")]);
    expect(n.holidayMinutes).toBe(0);
  });
  it("il titolare può disattivare notturne e festive", () => {
    const [d] = calc([p("in", "2026-10-17 22:00"), p("out", "2026-10-18 06:00")], { trackNight: false, trackHoliday: false });
    expect([d.nightMinutes, d.holidayMinutes, d.workedMinutes]).toEqual([0, 0, 480]);
  });
  it("totali del periodo", () => {
    const t = totals(calc([
      p("in", "2026-10-17 22:00"), p("out", "2026-10-18 06:00"),
      p("in", "2026-10-18 20:00"), p("out", "2026-10-19 02:00"),
    ]));
    expect([t.nightMinutes, t.holidayMinutes]).toEqual([720, 600]);
  });
});
