import Link from "next/link";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { it } from "date-fns/locale";
import { getCurrentCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { fetchEmployees, fetchLeaves, fetchPunches, fetchSettings, groupByEmployee } from "@/lib/attendance";
import { fetchClosure } from "@/lib/report-data";
import { LEAVE_LETTER, leaveLabel, leavePeriodLabel, type LeaveType } from "@/lib/leave";
import { formatMinutes } from "@/lib/hours/calculate";
import { currentMonth, currentStatus, fetchWindow, monthLabel, shiftMonth, summarizeMonth } from "@/lib/hours/month";
import { Notice } from "@/components/ui";

const UPCOMING_DAYS = 14; // "Prossime assenze": da oggi alle prossime due settimane

const LEAVE_BADGE: Record<LeaveType, string> = {
  ferie: "bg-brand text-white",
  permesso: "bg-warn-soft text-warn",
  malattia: "bg-danger text-white",
  altro: "bg-line text-ink",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { company } = await getCurrentCompany();
  const { password } = await searchParams;
  if (!company) return null;

  const tz = company.timezone;
  const now = new Date();
  const month = currentMonth(tz, now);
  const prevMonth = shiftMonth(month, -1);
  const supabase = await createClient();

  const [employees, settings, devicesRes, prevClosure] = await Promise.all([
    fetchEmployees(supabase, company.id),
    fetchSettings(supabase, company.id),
    supabase.from("devices").select("id", { count: "exact", head: true }).eq("company_id", company.id).is("revoked_at", null),
    fetchClosure(supabase, company.id, prevMonth),
  ]);
  const { from, to } = fetchWindow(month, tz, settings.maxShiftMinutes);
  const byEmployee = groupByEmployee(await fetchPunches(supabase, { companyId: company.id, from, to }));
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const horizon = formatInTimeZone(new Date(now.getTime() + UPCOMING_DAYS * 86_400_000), tz, "yyyy-MM-dd");
  const leaves = await fetchLeaves(supabase, { companyId: company.id, from: today, to: horizon });
  const todayLeave = (id: string) => leaves.find((l) => l.employee_id === id && l.start_date <= today && l.end_date >= today);

  const active = employees.filter((e) => e.active);
  const nameOf = new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const status = active.map((e) => ({ e, s: currentStatus(byEmployee.get(e.id) ?? [], settings.maxShiftMinutes, now) }));
  const present = status.filter((x) => x.s.present).sort((a, b) => a.s.since!.getTime() - b.s.since!.getTime());
  const absent = status.filter((x) => !x.s.present);

  // riepilogo del mese in corso: ore, straordinari e timbrature da sistemare (con il primo caso da aprire)
  let worked = 0, overtime = 0, night = 0, anomalies = 0;
  let firstAnomaly: { employeeId: string; date: string; type: "missing_out" | "missing_in" } | null = null;
  for (const e of employees) {
    const { days, totals } = summarizeMonth(byEmployee.get(e.id) ?? [], settings, tz, month, now);
    worked += totals.workedMinutes;
    overtime += totals.overtimeMinutes;
    night += totals.nightMinutes;
    anomalies += totals.anomalies;
    const d = days.find((x) => x.anomalies.length > 0);
    if (d && (!firstAnomaly || d.date < firstAnomaly.date)) firstAnomaly = { employeeId: e.id, date: d.date, type: d.anomalies[0].type };
  }

  const hasEmployees = active.length > 0;
  const hasTablet = (devicesRes.count ?? 0) > 0;
  const setupDone = hasEmployees && hasTablet;
  const time = (d: Date) => formatInTimeZone(d, tz, "HH:mm");
  const day = (date: string) => formatInTimeZone(fromZonedTime(`${date}T12:00:00`, tz), tz, "EEE d MMM", { locale: it });
  const shortDay = (date: string) => formatInTimeZone(fromZonedTime(`${date}T12:00:00`, tz), tz, "EEE d", { locale: it });
  const upcoming = leaves.slice(0, 5);

  return (
    <div className="space-y-6">
      {password === "aggiornata" && <Notice tone="success">Password aggiornata.</Notice>}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold first-letter:uppercase sm:text-3xl">
          {formatInTimeZone(now, tz, "EEEE d MMMM", { locale: it })}
        </h2>
        <p className="text-sm text-ink-soft">Aggiornato alle {time(now)}</p>
      </div>

      {!setupDone && (
        <section aria-labelledby="setup" className="anim-in flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line bg-card px-5 py-4">
          {/* avanzamento: sopra il testo su smartphone, a sinistra da computer */}
          <div aria-hidden className="flex basis-full gap-1 sm:basis-auto">
            <span className={`h-1.5 w-7 rounded-full ${hasEmployees ? "bg-present" : "bg-line"}`} />
            <span className={`h-1.5 w-7 rounded-full ${hasTablet ? "bg-present" : "bg-line"}`} />
          </div>
          <div className="min-w-[14rem] flex-1">
            <h2 id="setup" className="font-semibold">Prepara l&apos;azienda per le timbrature</h2>
            <p className="text-sm text-ink-soft">
              {hasEmployees ? "Manca un passo: il tablet su cui i dipendenti timbrano." : "Due passi: i dipendenti con il loro PIN, poi il tablet."}
              {" "}Logo e regole ore sono facoltativi, in <Link href="/app/impostazioni" className="font-medium text-brand underline-offset-4 hover:underline">Impostazioni</Link>.
            </p>
          </div>
          <Link
            href={hasEmployees ? "/app/tablet" : "/app/dipendenti"}
            className="inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
          >
            {hasEmployees ? "Attiva il tablet per le timbrature" : "Aggiungi i dipendenti e il loro PIN"}
          </Link>
        </section>
      )}

      {hasEmployees && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Kpi label={`Ore di ${monthLabel(month).split(" ")[0]}`} value={formatMinutes(worked)} hint={`${active.length} ${active.length === 1 ? "dipendente" : "dipendenti"}, fino a oggi`} />
          <Kpi
            label="Straordinari"
            value={overtime ? formatMinutes(overtime) : "—"}
            hint={settings.trackNight && night ? `di cui notturne ${formatMinutes(night)} sul totale` : "oltre l'orario giornaliero"}
          />
          {anomalies > 0 && firstAnomaly ? (
            <div className="card-hover flex flex-col gap-1 rounded-xl border border-warn/25 bg-warn-soft px-4 py-4 text-warn lg:px-5">
              <dt className="text-sm">Da sistemare</dt>
              <dd className="font-display text-3xl font-bold tabular-nums">{anomalies}</dd>
              <dd className="text-sm font-semibold">
                <Link
                  href={anomalies === 1 ? `/app/presenze/${firstAnomaly.employeeId}?mese=${month}#g-${firstAnomaly.date}` : `/app/presenze?mese=${month}`}
                  className="underline underline-offset-4"
                >
                  {anomalies === 1
                    ? `${nameOf.get(firstAnomaly.employeeId)}, ${shortDay(firstAnomaly.date)}: ${firstAnomaly.type === "missing_out" ? "manca l'uscita" : "manca l'entrata"}`
                    : `${anomalies} timbrature da sistemare questo mese`}
                </Link>
              </dd>
            </div>
          ) : (
            <Kpi label="Da sistemare" value="0" hint="Nessuna timbratura da sistemare" />
          )}
          <div className="card-hover flex flex-col gap-1 rounded-xl border border-line bg-card px-4 py-4 lg:px-5">
            <dt className="text-sm text-ink-soft first-letter:uppercase">Report di {monthLabel(prevMonth).split(" ")[0]}</dt>
            <dd className="pt-1 font-display text-xl font-bold">{prevClosure ? "Chiuso e inviabile" : "Da chiudere"}</dd>
            <dd className="text-sm font-semibold">
              <Link href={`/app/report?mese=${prevMonth}`} className="text-brand underline-offset-4 hover:underline">Apri il report</Link>
            </dd>
          </div>
        </dl>
      )}

      {hasEmployees && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
          <section aria-labelledby="present-t" className="card-hover rounded-xl border border-line bg-card px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="present-t" className="font-display text-xl font-bold">
                Al lavoro adesso <span className="font-sans text-lg font-normal text-ink-soft">{present.length} di {active.length}</span>
              </h2>
              <Link href="/app/presenze" className="text-sm font-semibold text-brand underline-offset-4 hover:underline">Presenze del mese</Link>
            </div>
            <table className="mt-3 w-full text-left tabular-nums">
              <caption className="sr-only">Chi è al lavoro adesso e chi no</caption>
              <thead className="border-b border-line text-sm text-ink-soft">
                <tr>
                  <th scope="col" className="py-2 font-medium">Dipendente</th>
                  <th scope="col" className="py-2 text-right font-medium">Entrata</th>
                  <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">In servizio da</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {present.map(({ e, s }) => (
                  <tr key={e.id}>
                    <th scope="row" className="py-3 font-medium">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-present" />
                        {e.first_name} {e.last_name}
                      </span>
                    </th>
                    <td className="py-3 text-right"><span className="sm:hidden">dalle </span>{time(s.since!)}</td>
                    <td className="hidden py-3 text-right text-ink-soft sm:table-cell">{formatMinutes(Math.floor((now.getTime() - s.since!.getTime()) / 60_000))}</td>
                  </tr>
                ))}
                {absent.map(({ e }) => {
                  const l = todayLeave(e.id);
                  return (
                    <tr key={e.id} className="text-ink-soft">
                      <th scope="row" className="py-3 font-normal">
                        <span className="flex flex-wrap items-center gap-2.5">
                          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-ink-soft/60" />
                          {e.first_name} {e.last_name}
                          {l && <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${LEAVE_BADGE[l.type]}`}>{leaveLabel(l)}</span>}
                        </span>
                      </th>
                      <td className="whitespace-nowrap py-3 text-right text-sm">non in servizio</td>
                      <td className="hidden py-3 text-right sm:table-cell">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {present.length === 0 && <p className="mt-3 text-sm text-ink-soft">Nessuno ha timbrato l&apos;entrata.</p>}
          </section>

          <section aria-labelledby="leave-t" className="card-hover rounded-xl border border-line bg-card px-5 py-5 sm:px-6">
            <h2 id="leave-t" className="font-display text-xl font-bold">Prossime assenze</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Nessuna assenza nei prossimi {UPCOMING_DAYS} giorni.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((l) => (
                  <li key={l.id} className="flex items-start gap-3">
                    <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${LEAVE_BADGE[l.type]}`}>
                      {LEAVE_LETTER[l.type]}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{nameOf.get(l.employee_id)}</span>
                      <span className="block text-sm text-ink-soft">{leaveLabel(l)}, {leavePeriodLabel(l, today, day)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/ferie" className="mt-4 block border-t border-line pt-3 text-sm font-semibold text-brand underline-offset-4 hover:underline">
              Vai al calendario Ferie
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-hover flex flex-col gap-1 rounded-xl border border-line bg-card px-4 py-4 lg:px-5">
      <dt className="text-sm text-ink-soft first-letter:uppercase">{label}</dt>
      <dd className="font-display text-3xl font-bold tabular-nums">{value}</dd>
      <dd className="text-sm text-ink-soft">{hint}</dd>
    </div>
  );
}
