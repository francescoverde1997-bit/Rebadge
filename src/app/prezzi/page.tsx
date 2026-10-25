import type { Metadata } from "next";
import { CUSTOM_PLAN, MAX_EMPLOYEES, PLANS, dailyPriceCents, formatPrice } from "@/lib/plans";
import { Pricing, TrialLink } from "@/components/pricing";
import { CustomPlanForm } from "@/components/custom-plan-form";
import { SiteFooter, SiteHeader } from "@/components/site";

const fromDay = formatPrice(dailyPriceCents(PLANS[0].priceCents));

export const metadata: Metadata = {
  title: "Prezzi · ReBadge",
  description: `Rilevazione presenze da tablet per piccole aziende. Da ${fromDay} al giorno, IVA esclusa. 14 giorni di prova gratuita.`,
};

const FAQ = [
  {
    q: "Come si contano i dipendenti?",
    a: "Contano solo i dipendenti attivi. Chi lascia l'azienda si disattiva e non pesa sul prezzo, ma le sue ore restano nei report.",
  },
  {
    q: "Posso cambiare piano?",
    a: "Sì, quando vuoi. Se assumi e superi il limite passi al piano successivo: paghi solo la differenza per i giorni che restano.",
  },
  {
    q: "Serve la carta di credito per provare?",
    a: "No. Hai 14 giorni con tutte le funzioni e fino a 30 dipendenti. Decidi alla fine se attivare l'abbonamento.",
  },
  {
    q: "Cosa succede se disdico?",
    a: "Il servizio resta attivo fino alla fine del mese pagato. Dopo, il tablet si ferma ma i report già fatti restano sempre scaricabili.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Le presenze della tua azienda, da <span className="text-brand">{fromDay}</span> al giorno.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
              Paghi in base a quanti dipendenti hai, niente di più. I dipendenti timbrano dal tablet,
              a fine mese mandi il report al consulente. Prezzi IVA esclusa, 14 giorni di prova senza carta di credito.
            </p>
          </div>
          <div className="mt-12">
            <Pricing
              interactive
              actions={Object.fromEntries(PLANS.map((p, i) => [p.id, <TrialLink key={p.id} primary={i === PLANS.length - 1} />]))}
            />
          </div>
        </section>

        <section id="personalizzato" aria-labelledby="custom-t" className="scroll-mt-20 border-y border-line bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <h2 id="custom-t" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Più di {MAX_EMPLOYEES} dipendenti? Lo sviluppiamo cucito per te.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-soft">
                Con il piano {CUSTOM_PLAN.name} partiamo da come lavorate davvero: turni, sedi, reparti,
                le regole del vostro contratto. E costruiamo lo strumento attorno a voi.
              </p>
              <ol className="mt-8 space-y-5">
                {[
                  ["Ci racconti come lavorate", "Una chiamata di mezz'ora, senza impegno."],
                  ["Ti mandiamo una proposta", "Cosa sviluppiamo, tempi e prezzo, nero su bianco."],
                  ["Lo costruiamo con te", "Attivazione guidata e assistenza diretta."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-display font-bold text-white tabular-nums">{i + 1}</span>
                    <div>
                      <p className="font-semibold">{t}</p>
                      <p className="text-ink-soft">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <CustomPlanForm />
          </div>
        </section>

        <section aria-labelledby="faq-t" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 id="faq-t" className="font-display text-3xl font-bold tracking-tight">Domande frequenti</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="text-2xl leading-none text-ink-soft transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
