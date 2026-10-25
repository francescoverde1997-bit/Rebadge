"use client";

import { useActionState, useEffect, useState } from "react";
import { Notice, SubmitButton, submitWithoutReset } from "@/components/ui";
import { closeMonth, type CloseState } from "./actions";

/** PDF definitivo: prima una conferma chiara, poi download e chiusura del mese. */
export function CloseMonth({ month, label }: { month: string; label: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<CloseState, FormData>(closeMonth, {});

  useEffect(() => {
    if (state.downloadUrl) {
      window.location.assign(state.downloadUrl);
      // dopo il download la pagina mostra il mese come chiuso
      const t = setTimeout(() => window.location.reload(), 1500);
      return () => clearTimeout(t);
    }
  }, [state.downloadUrl]);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
      >
        PDF definitivo per il consulente
      </button>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(action)} className="anim-in space-y-4 rounded-lg border border-warn bg-warn-soft/60 p-5">
      <input type="hidden" name="month" value={month} />
      <p className="font-semibold">Scaricando il PDF definitivo, {label} viene chiuso.</p>
      <ul className="list-disc space-y-1 pl-5 text-ink-soft">
        <li>Le timbrature e le assenze di {label} non si potranno più modificare.</li>
        <li>Il PDF resta archiviato: potrai riscaricarlo identico quando vuoi.</li>
        <li>Per riaprire il mese dovrai contattare l&apos;assistenza.</li>
      </ul>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending || Boolean(state.downloadUrl)} pendingText="Preparazione del PDF…">
          Scarica e chiudi {label}
        </SubmitButton>
        <button type="button" onClick={() => setAsking(false)} className="h-11 px-3 font-semibold text-ink-soft hover:text-ink">
          Annulla
        </button>
      </div>
    </form>
  );
}
