import type { Metadata } from "next";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { it } from "date-fns/locale";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { fetchEmployees, fetchLeaves, fetchSettings } from "@/lib/attendance";
import { fetchClosures } from "@/lib/report-data";
import { currentMonth, daysOfMonth, parseMonth, shiftMonth } from "@/lib/hours/month";
import { isHoliday } from "@/lib/hours/holidays";
import { formatMinutes } from "@/lib/hours/calculate";
import { LEAVE_LABELS, LEAVE_LETTER, leaveByDate, leaveLabel, leaveTotals, type LeaveType } from "@/lib/leave";
import { MonthNav } from "../presenze/month-nav";
import { AddLeave, LeaveRow, ScrollToToday } from "./ui";

export const metadata: Metadata = { title: "Ferie e permessi · ReBadge" };

const CELL: Record<LeaveType, string> = {
  ferie: "bg-brand text-white",
  permesso: "bg-warn-soft text-warn",
  malattia: "bg-danger text-white", // rosso pieno: la malattia si distingue a colpo d'occhio
  altro: "bg-line text-ink",
};

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const { company } = await requireOwner();
  const tz = company.timezone;
  const now = new Date();
  const current = currentMonth(tz, now);
  const month = parseMonth((await searchParams).mese, tz, now, 12); // le ferie si pianificano in anticipo
  const days = daysOfMonth(month);
  const from = days[0], to = days.at(-1)!;
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");

  const supabase = await createClient();
  const [employees, settings, leaves, closures] = await Promise.all([
    fetchEmployees(supabase, company.id),
    fetchSettings(supabase, company.id),
    fetchLeaves(supabase, { companyId: company.id, from, to }),
    fetchClosures(supabase, company.id),
  ]);
  const closedMonths = new Set(closures.map((c) => c.month));
  const touchesClosed = (l: { start_date: string; end_date: string }) =>
    [...closedMonths].some((m) => m >= l.start_date.slice(0, 7) && m <= l.end_date.slice(0, 7));
  const week = { workSaturday: Boolean(settings.workSaturday), patron: settings.patron };

  const rows = employees
    .map((e) => {
      const own = leaves.filter((l) => l.employee_id === e.id);
      return { e, own, byDate: leaveByDate(own, from, to, week), totals: leaveTotals(own, from, to, week) };
    })
    .filter((r) => r.e.active || r.own.length > 0);

  const dayInfo = days.map((d) => {
    const noon = fromZonedTime(`${d}T12:00:00`, tz);
    const wd = Number(formatInTimeZone(noon, tz, "i"));
    return {
      date: d,
      n: Number(d.slice(8)),
      initial: formatInTimeZone(noon, tz, "EEEEE", { locale: it }).toUpperCase(),
      off: wd === 7 || (wd === 6 && !week.workSaturday) || Boolean(isHoliday(d, week.patron)),
      holiday: isHoliday(d, week.patron) ?? null,
    };
  });
  // in modifica si possono scegliere anche i dipendenti disattivati che hanno assenze nel mese
  const activeIds = new Set(employees.filter((e) => e.active).map((e) => e.id));
  const editable = employees
    .filter((e) => e.active || leaves.some((l) => l.employee_id === e.id))
    .map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }));
  const fmtDate = (d: string) => formatInTimeZone(fromZonedTime(`${d}T12:00:00`, tz), tz, "EEE d MMM", { locale: it });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold">Ferie e permessi</h2>
        <MonthNav month={month} current={current} basePath="/app/ferie" max={shiftMonth(current, 12)} />
      </div>

      {closedMonths.has(month) && (
        <p role="status" className="rounded-lg bg-present-soft px-4 py-3 text-present">
          Questo mese è chiuso: le assenze non si possono più modificare. Per correggere qualcosa contatta l&apos;assistenza.
        </p>
      )}

      <AddLeave
        employees={editable.filter((x) => activeIds.has(x.id))}
        defaultDate={month === current ? today : from}
      />

      {rows.length === 0 ? (
        <p className="text-ink-soft">Nessun dipendente.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Legenda">
            {(Object.keys(LEAVE_LABELS) as LeaveType[]).map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden className={`grid h-5 w-5 place-items-center rounded text-xs font-bold ${CELL[t]}`}>{LEAVE_LETTER[t]}</span>
                {LEAVE_LABELS[t]}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-5 w-5 rounded bg-paper ring-1 ring-line" />
              Giorno non lavorativo
            </li>
          </ul>

          <ScrollToToday className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full border-separate border-spacing-0 text-center text-sm">
              <caption className="sr-only">Calendario delle assenze di {month}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-36 border-b border-line bg-card px-4 py-2 text-left font-medium text-ink-soft">
                    Dipendente
                  </th>
                  {dayInfo.map((d) => (
                    <th
                      key={d.date}
                      scope="col"
                      title={d.holiday ?? undefined}
                      data-today={d.date === today ? "" : undefined}
                      className={`w-7 min-w-7 border-b border-line py-1.5 font-medium ${d.off ? "bg-paper text-ink-soft" : ""} ${d.date === today ? "text-brand" : ""}`}
                    >
                      <span className="block text-[10px] leading-3">{d.initial}</span>
                      <span className={`block tabular-nums ${d.date === today ? "font-bold underline underline-offset-2" : ""}`}>{d.n}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, byDate }) => (
                  <tr key={e.id} className="row-hover">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-line bg-card px-4 py-1.5 text-left font-medium">
                      {e.first_name} {e.last_name}
                    </th>
                    {dayInfo.map((d) => {
                      const items = byDate.get(d.date) ?? [];
                      const l = items[0]?.leave;
                      return (
                        <td key={d.date} className={`h-9 border-b border-line p-0.5 ${d.off ? "bg-paper" : ""}`}>
                          {l && (
                            <span
                              data-leave={l.id}
                              title={`${leaveLabel(l)}${l.note ? `: ${l.note}` : ""}`}
                              className={`chip-hover relative grid h-full w-full place-items-center rounded text-xs font-bold transition-[scale,box-shadow] duration-200 ${CELL[l.type]} ${d.off ? "opacity-40" : ""}`}
                            >
                              <span aria-hidden>{LEAVE_LETTER[l.type]}</span>
                              <span className="sr-only">{leaveLabel(l)}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollToToday>

          <section aria-labelledby="list-t" className="space-y-3">
            <h3 id="list-t" className="font-display text-lg font-bold">Assenze del mese</h3>
            {rows.every((r) => r.own.length === 0) ? (
              <p className="text-ink-soft">Nessuna assenza in questo mese.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-card">
                {rows.filter((r) => r.own.length > 0).map(({ e, own, totals: t }) => (
                  <li key={e.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{e.first_name} {e.last_name}</p>
                      <p className="text-sm text-ink-soft">
                        {[
                          t.ferieDays && `${t.ferieDays} ${t.ferieDays === 1 ? "giorno" : "giorni"} di ferie`,
                          t.permessoMinutes && `${formatMinutes(t.permessoMinutes)} di permesso`,
                          t.permessoDays && `${t.permessoDays} ${t.permessoDays === 1 ? "giorno" : "giorni"} di permesso`,
                          t.malattiaDays && `${t.malattiaDays} ${t.malattiaDays === 1 ? "giorno" : "giorni"} di malattia`,
                          t.altroDays && `${t.altroDays} ${t.altroDays === 1 ? "giorno" : "giorni"} di altra assenza`,
                        ].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {own.map((l) => (
                        <LeaveRow
                          key={l.id}
                          leave={{ ...l, note: l.note, inps_protocol: l.inps_protocol ?? null }}
                          employees={editable}
                          label={`${leaveLabel(l)} di ${e.first_name} ${e.last_name}`}
                          closed={touchesClosed(l)}
                        >
                          <span className={`mr-2 inline-grid h-5 w-5 place-items-center rounded text-xs font-bold ${CELL[l.type]}`} aria-hidden>
                            {LEAVE_LETTER[l.type]}
                          </span>
                          {leaveLabel(l)}{" "}
                          <span className="text-ink-soft">
                            {l.start_date === l.end_date ? fmtDate(l.start_date) : `dal ${fmtDate(l.start_date)} al ${fmtDate(l.end_date)}`}
                          </span>
                          {l.inps_protocol && <span className="text-ink-soft"> · protocollo INPS {l.inps_protocol}</span>}
                          {l.note && <span className="text-ink-soft">: {l.note}</span>}
                        </LeaveRow>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-ink-soft">
              Ferie e permessi a giornata contano i giorni lavorativi ({week.workSaturday ? "lunedì–sabato" : "lunedì–venerdì"}, esclusi i festivi).
              La malattia conta i giorni di calendario.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
