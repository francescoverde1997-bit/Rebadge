/**
 * Ferie, permessi, malattia — funzioni pure.
 * Un'assenza copre un intervallo di date (incluso). Un permesso può essere a ore, su un solo giorno.
 * I giorni conteggiati sono solo quelli lavorativi: lun–ven (o lun–sab), esclusi festivi e patrono.
 */
import { isHoliday, type Patron } from "./hours/holidays";

export type LeaveType = "ferie" | "permesso" | "malattia" | "altro";

export const LEAVE_LABELS: Record<LeaveType, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  altro: "Altra assenza",
};

/** Lettera mostrata nel calendario, insieme al colore (mai solo il colore). */
export const LEAVE_LETTER: Record<LeaveType, string> = { ferie: "F", permesso: "P", malattia: "M", altro: "A" };

export interface Leave {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string; // yyyy-MM-dd
  end_date: string;
  hours: number | null; // solo permessi a ore, su un giorno
  note: string | null;
  inps_protocol?: string | null; // solo malattia: numero di protocollo del certificato INPS
}

/** Formato del protocollo INPS accettato (stesso vincolo del database). */
export const INPS_PROTOCOL_RE = /^[A-Za-z0-9/-]{4,30}$/;

export interface WorkWeek {
  workSaturday: boolean;
  patron?: Patron;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(date: string, week: WorkWeek): boolean {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 domenica, 6 sabato
  if (wd === 0) return false;
  if (wd === 6 && !week.workSaturday) return false;
  return !isHoliday(date, week.patron);
}

export interface LeaveDay {
  date: string;
  leave: Leave;
  /** conta come giorno lavorativo di assenza (falso per weekend e festivi dentro un periodo di ferie) */
  working: boolean;
}

/** Giorni di un'assenza che cadono nell'intervallo [from, to] (incluso). */
export function leaveDays(leave: Leave, from: string, to: string, week: WorkWeek): LeaveDay[] {
  const start = leave.start_date > from ? leave.start_date : from;
  const end = leave.end_date < to ? leave.end_date : to;
  const out: LeaveDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push({ date: d, leave, working: isWorkingDay(d, week) });
  }
  return out;
}

export interface LeaveTotals {
  ferieDays: number;
  permessoMinutes: number;   // permessi a ore
  permessoDays: number;      // permessi a giornata intera
  malattiaDays: number;
  altroDays: number;
}

export const EMPTY_TOTALS: LeaveTotals = { ferieDays: 0, permessoMinutes: 0, permessoDays: 0, malattiaDays: 0, altroDays: 0 };

/**
 * Totali del mese di un dipendente.
 * Ferie, permessi a giornata e altre assenze contano i giorni lavorativi.
 * La malattia conta i giorni di calendario (come il certificato medico).
 */
export function leaveTotals(leaves: Leave[], from: string, to: string, week: WorkWeek): LeaveTotals {
  const t = { ...EMPTY_TOTALS };
  for (const l of leaves) {
    const days = leaveDays(l, from, to, week);
    if (l.type === "malattia") { t.malattiaDays += days.length; continue; }
    const working = days.filter((d) => d.working).length;
    if (l.type === "ferie") t.ferieDays += working;
    else if (l.type === "altro") t.altroDays += working;
    else if (l.hours != null) t.permessoMinutes += days.length ? Math.round(l.hours * 60) : 0;
    else t.permessoDays += working;
  }
  return t;
}

/** Mappa data → assenze, per il calendario e il dettaglio presenze. */
export function leaveByDate(leaves: Leave[], from: string, to: string, week: WorkWeek): Map<string, LeaveDay[]> {
  const m = new Map<string, LeaveDay[]>();
  for (const l of leaves) {
    for (const d of leaveDays(l, from, to, week)) {
      const list = m.get(d.date) ?? [];
      list.push(d);
      m.set(d.date, list);
    }
  }
  return m;
}

/** "Ferie", "Permesso 2:30", "Malattia" */
export function leaveLabel(l: Pick<Leave, "type" | "hours">): string {
  if (l.type === "permesso" && l.hours != null) {
    const m = Math.round(l.hours * 60);
    return `Permesso ${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  }
  return LEAVE_LABELS[l.type];
}

/**
 * Periodo di un'assenza visto da oggi, per la lista "Prossime assenze":
 * "in corso fino a dom 25 ott", "dal lun 2 al ven 6 nov", "gio 29 ott".
 * `fmt` trasforma una data yyyy-MM-dd nel testo breve del giorno.
 */
export function leavePeriodLabel(l: Pick<Leave, "start_date" | "end_date">, today: string, fmt: (date: string) => string): string {
  if (l.start_date <= today && l.end_date > today) return `in corso fino a ${fmt(l.end_date)}`;
  if (l.end_date === today) return l.start_date < today ? "fino a oggi" : "oggi";
  if (l.start_date === l.end_date) return fmt(l.start_date);
  return `dal ${fmt(l.start_date)} al ${fmt(l.end_date)}`;
}

/** Due assenze si sovrappongono? Due permessi a ore nello stesso giorno sono ammessi. */
export function overlaps(a: Pick<Leave, "start_date" | "end_date" | "hours" | "type">, b: Pick<Leave, "start_date" | "end_date" | "hours" | "type">): boolean {
  if (a.start_date > b.end_date || b.start_date > a.end_date) return false;
  const hourly = (x: typeof a) => x.type === "permesso" && x.hours != null;
  return !(hourly(a) && hourly(b));
}
