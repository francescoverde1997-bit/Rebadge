"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import {
  CUSTOM_PLAN, INCLUDED_IN_ALL, MAX_EMPLOYEES, PLANS,
  dailyPerEmployeeCents, dailyPriceCents, employeeRangeLabel, formatPrice, planForEmployees,
  type PlanId, type StandardPlanId,
} from "@/lib/plans";

type Period = "month" | "day";

/**
 * Tabella prezzi, costruita interamente da src/lib/plans.ts.
 * - interactive: il visitatore sceglie quanti dipendenti ha e il piano adatto si evidenzia (pagina Prezzi);
 *   altrimenti si usa `employees` (dipendenti attivi reali, area riservata).
 * - actions / customAction: il pulsante di ogni piano, deciso da chi usa il componente.
 */
export function Pricing({
  employees: initialEmployees = 4,
  interactive = false,
  currentPlan = null,
  actions = {},
  customAction,
  defaultPeriod = "month",
}: {
  /** Vista iniziale dei prezzi; l'utente può sempre cambiarla. */
  defaultPeriod?: Period;
  employees?: number;
  interactive?: boolean;
  currentPlan?: PlanId | null;
  actions?: Partial<Record<StandardPlanId, ReactNode>>;
  customAction?: ReactNode;
}) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [employees, setEmployees] = useState(initialEmployees);
  const match = planForEmployees(employees);
  const matchId: PlanId = match?.id ?? "custom";

  const badgeFor = (id: PlanId) =>
    currentPlan === id ? "Il tuo piano" : !currentPlan && matchId === id ? "Adatto a te" : null;

  return (
    <div className="space-y-6">
      <div className={`flex flex-col gap-5 ${interactive ? "lg:flex-row lg:items-end lg:justify-between" : "sm:flex-row sm:items-center sm:justify-between"}`}>
        {interactive ? (
          <EmployeeSlider value={employees} onChange={setEmployees} />
        ) : (
          <p className="text-ink-soft">
            Hai <strong className="text-ink">{employees} {employees === 1 ? "dipendente attivo" : "dipendenti attivi"}</strong>.
            Contano solo quelli attivi.
          </p>
        )}
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      <ol className="grid gap-4 lg:grid-cols-3" aria-label="Piani">
        {PLANS.map((p) => {
          const badge = badgeFor(p.id);
          const day = formatPrice(dailyPriceCents(p.priceCents));
          const month = formatPrice(p.priceCents);
          return (
            <li
              key={p.id}
              data-plan={p.id}
              className={`card-hover lift relative flex flex-col rounded-2xl border bg-card p-6 sm:p-7 ${
                badge ? "border-brand shadow-[0_0_0_1px_var(--color-brand),0_18px_40px_-24px_rgba(36,80,138,.55)]" : "border-line"
              }`}
            >
              {badge && <Badge tone="brand">{badge}</Badge>}
              <PlanHeader name={p.name} range={`${employeeRangeLabel(p)} dipendenti`} tagline={p.tagline} />
              <div className="mt-6" aria-live="polite">
                <p className="flex items-baseline gap-1.5">
                  <span key={period} className="price-in font-display text-5xl font-bold tracking-tight tabular-nums">
                    {period === "month" ? month : day}
                  </span>
                  <span className="text-ink-soft">{period === "month" ? "al mese" : "al giorno"}</span>
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {period === "month" ? (
                    <>+ IVA · <span className="font-semibold text-present">{day} al giorno</span></>
                  ) : (
                    <>Equivale a {month} al mese + IVA · <span className="font-semibold text-ink">fatturazione mensile</span></>
                  )}
                </p>
              </div>
              <Highlights items={p.highlights} />
              {actions[p.id] && <div className="mt-auto pt-7">{actions[p.id]}</div>}
            </li>
          );
        })}

        <li
          data-plan="custom"
          className={`card-hover lift relative flex flex-col rounded-2xl bg-ink p-6 text-white sm:p-7 ${
            badgeFor("custom") ? "shadow-[0_0_0_2px_var(--color-brand),0_18px_40px_-20px_rgba(27,43,68,.7)]" : ""
          }`}
        >
          {badgeFor("custom") && <Badge tone="light">{badgeFor("custom")}</Badge>}
          <PlanHeader name={CUSTOM_PLAN.name} range={`oltre ${MAX_EMPLOYEES} dipendenti`} tagline={CUSTOM_PLAN.tagline} dark />
          <div className="mt-6">
            <p className="font-display text-5xl font-bold tracking-tight">Su misura</p>
            <p className="mt-2 text-sm text-white/70">Prezzo su preventivo, sui numeri della tua azienda</p>
          </div>
          <Highlights items={CUSTOM_PLAN.highlights} dark />
          <div className="mt-auto pt-7">
            {customAction ?? (
              <a href="#personalizzato" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-white px-5 font-semibold text-ink transition-colors hover:bg-white/90">
                Richiedi un preventivo
              </a>
            )}
          </div>
        </li>
      </ol>

      <div className="rounded-2xl border border-line bg-card px-6 py-5 sm:px-7">
        <p className="font-display text-lg font-bold">In tutti i piani</p>
        <ul className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED_IN_ALL.map((t) => (
            <li key={t} className="flex gap-2.5 text-ink-soft"><Check className="text-present" />{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Pulsante standard per la pagina pubblica: porta alla registrazione. */
export function TrialLink({ primary = false }: { primary?: boolean }) {
  return (
    <Link
      href="/registrati"
      className={`inline-flex h-11 w-full items-center justify-center rounded-lg px-5 font-semibold transition-colors ${
        primary ? "bg-brand text-white hover:bg-brand-dark" : "border border-line bg-card text-ink hover:border-ink-soft"
      }`}
    >
      Prova gratis 14 giorni
    </Link>
  );
}

function EmployeeSlider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const id = useId();
  const max = 60;
  const plan = planForEmployees(value);
  return (
    <div className="w-full max-w-xl">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="font-display text-lg font-bold">Quanti dipendenti hai?</label>
        <output htmlFor={id} className="font-display text-3xl font-bold tabular-nums">
          {value >= max ? `${max}+` : value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-brand"
        aria-valuetext={`${value} dipendenti`}
      />
      <p className="mt-2 min-h-12 text-ink-soft" aria-live="polite">
        {plan ? (
          <>
            Piano <strong className="text-ink">{plan.name}</strong>: {formatPrice(dailyPriceCents(plan.priceCents))} al giorno per tutta l&apos;azienda,
            circa <strong className="text-ink">{dailyPerEmployeeCents(plan, value)} centesimi</strong> al giorno a dipendente.
          </>
        ) : (
          <>
            Oltre {MAX_EMPLOYEES} dipendenti: piano <strong className="text-ink">{CUSTOM_PLAN.name}</strong>, da sviluppare e cucito per te.
          </>
        )}
      </p>
    </div>
  );
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const opts: { v: Period; label: string }[] = [{ v: "month", label: "Al mese" }, { v: "day", label: "Al giorno" }];
  return (
    <div role="group" aria-label="Mostra il prezzo" className="inline-flex shrink-0 self-start rounded-full border border-line bg-card p-1 lg:self-auto">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
            value === o.v ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlanHeader({ name, range, tagline, dark = false }: { name: string; range: string; tagline: string; dark?: boolean }) {
  // Altezze fisse: i prezzi restano allineati tra le colonne anche se i testi vanno a capo
  return (
    <div>
      <h3 className="font-display text-2xl font-bold tracking-tight">{name}</h3>
      <p className={`text-sm tabular-nums ${dark ? "text-white/70" : "text-ink-soft"}`}>{range}</p>
      <p className={`mt-3 lg:min-h-12 ${dark ? "text-white/80" : "text-ink-soft"}`}>{tagline}</p>
    </div>
  );
}

function Highlights({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ul className={`mt-6 space-y-2.5 border-t pt-5 ${dark ? "border-white/15" : "border-line"}`}>
      {items.map((t) => (
        <li key={t} className={`flex gap-2.5 ${dark ? "text-white/90" : "text-ink"}`}>
          <Check className={dark ? "text-[#8fd3b0]" : "text-present"} />
          {t}
        </li>
      ))}
    </ul>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "brand" | "light" }) {
  return (
    <span
      className={`anim-pop absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-semibold ${
        tone === "brand" ? "bg-brand text-white" : "bg-white text-ink"
      }`}
    >
      {children}
    </span>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`mt-0.5 h-5 w-5 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
