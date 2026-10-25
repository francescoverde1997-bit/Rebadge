import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapStripeStatus, type PlanStatus } from "@/lib/plans";
import { planForPriceId } from "@/lib/stripe";

/**
 * Copia lo stato di un abbonamento Stripe sull'azienda. Idempotente: i webhook possono
 * arrivare più volte o in ordine diverso, il risultato è sempre lo stato attuale di Stripe.
 */
export async function syncSubscription(sub: Stripe.Subscription, companyIdHint?: string | null): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante");

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const companyId = companyIdHint ?? sub.metadata?.company_id ?? null;
  const q = admin.from("companies").select("id, plan_status");
  const { data: company } = companyId ? await q.eq("id", companyId).maybeSingle() : await q.eq("stripe_customer_id", customerId).maybeSingle();
  if (!company) throw new Error(`Azienda non trovata per il cliente Stripe ${customerId}`);

  const item = sub.items.data[0];
  // dalle versioni API 2025 la fine del periodo sta sulla riga dell'abbonamento
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end;

  const { error } = await admin.from("companies").update({
    plan: planForPriceId(item?.price?.id),
    plan_status: mapStripeStatus(sub.status, company.plan_status as PlanStatus),
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  }).eq("id", company.id);
  if (error) throw new Error(`Aggiornamento abbonamento non riuscito: ${error.message}`);
}

/** Salva il cliente Stripe sull'azienda (prima del Checkout). */
export async function saveStripeCustomer(companyId: string, customerId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante");
  const { error } = await admin.from("companies").update({ stripe_customer_id: customerId }).eq("id", companyId);
  if (error) throw new Error(error.message);
}
