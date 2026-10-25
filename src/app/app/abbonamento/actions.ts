"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { saveStripeCustomer, syncSubscription } from "@/lib/billing";
import { planById, planForEmployees, MAX_EMPLOYEES } from "@/lib/plans";
import { getStripe, priceIdFor, siteUrl } from "@/lib/stripe";

export type BillingState = { error?: string; success?: string };

/** Stati Stripe di un abbonamento ancora in vita (non si apre un secondo Checkout). */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

async function activeEmployees(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("employees").select("id", { count: "exact", head: true })
    .eq("company_id", companyId).eq("active", true);
  return count ?? 0;
}

/** Attiva l'abbonamento: piano scelto in base ai dipendenti attivi, pagamento su Stripe Checkout. */
export async function startCheckout(): Promise<BillingState> {
  const { company, user } = await requireOwner();
  const stripe = getStripe();
  if (!stripe) return { error: "I pagamenti non sono ancora configurati." };

  const plan = planForEmployees(await activeEmployees(company.id));
  if (!plan) return { error: `Oltre ${MAX_EMPLOYEES} dipendenti serve il piano Personalizzato: richiedi un preventivo qui sotto.` };
  const price = priceIdFor(plan.id);
  if (!price) return { error: "Il prezzo del piano non è configurato." };

  let customer = company.stripe_customer_id;
  // Mai due abbonamenti per la stessa azienda (doppio clic, due schede aperte, webhook non ancora arrivato):
  // se Stripe ne ha già uno vivo, si gestisce dal portale.
  if (customer) {
    const subs = await stripe.subscriptions.list({ customer, status: "all", limit: 20 });
    if (subs.data.some((x) => LIVE_STATUSES.has(x.status))) {
      return { error: "Hai già un abbonamento attivo. Se l'hai appena attivato, ricarica la pagina tra qualche secondo; per pagamenti e fatture usa \"Pagamenti, fatture e disdetta\"." };
    }
  }
  if (!customer) {
    const c = await stripe.customers.create({
      email: user.email ?? undefined,
      name: company.name,
      preferred_locales: ["it"],
      metadata: { company_id: company.id },
    });
    customer = c.id;
    await saveStripeCustomer(company.id, customer);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: company.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { company_id: company.id } },
    locale: "it",
    allow_promotion_codes: true,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true }, // Partita IVA in fattura
    customer_update: { address: "auto", name: "auto" },
    success_url: `${siteUrl()}/app/abbonamento?esito=ok`,
    cancel_url: `${siteUrl()}/app/abbonamento`,
  });
  if (!session.url) return { error: "Non è stato possibile aprire il pagamento. Riprova" };
  redirect(session.url);
}

/** Cambio di piano (su o giù): Stripe calcola la differenza sul periodo in corso. */
export async function changePlan(_: BillingState, form: FormData): Promise<BillingState> {
  const { company } = await requireOwner();
  const stripe = getStripe();
  const target = planById(String(form.get("plan") ?? ""));
  if (!stripe || !target) return { error: "Piano non valido" };
  if (!company.stripe_subscription_id || company.plan_status === "canceled") return { error: "Nessun abbonamento attivo da modificare" };
  if (company.plan === "custom") return { error: "Il piano Personalizzato si modifica con il nostro team: scrivici." };
  if (company.plan === target.id) return { success: `Hai già il piano ${target.name}` };

  const active = await activeEmployees(company.id);
  if (active > target.maxEmployees) {
    return { error: `Il piano ${target.name} consente al massimo ${target.maxEmployees} dipendenti attivi: ora ne hai ${active}. Disattiva qualcuno prima di cambiare.` };
  }
  const price = priceIdFor(target.id);
  if (!price) return { error: "Il prezzo del piano non è configurato." };

  const sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
    metadata: { company_id: company.id },
  });
  await syncSubscription(updated, company.id); // non aspettiamo il webhook per mostrare il nuovo piano
  revalidatePath("/app", "layout");
  // la conferma la mostra la pagina: il pulsante di questo piano sparisce, ora è il piano attuale
  redirect(`/app/abbonamento?cambio=${target.id}`);
}

/** Portale Stripe: metodo di pagamento, fatture, disdetta. */
export async function openPortal(): Promise<BillingState> {
  const { company } = await requireOwner();
  const stripe = getStripe();
  if (!stripe || !company.stripe_customer_id) return { error: "Nessun abbonamento da gestire" };
  const portal = await stripe.billingPortal.sessions.create({
    customer: company.stripe_customer_id,
    return_url: `${siteUrl()}/app/abbonamento`,
    locale: "it",
  });
  redirect(portal.url);
}
