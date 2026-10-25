import "server-only";
import Stripe from "stripe";
import { PLANS, type PlanId, type StandardPlanId } from "@/lib/plans";

/** Client Stripe, o null se i pagamenti non sono ancora configurati. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Solo per i test: punta a uno Stripe simulato (es. http://localhost:54500)
  const base = process.env.STRIPE_API_BASE;
  if (base) {
    const u = new URL(base);
    return new Stripe(key, { host: u.hostname, port: Number(u.port || 80), protocol: u.protocol.replace(":", "") as "http" | "https" });
  }
  return new Stripe(key);
}

/** Variabile d'ambiente con l'ID del prezzo Stripe di ogni piano standard: STRIPE_PRICE_BASE, STRIPE_PRICE_PLUS… */
const envName = (plan: StandardPlanId) => `STRIPE_PRICE_${plan.toUpperCase()}`;

export function priceIdFor(plan: StandardPlanId): string | null {
  return process.env[envName(plan)] || null;
}

/**
 * Piano corrispondente a un prezzo Stripe. Un prezzo che non è di un piano standard
 * è un prezzo su misura creato dal team: piano Personalizzato.
 */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  return PLANS.find((p) => priceIdFor(p.id) === priceId)?.id ?? "custom";
}

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && PLANS.every((p) => priceIdFor(p.id)) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
