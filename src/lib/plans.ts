/**
 * Piani di abbonamento — UNICA fonte di verità per nomi, prezzi, limiti e testi.
 * Tutte le schermate (Abbonamento, Prezzi pubblici) si costruiscono da qui:
 * per cambiare un prezzo o una soglia si modifica solo questo file (e il prezzo in Stripe).
 */

/** Piani con pagamento online (Stripe Checkout). */
export type StandardPlanId = "base" | "plus";
/** "custom" = piano Personalizzato, su preventivo, attivato dal team con un prezzo dedicato in Stripe. */
export type PlanId = StandardPlanId | "custom";

export interface Plan {
  id: StandardPlanId;
  name: string;
  tagline: string;
  minEmployees: number;
  maxEmployees: number;
  priceCents: number; // al mese, IVA esclusa
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    id: "base",
    name: "Base",
    tagline: "Per il negozio, il bar, lo studio.",
    minEmployees: 1,
    maxEmployees: 5,
    priceCents: 999,
    highlights: ["Fino a 5 dipendenti attivi", "Tablet illimitati", "Report PDF ed Excel per il consulente"],
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Per il ristorante, il laboratorio, la piccola impresa.",
    minEmployees: 6,
    maxEmployees: 30,
    priceCents: 2999,
    highlights: ["Fino a 30 dipendenti attivi", "Tablet illimitati", "Report PDF ed Excel per il consulente"],
  },
];

export const CUSTOM_PLAN = {
  id: "custom" as const,
  name: "Personalizzato",
  tagline: "Per aziende con più di 30 dipendenti o più sedi.",
  highlights: [
    "Da sviluppare, cucito per te",
    "Regole e report su misura del tuo contratto",
    "Più sedi e responsabili",
    "Assistenza diretta e attivazione guidata",
  ],
};

/** Fasce di dipendenti nel modulo di richiesta del Personalizzato (devono coincidere con il vincolo nel DB). */
export const EMPLOYEE_RANGES = [
  { value: "31-50", label: "Da 31 a 50" },
  { value: "51-100", label: "Da 51 a 100" },
  { value: "101-250", label: "Da 101 a 250" },
  { value: "250+", label: "Oltre 250" },
] as const;

/** Incluso in tutti i piani (mostrato una volta sola, sotto i piani). */
export const INCLUDED_IN_ALL = [
  "Timbratura da tablet con PIN",
  "Straordinari, ore notturne e festive",
  "Ferie, permessi e malattia con calendario",
  "Chiusura del mese con PDF archiviato",
  "Dati su server in Europa",
  "14 giorni di prova gratuita",
];

/** Oltre questo numero di dipendenti serve il piano Personalizzato. È anche il limite durante la prova. */
export const MAX_EMPLOYEES = PLANS.at(-1)!.maxEmployees;
/** Limite predefinito del Personalizzato se il team non ne imposta uno. */
export const CUSTOM_DEFAULT_LIMIT = 1000;

export function planById(id: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

export function planName(id: string | null | undefined): string {
  return id === "custom" ? CUSTOM_PLAN.name : planById(id)?.name ?? "";
}

/** Il piano più economico che copre questi dipendenti attivi. Null = serve il Personalizzato. */
export function planForEmployees(activeEmployees: number): Plan | null {
  return PLANS.find((p) => activeEmployees <= p.maxEmployees) ?? null;
}

/** "9,99 €" */
export function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/** Prezzo medio al giorno (anno di 365 giorni): 999 → 33 centesimi. */
export function dailyPriceCents(monthlyCents: number): number {
  return Math.round((monthlyCents * 12) / 365);
}

/** Costo medio al giorno per ciascun dipendente, in centesimi arrotondati per eccesso (8,3 → 9). */
export function dailyPerEmployeeCents(p: Plan, employees: number): number {
  return Math.ceil(dailyPriceCents(p.priceCents) / Math.max(1, Math.min(employees, p.maxEmployees)));
}

/** "fino a 5" / "da 6 a 30" */
export function employeeRangeLabel(p: Plan): string {
  return p.minEmployees <= 1 ? `fino a ${p.maxEmployees}` : `da ${p.minEmployees} a ${p.maxEmployees}`;
}

export type PlanStatus = "trialing" | "active" | "past_due" | "canceled";

export interface Subscription {
  plan_status: PlanStatus;
  trial_ends_at: string;
  plan: string | null;
  custom_employee_limit?: number | null;
}

/**
 * Il servizio è attivo? Prova non scaduta, abbonamento attivo o pagamento in ritardo
 * (Stripe ritenta l'addebito per qualche giorno: nel frattempo non blocchiamo il cliente).
 */
export function isServiceActive(s: Subscription, now = new Date()): boolean {
  if (s.plan_status === "active" || s.plan_status === "past_due") return true;
  if (s.plan_status === "trialing") return new Date(s.trial_ends_at).getTime() > now.getTime();
  return false;
}

/** Quanti dipendenti attivi sono ammessi adesso. */
export function employeeLimit(s: Subscription): number {
  if (s.plan_status === "trialing") return MAX_EMPLOYEES;
  if (s.plan === "custom") return s.custom_employee_limit ?? CUSTOM_DEFAULT_LIMIT;
  return planById(s.plan)?.maxEmployees ?? MAX_EMPLOYEES;
}

/** Da stato Stripe a stato dell'app. "incomplete" non cambia nulla: il pagamento è ancora in corso. */
export function mapStripeStatus(status: string, current: PlanStatus): PlanStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return current;
  }
}
