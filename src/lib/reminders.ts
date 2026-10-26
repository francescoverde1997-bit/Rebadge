/**
 * Promemoria serale al titolare (funzioni pure, nessun accesso al database).
 * - chi risulta ANCORA AL LAVORO all'ora del promemoria (ultima timbratura = entrata, entro il turno massimo);
 * - le USCITE/ENTRATE MANCANTI dei giorni precedenti non ancora sistemate (ripetute ogni sera finché restano).
 * Il calcolo dei turni è sempre quello del motore ore: qui non si duplica nulla.
 */
import { formatInTimeZone } from "date-fns-tz";
import { calculateDays, type AnomalyType, type HoursSettings, type Punch } from "./hours/calculate";
import { currentStatus } from "./hours/month";
import { minutesToTime } from "./validation";

export { minutesToTime };

/** Quanti giorni indietro si cercano le timbrature da sistemare (oltre un mese il report è già andato al consulente). */
export const REMINDER_LOOKBACK_DAYS = 35;

export interface ReminderEmployee { id: string; name: string }
export interface OpenShift { employeeId: string; name: string; since: Date }
export interface MissedPunch { employeeId: string; name: string; date: string; type: AnomalyType; at: Date }
export interface ReminderContent { open: OpenShift[]; missed: MissedPunch[] }

export function reminderContent(
  employees: ReminderEmployee[],
  punchesByEmployee: Map<string, Punch[]>,
  settings: HoursSettings,
  timeZone: string,
  now: Date,
): ReminderContent {
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const open: OpenShift[] = [];
  const missed: MissedPunch[] = [];
  for (const e of employees) {
    const punches = punchesByEmployee.get(e.id) ?? [];
    const status = currentStatus(punches, settings.maxShiftMinutes, now);
    if (status.present) open.push({ employeeId: e.id, name: e.name, since: status.since! });
    for (const d of calculateDays(punches, settings, timeZone, now)) {
      if (d.date >= today) continue; // oggi: se è ancora dentro è nella prima lista
      for (const a of d.anomalies) missed.push({ employeeId: e.id, name: e.name, date: d.date, type: a.type, at: a.at });
    }
  }
  open.sort((a, b) => a.since.getTime() - b.since.getTime() || a.name.localeCompare(b.name));
  missed.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { open, missed };
}

export const isEmpty = (c: ReminderContent) => c.open.length === 0 && c.missed.length === 0;

/** È ora di mandare il promemoria? Dall'orario scelto fino a fine giornata (data e ora dell'azienda). */
export function isReminderTime(reminderMinutes: number, timeZone: string, now: Date): boolean {
  const [h, m] = formatInTimeZone(now, timeZone, "HH:mm").split(":").map(Number);
  return h * 60 + m >= reminderMinutes;
}

/** Orari proposti nelle Impostazioni: dalle 18:00 alle 23:30, ogni mezz'ora. */
export const REMINDER_TIMES = Array.from({ length: 12 }, (_, i) => 1080 + i * 30);
