import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { syncSubscription } from "@/lib/billing";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Webhook di Stripe: l'unico punto in cui cambia lo stato dell'abbonamento. Firma verificata. */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new NextResponse("Pagamenti non configurati", { status: 503 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("Firma non valida", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          await syncSubscription(sub, s.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Stripe non garantisce l'ordine degli eventi: si rilegge l'abbonamento, così vince sempre lo stato attuale
        // e un evento arrivato in ritardo non sovrascrive quello più recente.
        const sub = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
        await syncSubscription(sub);
        break;
      }
      default:
        break; // altri eventi: non ci servono
    }
  } catch (e) {
    console.error("[stripe webhook]", event.type, e);
    return new NextResponse("Errore", { status: 500 }); // Stripe riproverà
  }
  return NextResponse.json({ received: true });
}
