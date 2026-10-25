import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { fetchEmployees, fetchPunches, groupByEmployee } from "@/lib/attendance";
import { italianDateTime, settingsForMonth } from "@/lib/report-data";
import { formatMinutes } from "@/lib/hours/calculate";
import { currentMonth, fetchWindow, parseMonth, summarizeMonth } from "@/lib/hours/month";
import { MonthNav } from "./month-nav";
import { ClosedNotice } from "./closed-notice";

export const metadata: Metadata = { title: "Presenze · ReBadge" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const { company } = await requireOwner();
  const tz = company.timezone;
  const month = parseMonth((await searchParams).mese, tz);
  const supabase = await createClient();

  const [employees, { settings, closure }] = await Promise.all([
    fetchEmployees(supabase, company.id),
    settingsForMonth(supabase, company.id, month),
  ]);
  const { from, to } = fetchWindow(month, tz, settings.maxShiftMinutes);
  const byEmployee = groupByEmployee(await fetchPunches(supabase, { companyId: company.id, from, to }));

  const rows = employees
    .map((e) => ({ e, t: summarizeMonth(byEmployee.get(e.id) ?? [], settings, tz, month).totals }))
    // i disattivati compaiono solo se hanno lavorato nel mese
    .filter(({ e, t }) => e.active || t.workedMinutes > 0 || t.anomalies > 0);

  const sum = rows.reduce(
    (a, { t }) => ({
      worked: a.worked + t.workedMinutes, ord: a.ord + t.ordinaryMinutes, ot: a.ot + t.overtimeMinutes,
      night: a.night + t.nightMinutes, hol: a.hol + t.holidayMinutes, an: a.an + t.anomalies,
    }),
    { worked: 0, ord: 0, ot: 0, night: 0, hol: 0, an: 0 },
  );
  const showNight = settings.trackNight;
  const showHoliday = settings.trackHoliday;
  const dash = (m: number) => (m ? formatMinutes(m) : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold">Presenze</h2>
        <MonthNav month={month} current={currentMonth(tz)} basePath="/app/presenze" />
      </div>

      {closure && <ClosedNotice closedAt={italianDateTime(new Date(closure.closed_at), tz, false)} month={month} />}

      {rows.length === 0 ? (
        <p className="text-ink-soft">
          Nessun dipendente. <Link href="/app/dipendenti" className="font-medium text-brand underline">Aggiungine uno</Link> per iniziare.
        </p>
      ) : (
        <>
        {/* smartphone: totale del mese e una scheda per dipendente */}
        <div className="space-y-3 sm:hidden">
          <div className="rounded-xl bg-ink px-4 py-4 text-white">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-white/75">Totale del mese</span>
              <span className="font-display text-3xl font-bold tabular-nums">{formatMinutes(sum.worked)}</span>
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm tabular-nums">
              <div><dt className="text-white/75">Straord.</dt><dd className="font-semibold">{dash(sum.ot)}</dd></div>
              {showNight && <div><dt className="text-white/75">Notturne</dt><dd className="font-semibold">{dash(sum.night)}</dd></div>}
              {showHoliday && <div><dt className="text-white/75">Festive</dt><dd className="font-semibold">{dash(sum.hol)}</dd></div>}
            </dl>
          </div>
          <ul className="space-y-3">
            {rows.map(({ e, t }) => (
              <li key={e.id}>
                <Link
                  href={`/app/presenze/${e.id}?mese=${month}`}
                  aria-label={`${e.first_name} ${e.last_name}: ${formatMinutes(t.workedMinutes)} ore${t.anomalies ? `, ${t.anomalies} da sistemare` : ""}`}
                  className="card-hover block rounded-xl border border-line bg-card px-4 py-3"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-brand">
                      {e.first_name} {e.last_name}
                      {!e.active && <span className="ml-2 text-sm font-normal text-ink-soft">disattivato</span>}
                    </span>
                    <span className="font-display text-xl font-bold tabular-nums">{formatMinutes(t.workedMinutes)}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums text-ink-soft">
                    <span>{t.daysWorked} {t.daysWorked === 1 ? "giorno" : "giorni"}</span>
                    <span>Ord. {formatMinutes(t.ordinaryMinutes)}</span>
                    <span>Straord. {dash(t.overtimeMinutes)}</span>
                    {t.anomalies > 0 && (
                      <span className="rounded-md bg-warn-soft px-2 font-semibold text-warn">{t.anomalies} da sistemare</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-line bg-card sm:block">
          <table className="w-full min-w-[44rem] text-left">
            <caption className="sr-only">Ore lavorate per dipendente</caption>
            <thead className="border-b border-line text-sm text-ink-soft">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Dipendente</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Giorni</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Ordinarie</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Straordinari</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Totale</th>
                {showNight && <th scope="col" className="px-3 py-3 text-right font-medium">di cui notturne</th>}
                {showHoliday && <th scope="col" className="px-3 py-3 text-right font-medium">di cui festive</th>}
                <th scope="col" className="px-5 py-3 font-medium">Da sistemare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {rows.map(({ e, t }) => (
                <tr key={e.id} className="transition-colors duration-150 hover:bg-paper">
                  <th scope="row" className="px-5 py-3 font-medium">
                    <Link href={`/app/presenze/${e.id}?mese=${month}`} className="text-brand underline-offset-4 hover:underline">
                      {e.first_name} {e.last_name}
                    </Link>
                    {!e.active && <span className="ml-2 text-sm font-normal text-ink-soft">disattivato</span>}
                  </th>
                  <td className="px-3 py-3 text-right">{t.daysWorked}</td>
                  <td className="px-3 py-3 text-right">{formatMinutes(t.ordinaryMinutes)}</td>
                  <td className="px-3 py-3 text-right">{t.overtimeMinutes ? formatMinutes(t.overtimeMinutes) : "—"}</td>
                  <td className="px-3 py-3 text-right font-semibold">{formatMinutes(t.workedMinutes)}</td>
                  {showNight && <td className="px-3 py-3 text-right">{dash(t.nightMinutes)}</td>}
                  {showHoliday && <td className="px-3 py-3 text-right">{dash(t.holidayMinutes)}</td>}
                  <td className="px-5 py-3">
                    {t.anomalies > 0 ? (
                      <span className="rounded-full bg-warn-soft px-2.5 py-1 text-sm font-medium text-warn">
                        {t.anomalies} {t.anomalies === 1 ? "timbratura" : "timbrature"}
                      </span>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line font-semibold tabular-nums">
              <tr>
                <th scope="row" className="px-5 py-3">Totale</th>
                <td />
                <td className="px-3 py-3 text-right">{formatMinutes(sum.ord)}</td>
                <td className="px-3 py-3 text-right">{sum.ot ? formatMinutes(sum.ot) : "—"}</td>
                <td className="px-3 py-3 text-right">{formatMinutes(sum.worked)}</td>
                {showNight && <td className="px-3 py-3 text-right">{dash(sum.night)}</td>}
                {showHoliday && <td className="px-3 py-3 text-right">{dash(sum.hol)}</td>}
                <td className="px-5 py-3 font-normal text-ink-soft">{sum.an > 0 ? `${sum.an} in tutto` : ""}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      )}
      <p className="text-sm text-ink-soft">
        Ore in formato ore:minuti. Un turno conta nel giorno in cui inizia.
        {(showNight || showHoliday) && " Le ore notturne e festive sono già comprese nel totale e servono al consulente per le maggiorazioni."}
        {" "}Apri un dipendente per vedere i giorni e correggere le timbrature.
      </p>
    </div>
  );
}

