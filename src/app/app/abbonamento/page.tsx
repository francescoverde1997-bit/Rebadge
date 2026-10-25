import type { Metadata } from "next";
import { getCurrentCompany, trialDaysLeft } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { CUSTOM_PLAN, dailyPriceCents, employeeLimit, formatPrice, isServiceActive, planById, planForEmployees, PLANS, MAX_EMPLOYEES } from "@/lib/plans";
import { Pricing } from "@/components/pricing";
import { CustomPlanForm } from "@/components/custom-plan-form";
import { isBillingConfigured } from "@/lib/stripe";
import { italianDateTime } from "@/lib/report-data";
import { Notice } from "@/components/ui";
import { ChangePlan, CheckoutButton, PortalButton, RefreshSoon } from "./ui";

export const metadata: Metadata = { title: "Abbonamento · ReBadge" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ esito?: string; motivo?: string; cambio?: string }> }) {
  const { company, user } = await getCurrentCompany();
  if (!company) return null;
  const { esito, motivo, cambio } = await searchParams;
  const supabase = await createClient();
  const { count } = await supabase
    .from("employees").select("id", { count: "exact", head: true })
    .eq("company_id", company.id).eq("active", true);
  const active = count ?? 0;
  const recommended = planForEmployees(active);
  const current = planById(company.plan);
  const isCustom = company.plan === "custom";
  const subscribed = Boolean(company.stripe_subscription_id) && (company.plan_status === "active" || company.plan_status === "past_due");
  const serviceActive = isServiceActive(company);
  const days = trialDaysLeft(company);
  const tz = company.timezone;
  const date = (iso: string | null) => (iso ? italianDateTime(new Date(iso), tz, false) : "");
  const configured = isBillingConfigured();

  return (
    <div className="max-w-6xl space-y-8">
      <h2 className="font-display text-2xl font-bold">Abbonamento</h2>

      {motivo === "scaduto" && !serviceActive && (
        <Notice tone="error">
          Il servizio è sospeso: il tablet non registra le timbrature e i dati non si possono modificare.
          Attiva l&apos;abbonamento per riprendere. I report restano sempre scaricabili dalla sezione Report.
        </Notice>
      )}
      {esito === "ok" && !subscribed && <RefreshSoon />}
      {esito === "ok" && subscribed && <Notice tone="success">Abbonamento attivo. Grazie!</Notice>}
      {cambio && current?.id === cambio && (
        <Notice tone="success">Piano cambiato: ora hai il piano {current.name}. La differenza viene calcolata sul periodo in corso.</Notice>
      )}
      {!configured && (
        <Notice tone="info">I pagamenti non sono ancora configurati su questo server (mancano le chiavi Stripe).</Notice>
      )}

      <section aria-labelledby="status-t" className="rounded-xl border border-line bg-card p-6">
        <h3 id="status-t" className="sr-only">Stato</h3>
        {company.plan_status === "trialing" && serviceActive && (
          <Status title={`Prova gratuita: ${days} ${days === 1 ? "giorno" : "giorni"} rimasti`} text={`La prova termina il ${date(company.trial_ends_at)}. Attiva l'abbonamento quando vuoi: non perdi nulla.`} />
        )}
        {company.plan_status === "trialing" && !serviceActive && (
          <Status tone="warn" title="La prova gratuita è terminata" text="Attiva l'abbonamento per riprendere a usare il tablet e la gestione delle presenze." />
        )}
        {company.plan_status === "active" && current && !company.cancel_at_period_end && (
          <Status
            tone="ok"
            title={`Piano ${current.name} attivo`}
            text={`${formatPrice(current.priceCents)} al mese + IVA (${formatPrice(dailyPriceCents(current.priceCents))} al giorno), fino a ${current.maxEmployees} dipendenti attivi.${company.current_period_end ? ` Prossimo rinnovo il ${date(company.current_period_end)}.` : ""}`}
          />
        )}
        {company.plan_status === "active" && isCustom && !company.cancel_at_period_end && (
          <Status
            tone="ok"
            title={`Piano ${CUSTOM_PLAN.name} attivo`}
            text={`Fino a ${employeeLimit(company)} dipendenti attivi.${company.current_period_end ? ` Prossimo rinnovo il ${date(company.current_period_end)}.` : ""} Per modifiche scrivi al nostro team.`}
          />
        )}
        {company.plan_status === "active" && (current || isCustom) && company.cancel_at_period_end && (
          <Status tone="warn" title={`Abbonamento disdetto: resta attivo fino al ${date(company.current_period_end)}`} text="Dopo quella data il tablet si ferma. Puoi annullare la disdetta dal portale di pagamento." />
        )}
        {company.plan_status === "past_due" && (
          <Status tone="error" title="Pagamento non riuscito" text="Aggiorna il metodo di pagamento: Stripe riproverà l'addebito nei prossimi giorni. Nel frattempo il servizio resta attivo." />
        )}
        {company.plan_status === "canceled" && (
          <Status tone="warn" title="Abbonamento terminato" text="Il tablet e le modifiche sono sospesi. Riattiva l'abbonamento per riprendere: i tuoi dati sono al sicuro." />
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!subscribed && configured && recommended && <CheckoutButton label={company.plan_status === "canceled" ? "Riattiva il piano" : "Attiva il piano"} />}
          {company.stripe_customer_id && configured && <PortalButton />}
        </div>
        {!subscribed && recommended && (
          <p className="mt-3 text-sm text-ink-soft">
            Hai {active} {active === 1 ? "dipendente attivo" : "dipendenti attivi"}: il piano adatto è <strong className="text-ink">{recommended.name}</strong>,{" "}
            {formatPrice(recommended.priceCents)} al mese + IVA, cioè {formatPrice(dailyPriceCents(recommended.priceCents))} al giorno.
          </p>
        )}
        {!recommended && !isCustom && (
          <p className="mt-3 text-sm text-ink-soft">
            Hai più di {MAX_EMPLOYEES} dipendenti attivi: il piano adatto è il <a href="#personalizzato" className="font-semibold text-brand underline-offset-4 hover:underline">{CUSTOM_PLAN.name}</a>.
          </p>
        )}
      </section>

      <section aria-labelledby="plans-t" className="space-y-4">
        <h3 id="plans-t" className="font-display text-lg font-bold">Piani</h3>
        <Pricing
          defaultPeriod="day"
          employees={active}
          currentPlan={subscribed ? company.plan : null}
          actions={Object.fromEntries(
            PLANS.filter((p) => subscribed && !isCustom && current?.id !== p.id && configured).map((p) => [
              p.id,
              <ChangePlan key={p.id} plan={p.id} name={p.name} disabledReason={active > p.maxEmployees ? `Hai ${active} dipendenti attivi` : null} />,
            ]),
          )}
          customAction={isCustom && subscribed ? <p className="text-sm text-white/70">Per modifiche al piano scrivi al nostro team.</p> : undefined}
        />
        <p className="text-sm text-ink-soft">Disdici quando vuoi: i report già fatti restano sempre scaricabili.</p>
      </section>

      {!(isCustom && subscribed) && (
        <section id="personalizzato" aria-labelledby="custom-t" className="scroll-mt-6 space-y-4">
          <div>
            <h3 id="custom-t" className="font-display text-lg font-bold">Piano {CUSTOM_PLAN.name}</h3>
            <p className="mt-1 max-w-2xl text-ink-soft">
              Oltre {MAX_EMPLOYEES} dipendenti, più sedi o regole particolari? Lo sviluppiamo cucito per te. Raccontaci come lavorate.
            </p>
          </div>
          <CustomPlanForm companyName={company.name} email={user.email ?? ""} />
        </section>
      )}
    </div>
  );
}

function Status({ title, text, tone }: { title: string; text: string; tone?: "ok" | "warn" | "error" }) {
  const color = tone === "ok" ? "text-present" : tone === "warn" ? "text-warn" : tone === "error" ? "text-danger" : "text-ink";
  return (
    <div>
      <p className={`font-display text-xl font-bold ${color}`}>{title}</p>
      <p className="mt-1 text-ink-soft">{text}</p>
    </div>
  );
}
