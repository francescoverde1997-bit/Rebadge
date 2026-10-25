"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notice, SubmitButton } from "@/components/ui";
import { changePlan, openPortal, startCheckout, type BillingState } from "./actions";

export function CheckoutButton({ label }: { label: string }) {
  const [state, action] = useActionState<BillingState>(startCheckout, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton pendingText="Apertura del pagamento…">{label}</SubmitButton>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}

export function PortalButton() {
  const [state, action] = useActionState<BillingState>(openPortal, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton variant="secondary" pendingText="Apertura…">Pagamenti, fatture e disdetta</SubmitButton>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}

export function ChangePlan({ plan, name, disabledReason }: { plan: string; name: string; disabledReason: string | null }) {
  const [state, action] = useActionState<BillingState, FormData>(changePlan, {});
  if (disabledReason) return <p className="mt-auto text-sm text-ink-soft">{disabledReason}: troppi per questo piano.</p>;
  return (
    <form action={action} className="mt-auto flex flex-col gap-2">
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton variant="secondary" pendingText="Cambio in corso…">Passa a {name}</SubmitButton>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}
    </form>
  );
}

/** Dopo il pagamento il webhook di Stripe può arrivare con qualche secondo di ritardo: ricarica finché non c'è. */
export function RefreshSoon() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [router]);
  return <Notice tone="info">Pagamento ricevuto: stiamo attivando l&apos;abbonamento…</Notice>;
}
