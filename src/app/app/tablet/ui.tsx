"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Notice, SubmitButton, submitWithoutReset } from "@/components/ui";
import { readKioskToken, saveKioskToken } from "@/lib/kiosk";
import { createClient } from "@/lib/supabase/client";
import type { FormState } from "../../(auth)/actions";
import { activateThisDevice, revokeDevice, type ActivateState } from "./actions";

export function ActivateDevice() {
  const [state, action, pending] = useActionState<ActivateState, FormData>(activateThisDevice, {});
  const [confirming, setConfirming] = useState(false);

  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    if (!state.token) return;
    saveKioskToken(state.token);
    if (readKioskToken() !== state.token) { setStorageError(true); return; }
    // chiude l'accesso del titolare su questo dispositivo, poi apre la timbratrice
    createClient().auth.signOut().finally(() => window.location.replace("/timbra"));
  }, [state.token]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
      >
        Attiva questo tablet
      </button>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(action)} className="anim-in flex flex-col gap-4" noValidate>
      <Field
        label="Nome del tablet"
        name="name"
        defaultValue="Ingresso"
        maxLength={60}
        hint="Ti serve per riconoscerlo nell'elenco, ad esempio Ingresso o Magazzino."
        error={state.errors?.name}
      />
      <Notice tone="info">Su questo dispositivo uscirai dal tuo account e si aprirà la schermata per timbrare.</Notice>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {storageError && (
        <Notice tone="error">
          Questo browser non permette di salvare dati (forse è in navigazione privata). Apri la pagina in una finestra normale e riprova.
        </Notice>
      )}
      <div className="flex gap-3">
        <SubmitButton pending={pending || (Boolean(state.token) && !storageError)} pendingText="Attivazione…">Attiva e apri la timbratrice</SubmitButton>
        <button type="button" onClick={() => setConfirming(false)} className="h-11 px-3 font-semibold text-ink-soft hover:text-ink">
          Annulla
        </button>
      </div>
    </form>
  );
}

export function RevokeDevice({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState<FormState, FormData>(revokeDevice, {});
  const [confirming, setConfirming] = useState(false);

  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Disattiva il tablet ${name}`}
        className="h-9 rounded-lg px-3 text-sm font-semibold text-ink-soft hover:text-danger"
      >
        Disattiva
      </button>
    );
  }
  return (
    <form action={action} className="anim-pop flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-sm">Disattivare {name}?</span>
      <SubmitButton variant="danger" className="h-9 px-3 text-sm" pendingText="…">Sì, disattiva</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="h-9 px-2 text-sm font-semibold text-ink-soft">No</button>
    </form>
  );
}
