/**
 * Utilità sul mese di competenza e sullo stato attuale dei dipendenti — funzioni pure.
 * Il calcolo delle ore resta in calculate.ts: qui si decide solo QUALI timbrature caricare
 * e QUALI giorni appartengono al mese.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { it } from "date-fns/locale";
import { calculateDays, DEFAULT_SETTINGS, totals, type DaySummary, type HoursSettings, type PeriodTotals, type Punch } from "./calculate";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function currentMonth(timeZone: string, now = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM");
}

/**
 * Mese richiesto nell'URL; se manca o non è valido → mese corrente.
 * Oltre `maxAhead` mesi nel futuro (predefinito 0: niente futuro) → mese corrente.
 */
export function parseMonth(value: string | undefined | null, timeZone: string, now = new Date(), maxAhead = 0): string {
  const current = currentMonth(timeZone, now);
  if (!value || !MONTH_RE.test(value) || value > shiftMonth(current, maxAhead)) return current;
  return value;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Istanti UTC di inizio mese e inizio del mese successivo, nel fuso aziendale. */
export function monthBounds(month: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: fromZonedTime(`${month}-01T00:00:00`, timeZone),
    end: fromZonedTime(`${shiftMonth(month, 1)}-01T00:00:00`, timeZone),
  };
}

/**
 * Intervallo di timbrature da caricare: il mese allargato della durata massima di un turno,
 * così un turno notturno a cavallo del cambio mese viene accoppiato correttamente.
 */
export function fetchWindow(month: string, timeZone: string, maxShiftMinutes: number): { from: Date; to: Date } {
  const { start, end } = monthBounds(month, timeZone);
  const pad = maxShiftMinutes * 60_000;
  return { from: new Date(start.getTime() - pad), to: new Date(end.getTime() + pad) };
}

export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** "ottobre 2026" */
export function monthLabel(month: string): string {
  return formatInTimeZone(fromZonedTime(`${month}-15T12:00:00`, "UTC"), "UTC", "LLLL yyyy", { locale: it });
}

export interface MonthSummary {
  days: DaySummary[];
  totals: PeriodTotals;
}

/** Riepilogo di un dipendente per il mese: solo i giorni del mese, anche se le timbrature caricate debordano. */
export function summarizeMonth(
  punches: Punch[], settings: HoursSettings, timeZone: string, month: string, now = new Date(),
): MonthSummary {
  const days = calculateDays(punches, settings, timeZone, now).filter((d) => d.date.startsWith(`${month}-`));
  return { days, totals: totals(days) };
}

export interface WeekGroup<T> {
  /** lunedì e domenica della settimana (yyyy-MM-dd) */
  start: string;
  end: string;
  items: T[];
}

/** Raggruppa i giorni per settimana (da lunedì a domenica), mantenendo l'ordine ricevuto. */
export function groupByWeek<T extends { date: string }>(items: T[]): WeekGroup<T>[] {
  const groups: WeekGroup<T>[] = [];
  for (const item of items) {
    const d = new Date(`${item.date}T12:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7; // 0 = lunedì
    const monday = new Date(d.getTime() - offset * 86_400_000);
    const start = monday.toISOString().slice(0, 10);
    const end = new Date(monday.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
    const last = groups.at(-1);
    if (last && last.start === start) last.items.push(item);
    else groups.push({ start, end, items: [item] });
  }
  return groups;
}

export interface CurrentStatus {
  present: boolean;
  since: Date | null; // ora di entrata se presente
}

/** È al lavoro adesso? Ultima timbratura valida = entrata, entro la durata massima del turno. */
export function currentStatus(punches: Punch[], maxShiftMinutes: number, now = new Date()): CurrentStatus {
  let last: Punch | null = null;
  for (const p of punches) if (!last || p.at > last.at) last = p;
  if (last && last.kind === "in" && now.getTime() - last.at.getTime() <= maxShiftMinutes * 60_000 && last.at <= now) {
    return { present: true, since: last.at };
  }
  return { present: false, since: null };
}

/** Da riga del database alle impostazioni del motore ore. */
export function toHoursSettings(row: {
  rounding_minutes: number; auto_break_minutes: number; auto_break_after_minutes: number;
  daily_overtime_after_minutes: number; max_shift_minutes: number;
  night_start_minutes?: number | null; night_end_minutes?: number | null;
  track_night?: boolean | null; track_holiday?: boolean | null;
  patron_month_day?: string | null; patron_name?: string | null; work_saturday?: boolean | null;
}): HoursSettings {
  return {
    roundingMinutes: row.rounding_minutes,
    autoBreakMinutes: row.auto_break_minutes,
    autoBreakAfterMinutes: row.auto_break_after_minutes,
    dailyOvertimeAfterMinutes: row.daily_overtime_after_minutes,
    maxShiftMinutes: row.max_shift_minutes,
    nightStartMinutes: row.night_start_minutes ?? DEFAULT_SETTINGS.nightStartMinutes,
    nightEndMinutes: row.night_end_minutes ?? DEFAULT_SETTINGS.nightEndMinutes,
    trackNight: row.track_night ?? DEFAULT_SETTINGS.trackNight,
    trackHoliday: row.track_holiday ?? DEFAULT_SETTINGS.trackHoliday,
    patron: row.patron_month_day ? { monthDay: row.patron_month_day, name: row.patron_name } : null,
    workSaturday: row.work_saturday ?? false,
  };
}
