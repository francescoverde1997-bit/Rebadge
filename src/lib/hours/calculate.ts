/**
 * Motore di calcolo ore — funzioni pure, nessuna dipendenza da database o UI.
 *
 * Regole:
 * - Le timbrature vengono accoppiate in sequenza (entrata → uscita).
 * - Un turno appartiene al giorno (fuso aziendale) in cui inizia: i turni a cavallo
 *   della mezzanotte restano interi sul giorno di entrata.
 * - La durata usa il tempo reale trascorso (gestisce correttamente il cambio ora legale).
 * - Arrotondamento opzionale di entrata e uscita al multiplo più vicino.
 * - Pausa automatica opzionale: se il giorno supera una soglia e le pause reali timbrate
 *   sono inferiori alla pausa prevista, si detrae la differenza.
 * - Straordinario = ore oltre la soglia giornaliera.
 * - "Di cui notturne": minuti dentro la fascia notturna (es. 22:00–06:00, ora locale).
 * - "Di cui festive": minuti caduti di domenica o in una festività nazionale (per data locale:
 *   in un turno sabato 22 → domenica 6 sono festive solo le ore dopo mezzanotte).
 *   Notturne e festive sono già incluse nel totale: servono al consulente per le maggiorazioni.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { isHoliday, type Patron } from "./holidays";

export type PunchKind = "in" | "out";

export interface Punch {
  id: string;
  kind: PunchKind;
  at: Date;
}

export interface HoursSettings {
  roundingMinutes: number;
  autoBreakMinutes: number;
  autoBreakAfterMinutes: number;
  dailyOvertimeAfterMinutes: number;
  maxShiftMinutes: number;
  /** Inizio e fine della fascia notturna in minuti dalla mezzanotte (22:00 = 1320, 06:00 = 360). */
  nightStartMinutes: number;
  nightEndMinutes: number;
  /** Il titolare può scegliere di non conteggiare notturne e/o festive. */
  trackNight: boolean;
  trackHoliday: boolean;
  /** Santo Patrono dell'azienda, conta come festivo */
  patron?: Patron;
  /** Settimana di 6 giorni (lun–sab): serve solo al conteggio delle assenze */
  workSaturday?: boolean;
}

export const DEFAULT_SETTINGS: HoursSettings = {
  roundingMinutes: 0,
  autoBreakMinutes: 0,
  autoBreakAfterMinutes: 360,
  dailyOvertimeAfterMinutes: 480,
  maxShiftMinutes: 960,
  nightStartMinutes: 22 * 60,
  nightEndMinutes: 6 * 60,
  trackNight: true,
  trackHoliday: true,
};

export type AnomalyType = "missing_out" | "missing_in";

export interface Anomaly {
  type: AnomalyType;
  punchId: string;
  at: Date;
}

export interface Shift {
  inId: string;
  in: Date;
  outId: string | null;
  out: Date | null; // null = turno in corso
  minutes: number;
  nightMinutes: number;
  holidayMinutes: number;
}

export interface DaySummary {
  date: string; // yyyy-MM-dd nel fuso aziendale
  shifts: Shift[];
  grossMinutes: number;
  breakDeductedMinutes: number;
  workedMinutes: number;
  ordinaryMinutes: number;
  overtimeMinutes: number;
  /** di cui nella fascia notturna */
  nightMinutes: number;
  /** di cui di domenica o in un giorno festivo */
  holidayMinutes: number;
  anomalies: Anomaly[];
  inProgress: boolean;
}

const MIN = 60_000;

export function roundToNearest(date: Date, minutes: number): Date {
  if (!minutes) return date;
  const step = minutes * MIN;
  return new Date(Math.round(date.getTime() / step) * step);
}

export function localDate(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MIN);
}

function overlapMinutes(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / MIN;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Istante di un orario locale di un dato giorno (gestisce l'ora legale). */
function localInstant(date: string, minutes: number, timeZone: string): number {
  if (minutes >= 1440) return fromZonedTime(`${addDays(date, 1)}T00:00:00`, timeZone).getTime();
  return fromZonedTime(`${date}T${hhmm(minutes)}:00`, timeZone).getTime();
}

/** È domenica o festività nazionale (data locale yyyy-MM-dd)? */
export function isSundayOrHoliday(date: string, patron?: Patron): boolean {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 0 || Boolean(isHoliday(date, patron));
}

/**
 * Minuti notturni e festivi di un intervallo, scomponendolo per giorno locale.
 * Fascia notturna a cavallo della mezzanotte (22→6) o interna al giorno (0→6).
 */
export function classifyInterval(
  start: Date, end: Date,
  settings: Pick<HoursSettings, "nightStartMinutes" | "nightEndMinutes" | "trackNight" | "trackHoliday" | "patron">,
  timeZone: string,
): { night: number; holiday: number } {
  const s = start.getTime(), e = end.getTime();
  if (e <= s) return { night: 0, holiday: 0 };
  const { nightStartMinutes: ns, nightEndMinutes: ne } = settings;
  let night = 0, holiday = 0;
  const last = localDate(end, timeZone);
  for (let d = localDate(start, timeZone); d <= last; d = addDays(d, 1)) {
    const d0 = localInstant(d, 0, timeZone), d1 = localInstant(d, 1440, timeZone);
    if (settings.trackHoliday && isSundayOrHoliday(d, settings.patron)) holiday += overlapMinutes(s, e, d0, d1);
    if (!settings.trackNight || ns === ne) continue;
    if (ns > ne) {
      night += overlapMinutes(s, e, d0, localInstant(d, ne, timeZone));
      night += overlapMinutes(s, e, localInstant(d, ns, timeZone), d1);
    } else {
      night += overlapMinutes(s, e, localInstant(d, ns, timeZone), localInstant(d, ne, timeZone));
    }
  }
  return { night: Math.round(night), holiday: Math.round(holiday) };
}

export function calculateDays(
  punches: Punch[],
  settings: HoursSettings,
  timeZone: string,
  now: Date = new Date(),
): DaySummary[] {
  const sorted = [...punches].sort((a, b) => a.at.getTime() - b.at.getTime());
  const days = new Map<string, DaySummary>();

  const day = (d: Date): DaySummary => {
    const key = localDate(d, timeZone);
    let s = days.get(key);
    if (!s) {
      s = {
        date: key, shifts: [], grossMinutes: 0, breakDeductedMinutes: 0, workedMinutes: 0,
        ordinaryMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, anomalies: [], inProgress: false,
      };
      days.set(key, s);
    }
    return s;
  };

  const maxMs = settings.maxShiftMinutes * MIN;
  let open: Punch | null = null;

  const closeAsMissingOut = (p: Punch) => {
    day(p.at).anomalies.push({ type: "missing_out", punchId: p.id, at: p.at });
  };

  for (const p of sorted) {
    if (p.kind === "in") {
      if (open) closeAsMissingOut(open);
      open = p;
      continue;
    }
    // uscita
    if (!open) {
      day(p.at).anomalies.push({ type: "missing_in", punchId: p.id, at: p.at });
      continue;
    }
    if (p.at.getTime() - open.at.getTime() > maxMs) {
      closeAsMissingOut(open);
      day(p.at).anomalies.push({ type: "missing_in", punchId: p.id, at: p.at });
      open = null;
      continue;
    }
    const rin = roundToNearest(open.at, settings.roundingMinutes);
    const rout = roundToNearest(p.at, settings.roundingMinutes);
    const cls = classifyInterval(rin, rout, settings, timeZone);
    day(open.at).shifts.push({
      inId: open.id, in: open.at, outId: p.id, out: p.at,
      minutes: Math.max(0, diffMinutes(rin, rout)),
      nightMinutes: cls.night,
      holidayMinutes: cls.holiday,
    });
    open = null;
  }

  if (open) {
    if (now.getTime() - open.at.getTime() > maxMs) {
      closeAsMissingOut(open);
    } else {
      const d = day(open.at);
      d.inProgress = true;
      d.shifts.push({ inId: open.id, in: open.at, outId: null, out: null, minutes: 0, nightMinutes: 0, holidayMinutes: 0 });
    }
  }

  for (const d of days.values()) {
    const closed = d.shifts.filter((s) => s.out);
    d.grossMinutes = closed.reduce((t, s) => t + s.minutes, 0);

    let breakTaken = 0;
    for (let i = 1; i < closed.length; i++) {
      breakTaken += Math.max(0, diffMinutes(closed[i - 1].out!, closed[i].in));
    }
    if (
      settings.autoBreakMinutes > 0 &&
      d.grossMinutes >= settings.autoBreakAfterMinutes &&
      breakTaken < settings.autoBreakMinutes
    ) {
      d.breakDeductedMinutes = Math.min(d.grossMinutes, settings.autoBreakMinutes - breakTaken);
    }
    d.workedMinutes = d.grossMinutes - d.breakDeductedMinutes;
    d.overtimeMinutes = Math.max(0, d.workedMinutes - settings.dailyOvertimeAfterMinutes);
    d.ordinaryMinutes = d.workedMinutes - d.overtimeMinutes;
    // "di cui": mai più del lavorato (la pausa automatica non ha un orario preciso)
    d.nightMinutes = Math.min(d.workedMinutes, closed.reduce((t, s) => t + s.nightMinutes, 0));
    d.holidayMinutes = Math.min(d.workedMinutes, closed.reduce((t, s) => t + s.holidayMinutes, 0));
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface PeriodTotals {
  workedMinutes: number;
  ordinaryMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  daysWorked: number;
  anomalies: number;
}

export function totals(days: DaySummary[]): PeriodTotals {
  return days.reduce<PeriodTotals>(
    (t, d) => ({
      workedMinutes: t.workedMinutes + d.workedMinutes,
      ordinaryMinutes: t.ordinaryMinutes + d.ordinaryMinutes,
      overtimeMinutes: t.overtimeMinutes + d.overtimeMinutes,
      nightMinutes: t.nightMinutes + d.nightMinutes,
      holidayMinutes: t.holidayMinutes + d.holidayMinutes,
      daysWorked: t.daysWorked + (d.workedMinutes > 0 ? 1 : 0),
      anomalies: t.anomalies + d.anomalies.length,
    }),
    { workedMinutes: 0, ordinaryMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, daysWorked: 0, anomalies: 0 },
  );
}

/** 450 → "7:30" */
export function formatMinutes(min: number): string {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

/** 450 → 7.5 (ore decimali, comode per il consulente) */
export function minutesToDecimalHours(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}
