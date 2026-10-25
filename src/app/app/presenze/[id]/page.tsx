import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { it } from "date-fns/locale";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { fetchLeaves, fetchPunches, toPunch } from "@/lib/attendance";
import { italianDateTime, settingsForMonth } from "@/lib/report-data";
import { ClosedNotice } from "../closed-notice";
import { leaveByDate, leaveLabel, leaveTotals } from "@/lib/leave";
import { formatMinutes } from "@/lib/hours/calculate";
import { isHoliday } from "@/lib/hours/holidays";
import { currentMonth, daysOfMonth, fetchWindow, groupByWeek, parseMonth, summarizeMonth } from "@/lib/hours/month";
import { MonthNav } from "../month-nav";
import { DayRow, type DayView } from "./day-row";

export const metadata: Metadata = { title: "Presenze dipendente · ReBadge" };

export default async function EmployeeAttendancePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mese?: string }>;
}) {
  const { company } = await requireOwner();
  const { id } = await params;
  const tz = company.timezone;
  const now = new Date();
  const month = parseMonth((await searchParams).mese, tz, now);
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, active")
    .eq("id", id)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!employee) notFound();

  const { settings, closure } = await settingsForMonth(supabase, company.id, month);
  const { from, to } = fetchWindow(month, tz, settings.maxShiftMinutes);
  const rows = await fetchPunches(supabase, { companyId: company.id, employeeId: id, from, to, includeVoided: true });
  const valid = rows.filter((r) => !r.voided_at).map(toPunch);
  const summary = summarizeMonth(valid, settings, tz, month, now);
  const monthDays = daysOfMonth(month);
  const week = { workSaturday: Boolean(settings.workSaturday), patron: settings.patron };
  const leaves = await fetchLeaves(supabase, { companyId: company.id, employeeId: id, from: monthDays[0], to: monthDays.at(-1)! });
  const leaveOn = leaveByDate(leaves, monthDays[0], monthDays.at(-1)!, week);
  const lt = leaveTotals(leaves, monthDays[0], monthDays.at(-1)!, week);
  const byDate = new Map(summary.days.map((d) => [d.date, d]));
  const dayLabel = (date: string) => formatInTimeZone(fromZonedTime(`${date}T12:00:00`, tz), tz, "EEE d", { locale: it });
  // uscite che chiudono un turno iniziato in un altro giorno (turni notturni)
  const shiftDayOfOut = new Map<string, string>();
  for (const d of summary.days) for (const sh of d.shifts) if (sh.outId) shiftDayOfOut.set(sh.outId, d.date);

  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const days: DayView[] = daysOfMonth(month)
    .filter((date) => date <= today)
    .map((date) => {
      const d = byDate.get(date);
      const noon = fromZonedTime(`${date}T12:00:00`, tz);
      const weekday = Number(formatInTimeZone(noon, tz, "i")); // 6 = sabato, 7 = domenica
      const anomalyTypes = d?.anomalies.map((a) => a.type) ?? [];
      return {
        date,
        label: dayLabel(date),
        holiday: isHoliday(date, settings.patron) ?? null,
        weekend: weekday >= 6,
        punches: rows
          .filter((r) => formatInTimeZone(new Date(r.punched_at), tz, "yyyy-MM-dd") === date)
          .map((r) => ({
            id: r.id,
            kind: r.kind,
            time: formatInTimeZone(new Date(r.punched_at), tz, "HH:mm"),
            manual: r.source === "manual",
            note: r.note,
            voided: Boolean(r.voided_at),
            voidReason: r.void_reason,
            shiftOf: shiftDayOfOut.has(r.id) && shiftDayOfOut.get(r.id) !== date ? dayLabel(shiftDayOfOut.get(r.id)!) : null,
          })),
        workedMinutes: d?.workedMinutes ?? 0,
        overtimeMinutes: d?.overtimeMinutes ?? 0,
        worked: d?.workedMinutes ? formatMinutes(d.workedMinutes) : null,
        overtime: d?.overtimeMinutes ? formatMinutes(d.overtimeMinutes) : null,
        night: d?.nightMinutes ? formatMinutes(d.nightMinutes) : null,
        holidayHours: d?.holidayMinutes ? formatMinutes(d.holidayMinutes) : null,
        breakDeducted: d?.breakDeductedMinutes ? formatMinutes(d.breakDeductedMinutes) : null,
        missingOut: anomalyTypes.includes("missing_out"),
        missingIn: anomalyTypes.includes("missing_in"),
        inProgress: Boolean(d?.inProgress),
        absence: (leaveOn.get(date) ?? []).map((x) => leaveLabel(x.leave)).join(", ") || null,
        absenceType: leaveOn.get(date)?.[0]?.leave.type ?? null,
      };
    })
    .reverse(); // i giorni più recenti in alto

  const t = summary.totals;
  const name = `${employee.first_name} ${employee.last_name}`;
  const weeks = groupByWeek(days);
  const flagged = days.filter((d) => d.missingIn || d.missingOut).reverse(); // dal più vecchio
  const weekLabel = (start: string, end: string) => {
    const a = start < monthDays[0] ? monthDays[0] : start;
    const b = end > monthDays.at(-1)! ? monthDays.at(-1)! : end;
    const f = (date: string, fmt: string) => formatInTimeZone(fromZonedTime(`${date}T12:00:00`, tz), tz, fmt, { locale: it });
    return a === b ? f(a, "d MMMM") : `${f(a, "d")} – ${f(b, "d MMMM")}`;
  };

  return (
    <div className="space-y-6">
      <Link href={`/app/presenze?mese=${month}`} className="text-sm font-semibold text-brand underline-offset-4 hover:underline">
        ‹ Tutti i dipendenti
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold">
          {name}
          {!employee.active && <span className="ml-2 font-sans text-base font-normal text-ink-soft">disattivato</span>}
        </h2>
        <MonthNav month={month} current={currentMonth(tz, now)} basePath={`/app/presenze/${id}`} />
      </div>

      <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line ${
        settings.trackNight || settings.trackHoliday ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-4"
      }`}>
        <Total label="Ore lavorate" value={formatMinutes(t.workedMinutes)} strong />
        <Total label="Ordinarie" value={formatMinutes(t.ordinaryMinutes)} />
        <Total label="Straordinari" value={t.overtimeMinutes ? formatMinutes(t.overtimeMinutes) : "—"} />
        {settings.trackNight && <Total label="di cui notturne" value={t.nightMinutes ? formatMinutes(t.nightMinutes) : "—"} />}
        {settings.trackHoliday && <Total label="di cui festive" value={t.holidayMinutes ? formatMinutes(t.holidayMinutes) : "—"} />}
        <Total label="Giorni lavorati" value={String(t.daysWorked)} />
      </dl>

      {(lt.ferieDays || lt.permessoMinutes || lt.permessoDays || lt.malattiaDays || lt.altroDays) > 0 && (
        <p className="text-ink-soft">
          Assenze nel mese:{" "}
          {[
            lt.ferieDays && `${lt.ferieDays} ${lt.ferieDays === 1 ? "giorno" : "giorni"} di ferie`,
            lt.permessoMinutes && `${formatMinutes(lt.permessoMinutes)} di permesso`,
            lt.permessoDays && `${lt.permessoDays} ${lt.permessoDays === 1 ? "giorno" : "giorni"} di permesso`,
            lt.malattiaDays && `${lt.malattiaDays} ${lt.malattiaDays === 1 ? "giorno" : "giorni"} di malattia`,
            lt.altroDays && `${lt.altroDays} ${lt.altroDays === 1 ? "giorno" : "giorni"} di altra assenza`,
          ].filter(Boolean).join(", ")}
          .{" "}
          <Link href={`/app/ferie?mese=${month}`} className="font-medium text-brand underline-offset-4 hover:underline">Apri il calendario</Link>
        </p>
      )}

      {closure && <ClosedNotice closedAt={italianDateTime(new Date(closure.closed_at), tz, false)} month={month} />}

      {t.anomalies > 0 && !closure && (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-warn sm:px-5">
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <p className="min-w-[14rem] flex-1">
            <strong>{t.anomalies === 1 ? "C'è 1 timbratura da sistemare" : `Ci sono ${t.anomalies} timbrature da sistemare`}</strong>
            {flagged[0] && `: ${flagged[0].label}, ${flagged[0].missingOut ? "manca l'uscita" : "manca l'entrata"}`}.
            {" "}Finché non la sistemi, quel turno non viene conteggiato.
          </p>
          {flagged[0] && (
            <a href={`#g-${flagged[0].date}`} className="inline-flex h-10 items-center rounded-lg bg-warn px-4 font-semibold text-white hover:bg-warn/90">
              {flagged[0].missingOut ? "Aggiungi l'uscita" : "Aggiungi l'entrata"}
            </a>
          )}
        </div>
      )}

      {days.length === 0 ? (
        <p className="text-ink-soft">Nessun giorno da mostrare.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {weeks.map((w) => {
            const workedW = w.items.reduce((a, d) => a + d.workedMinutes, 0);
            const overtimeW = w.items.reduce((a, d) => a + d.overtimeMinutes, 0);
            const running = w.items.some((d) => d.date === today);
            return (
              <section key={w.start} aria-label={`Settimana ${weekLabel(w.start, w.end)}`}>
                <h3 className="flex flex-wrap justify-between gap-x-4 border-b border-line bg-paper px-4 py-2 text-sm font-semibold text-ink-soft sm:px-5">
                  <span>Settimana {weekLabel(w.start, w.end)}</span>
                  <span className="tabular-nums">
                    {formatMinutes(workedW)}
                    {overtimeW > 0 && ` · straordinari ${formatMinutes(overtimeW)}`}
                    {running && " · in corso"}
                  </span>
                </h3>
                <ul className="divide-y divide-line">
                  {w.items.map((d) => <DayRow key={d.date} day={d} employeeId={id} locked={Boolean(closure)} />)}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className={`mt-1 tabular-nums ${strong ? "font-display text-2xl font-bold" : "text-xl font-semibold"}`}>{value}</dd>
    </div>
  );
}
