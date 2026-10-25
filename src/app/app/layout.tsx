export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentCompany, trialDaysLeft } from "@/lib/company";
import { isServiceActive, planName } from "@/lib/plans";
import { signOut } from "../(auth)/actions";
import { BottomNav, NavLinks } from "./nav";
import { BadgeMark, BRAND_SLOGAN } from "@/components/logo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { company, logoUrl } = await getCurrentCompany();

  if (!company) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <h1 className="font-display text-3xl font-bold">Nessuna azienda collegata</h1>
        <p className="mt-3 text-ink-soft">
          Questo account non è associato a nessuna azienda. Scrivi all&apos;assistenza per collegarlo.
        </p>
        <form action={signOut} className="mt-6"><button className="font-medium text-brand underline">Esci</button></form>
      </main>
    );
  }

  const days = trialDaysLeft(company);
  const active = isServiceActive(company);
  // Servizio sospeso: restano raggiungibili solo Abbonamento e Report (i report si scaricano sempre)
  const path = (await headers()).get("x-pathname") ?? "";
  const allowed = ["/app/abbonamento", "/app/report"].some((p) => path.startsWith(p));
  if (!active && !allowed) redirect("/app/abbonamento?motivo=scaduto");
  const plan = planName(company.plan);
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6 sm:pb-0 sm:pt-5">
          <div className="flex min-w-0 basis-full items-center gap-4 sm:flex-1 sm:basis-auto">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmato di Supabase, non ottimizzabile
              <img src={logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line bg-white object-contain p-1" />
            ) : (
              <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-ink font-display text-xl font-bold text-white">
                {company.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <h1 className="min-w-0 break-words font-display text-2xl font-bold tracking-tight sm:text-3xl">{company.name}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/app/abbonamento"
              className={`rounded-full px-3 py-1 font-medium hover:underline ${
                !active || company.plan_status === "past_due" ? "bg-danger-soft text-danger"
                  : company.plan_status === "trialing" && days <= 3 ? "bg-warn-soft text-warn"
                  : "bg-paper text-ink-soft"
              }`}
            >
              {!active
                ? "Servizio sospeso"
                : company.plan_status === "past_due"
                  ? "Pagamento non riuscito"
                  : company.plan_status === "trialing"
                    ? `Prova gratuita: ${days} ${days === 1 ? "giorno" : "giorni"}`
                    : `Piano ${plan}`}
            </Link>
            {/* su smartphone "Esci" sta nel menu Altro, in basso */}
            <form action={signOut} className="hidden sm:block">
              <button className="font-medium text-ink-soft hover:text-ink">Esci</button>
            </form>
          </div>
        </div>
        <NavLinks />
      </header>
      <BottomNav />
      {!active && !path.startsWith("/app/abbonamento") && (
        <p role="status" className="bg-danger-soft px-4 py-3 text-center text-danger sm:px-6">
          Servizio sospeso: il tablet non registra le timbrature. I report restano scaricabili.{" "}
          <Link href="/app/abbonamento" className="font-semibold underline underline-offset-4">Attiva l&apos;abbonamento</Link>
        </p>
      )}
      <main className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pt-8">{children}</main>
      <footer className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-28 pt-4 text-sm text-ink-soft sm:px-6 sm:pb-8">
        <BadgeMark className="h-5 w-5" />
        <span><span className="font-semibold text-ink">ReBadge</span> · {BRAND_SLOGAN}</span>
      </footer>
    </div>
  );
}
