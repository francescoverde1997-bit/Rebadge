import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { currentMonth, monthLabel, parseMonth, shiftMonth } from "@/lib/hours/month";
import { fetchClosures, italianDateTime, loadMonthReport } from "@/lib/report-data";
import { decimalHours, hm } from "@/lib/report";
import { MonthNav } from "../presenze/month-nav";
import { CloseMonth } from "./ui";

export const metadata: Metadata = { title: "Report · ReBadge" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const { company } = await requireOwner();
  const tz = company.timezone;
  const now = new Date();
  const current = currentMonth(tz, now);
  // di norma si apre sul mese appena finito: è quello da mandare al consulente
  const requested = (await searchParams).mese;
  const month = requested ? parseMonth(requested, tz, now) : shiftMonth(current, -1);

  const supabase = await createClient();
  const [{ report, closure }, closures] = await Promise.all([
    loadMonthReport(supabase, company, month, now),
    fetchClosures(supabase, company.id),
  ]);
  const finished = month < current;
  const file = (tipo: "pdf" | "xlsx") => `/app/report/file?mese=${month}&tipo=${tipo}`;
  const btn = "inline-flex h-11 items-center rounded-lg px-5 font-semibold";

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold">Report per il consulente</h2>
        <MonthNav month={month} current={current} basePath="/app/report" />
      </div>

      <section aria-labelledby="month-t" className="card-hover rounded-xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="month-t" className="font-display text-xl font-bold first-letter:uppercase">{monthLabel(month)}</h3>
          {closure ? (
            <span className="rounded-full bg-present-soft px-3 py-1 text-sm font-semibold text-present">
              Chiuso il {italianDateTime(new Date(closure.closed_at), tz, false)}
            </span>
          ) : finished ? (
            <span className="rounded-full bg-paper px-3 py-1 text-sm font-semibold text-ink-soft">Da chiudere</span>
          ) : (
            <span className="rounded-full bg-paper px-3 py-1 text-sm font-semibold text-ink-soft">In corso</span>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Dipendenti" value={String(report.employees.length)} />
          <Stat label="Ore lavorate" value={hm(report.totals.workedMinutes)} sub={`${decimalHours(report.totals.workedMinutes)} decimali`} />
          <Stat label="Straordinari" value={hm(report.totals.overtimeMinutes)} />
          <Stat label="Giorni di ferie" value={String(report.leave.ferieDays)} />
        </dl>

        <div className="mt-6 border-t border-line pt-6">
          {closure ? (
            <div className="space-y-4">
              <p className="text-ink-soft">
                Il PDF di questo mese è già stato scaricato e il mese è chiuso: timbrature e assenze non si possono più modificare.
                Se devi correggere qualcosa, contatta l&apos;assistenza.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={file("pdf")} className={`${btn} bg-brand text-white hover:bg-brand-dark`}>Scarica il PDF inviato</a>
                <a href={file("xlsx")} className={`${btn} border border-line bg-card hover:border-ink-soft`}>Scarica Excel</a>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <a href={file("pdf")} className={`${btn} border border-line bg-card hover:border-ink-soft`}>Anteprima PDF</a>
                <a href={file("xlsx")} className={`${btn} border border-line bg-card hover:border-ink-soft`}>Scarica Excel</a>
              </div>
              <p className="text-sm text-ink-soft">
                L&apos;anteprima riporta la scritta &quot;Bozza&quot; e non chiude il mese: usala per controllare i numeri.
              </p>

              {!finished ? (
                <p className="rounded-lg bg-paper px-4 py-3 text-ink-soft">
                  Il mese è in corso. Il PDF definitivo per il consulente si potrà scaricare dal 1° {monthLabel(shiftMonth(month, 1))}.
                </p>
              ) : report.anomalies > 0 ? (
                <p role="status" className="rounded-lg bg-warn-soft px-4 py-3 text-warn">
                  Prima del PDF definitivo sistema {report.anomalies === 1 ? "1 timbratura" : `${report.anomalies} timbrature`}:{" "}
                  <Link href={`/app/presenze?mese=${month}`} className="font-semibold underline underline-offset-4">apri le presenze</Link>.
                </p>
              ) : (
                <CloseMonth month={month} label={monthLabel(month)} />
              )}
            </div>
          )}
        </div>
      </section>

      {closures.length > 0 && (
        <section aria-labelledby="closed-t" className="space-y-3">
          <h3 id="closed-t" className="font-display text-lg font-bold">Mesi chiusi</h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {closures.map((c) => (
              <li key={c.month} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <Link href={`/app/report?mese=${c.month}`} className="font-medium text-brand underline-offset-4 hover:underline first-letter:uppercase">
                  {monthLabel(c.month)}
                </Link>
                <span className="text-sm text-ink-soft">chiuso il {italianDateTime(new Date(c.closed_at), tz, false)}</span>
                <a href={`/app/report/file?mese=${c.month}&tipo=pdf`} className="text-sm font-semibold text-brand hover:underline">PDF</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-ink-soft">{sub}</dd>}
    </div>
  );
}
