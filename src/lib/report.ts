/**
 * Report mensile per il consulente del lavoro — funzioni pure.
 * Un solo punto che prepara i numeri: PDF, Excel e schermate usano gli stessi dati.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { it } from "date-fns/locale";
import { formatMinutes, type HoursSettings, type PeriodTotals, type Punch } from "./hours/calculate";
import { isHoliday } from "./hours/holidays";
import { daysOfMonth, monthLabel, summarizeMonth } from "./hours/month";
import { EMPTY_TOTALS, isWorkingDay, leaveByDate, leaveLabel, leaveTotals, type Leave, type LeaveTotals } from "./leave";

export interface ReportDay {
  date: string;
  label: string;          // "lun 5"
  holiday: string | null; // nome della festività
  nonWorking: boolean;    // weekend/festivo secondo la settimana lavorativa
  entries: string;        // "08:02–12:30, 13:28–17:05"
  workedMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  absence: string | null; // "Ferie", "Permesso 2:30"
  sick: boolean;          // giorno di malattia: evidenziato in rosso nel PDF
  anomaly: string | null; // "Manca l'uscita"
}

export interface ReportEmployee {
  id: string;
  name: string;
  totals: PeriodTotals;
  leave: LeaveTotals;
  /** Protocolli dei certificati INPS delle malattie che toccano il mese */
  sickProtocols: string[];
  days: ReportDay[];
}

export interface MonthReport {
  companyName: string;
  month: string;
  monthLabel: string; // "ottobre 2026"
  showNight: boolean;
  showHoliday: boolean;
  employees: ReportEmployee[];
  totals: PeriodTotals;
  leave: LeaveTotals;
  anomalies: number;
}

export interface ReportInput {
  companyName: string;
  month: string;
  timeZone: string;
  settings: HoursSettings;
  employees: { id: string; first_name: string; last_name: string; active: boolean }[];
  punches: Map<string, Punch[]>;
  leaves: Leave[];
  now?: Date;
}

const ZERO: PeriodTotals = {
  workedMinutes: 0, ordinaryMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, daysWorked: 0, anomalies: 0,
};

function addTotals(a: PeriodTotals, b: PeriodTotals): PeriodTotals {
  return {
    workedMinutes: a.workedMinutes + b.workedMinutes,
    ordinaryMinutes: a.ordinaryMinutes + b.ordinaryMinutes,
    overtimeMinutes: a.overtimeMinutes + b.overtimeMinutes,
    nightMinutes: a.nightMinutes + b.nightMinutes,
    holidayMinutes: a.holidayMinutes + b.holidayMinutes,
    daysWorked: a.daysWorked + b.daysWorked,
    anomalies: a.anomalies + b.anomalies,
  };
}

function addLeave(a: LeaveTotals, b: LeaveTotals): LeaveTotals {
  return {
    ferieDays: a.ferieDays + b.ferieDays,
    permessoMinutes: a.permessoMinutes + b.permessoMinutes,
    permessoDays: a.permessoDays + b.permessoDays,
    malattiaDays: a.malattiaDays + b.malattiaDays,
    altroDays: a.altroDays + b.altroDays,
  };
}

const hasLeave = (l: LeaveTotals) => l.ferieDays + l.permessoMinutes + l.permessoDays + l.malattiaDays + l.altroDays > 0;

export function buildMonthReport(input: ReportInput): MonthReport {
  const { month, timeZone: tz, settings } = input;
  const now = input.now ?? new Date();
  const days = daysOfMonth(month);
  const from = days[0], to = days.at(-1)!;
  const week = { workSaturday: Boolean(settings.workSaturday), patron: settings.patron };
  const hhmm = (d: Date) => formatInTimeZone(d, tz, "HH:mm");
  const dayLabel = (d: string) => formatInTimeZone(fromZonedTime(`${d}T12:00:00`, tz), tz, "EEE d", { locale: it });

  const employees: ReportEmployee[] = [];
  for (const e of input.employees) {
    const summary = summarizeMonth(input.punches.get(e.id) ?? [], settings, tz, month, now);
    const own = input.leaves.filter((l) => l.employee_id === e.id);
    const lt = leaveTotals(own, from, to, week);
    const t = summary.totals;
    if (!e.active && t.workedMinutes === 0 && t.anomalies === 0 && !hasLeave(lt)) continue;

    const byDate = new Map(summary.days.map((d) => [d.date, d]));
    const leaveOn = leaveByDate(own, from, to, week);
    employees.push({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      totals: t,
      leave: lt,
      sickProtocols: [...new Set(own.filter((l) => l.type === "malattia" && l.inps_protocol).map((l) => l.inps_protocol!))],
      days: days.map((date) => {
        const d = byDate.get(date);
        const entries = (d?.shifts ?? []).map((s) => {
          if (!s.out) return `${hhmm(s.in)}–in corso`;
          const nextDay = formatInTimeZone(s.out, tz, "yyyy-MM-dd") !== date;
          return `${hhmm(s.in)}–${hhmm(s.out)}${nextDay ? " (+1)" : ""}`;
        });
        for (const a of d?.anomalies ?? []) {
          entries.push(a.type === "missing_out" ? `${hhmm(a.at)}–?` : `?–${hhmm(a.at)}`);
        }
        const types = d?.anomalies.map((a) => a.type) ?? [];
        return {
          date,
          label: dayLabel(date),
          holiday: isHoliday(date, settings.patron) ?? null,
          nonWorking: !isWorkingDay(date, week),
          entries: entries.join(", "),
          workedMinutes: d?.workedMinutes ?? 0,
          overtimeMinutes: d?.overtimeMinutes ?? 0,
          nightMinutes: d?.nightMinutes ?? 0,
          holidayMinutes: d?.holidayMinutes ?? 0,
          absence: (leaveOn.get(date) ?? []).map((x) => leaveLabel(x.leave)).join(", ") || null,
          sick: (leaveOn.get(date) ?? []).some((x) => x.leave.type === "malattia"),
          anomaly: types.includes("missing_out") ? "Manca l'uscita" : types.includes("missing_in") ? "Manca l'entrata" : null,
        };
      }),
    });
  }

  employees.sort((a, b) => a.name.localeCompare(b.name, "it"));
  const totals = employees.reduce((s, e) => addTotals(s, e.totals), ZERO);
  return {
    companyName: input.companyName,
    month,
    monthLabel: monthLabel(month),
    showNight: settings.trackNight,
    showHoliday: settings.trackHoliday,
    employees,
    totals,
    leave: employees.reduce((s, e) => addLeave(s, e.leave), { ...EMPTY_TOTALS }),
    anomalies: totals.anomalies,
  };
}

/** 9150 → "152,50": ore decimali all'italiana, come le chiedono i software paghe. */
export function decimalHours(minutes: number): string {
  return (Math.round((minutes / 60) * 100) / 100).toFixed(2).replace(".", ",");
}

/** "152:30" oppure "—" se zero */
export function hm(minutes: number): string {
  return minutes ? formatMinutes(minutes) : "—";
}

/** Nome file: "presenze-2026-10-bar-centrale.pdf" */
export function reportFileName(companyName: string, month: string, ext: "pdf" | "xlsx", draft = false): string {
  const slug = companyName
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 40) || "azienda";
  return `presenze-${month}-${slug}${draft ? "-bozza" : ""}.${ext}`;
}
