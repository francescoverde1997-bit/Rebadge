"use client";

import { useActionState, useId } from "react";
import { Field, Notice, SelectField, SubmitButton, submitWithoutReset } from "@/components/ui";
import { requestCustomPlan, type CustomPlanState } from "@/app/prezzi/actions";
import { EMPLOYEE_RANGES } from "@/lib/plans";

/** Richiesta di preventivo per il piano Personalizzato. Funziona anche per chi non è registrato. */
export function CustomPlanForm({ companyName = "", email = "" }: { companyName?: string; email?: string }) {
  const [state, dispatch, pending] = useActionState<CustomPlanState, FormData>(requestCustomPlan, {});
  const msgId = useId();
  const fe = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div role="status" className="anim-in rounded-2xl border border-present/30 bg-present-soft p-6 sm:p-8">
        <p className="font-display text-2xl font-bold text-present">Richiesta inviata</p>
        <p className="mt-2 text-ink">
          Grazie! Ti ricontattiamo a breve per capire come lavorate e prepararti una proposta su misura.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submitWithoutReset(dispatch)} noValidate className="relative space-y-4 rounded-2xl border border-line bg-card p-6 sm:p-8">
      {/* Campo trappola per i bot: nascosto alle persone e agli screen reader */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>Sito web<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Azienda" name="company_name" defaultValue={companyName} autoComplete="organization" required error={fe.company_name} />
        <Field label="Il tuo nome" name="contact_name" autoComplete="name" required error={fe.contact_name} />
        <Field label="Email" name="email" type="email" defaultValue={email} autoComplete="email" required error={fe.email} />
        <Field label="Telefono" name="phone" type="tel" autoComplete="tel" hint="Facoltativo" error={fe.phone} />
        <SelectField
          label="Dipendenti"
          name="employees_range"
          defaultValue=""
          error={fe.employees_range}
          options={[{ value: "", label: "Scegli…" }, ...EMPLOYEE_RANGES.map((r) => ({ value: r.value, label: r.label }))]}
        />
        <Field label="Sedi" name="locations" type="number" inputMode="numeric" min={1} max={1000} hint="Facoltativo" error={fe.locations} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={msgId} className="text-sm font-medium text-ink">Di cosa avete bisogno?</label>
        <textarea
          id={msgId}
          name="message"
          rows={4}
          maxLength={2000}
          placeholder="Es. turni su più sedi, reparti, regole del vostro contratto, collegamento al software paghe…"
          className={`rounded-lg border bg-card px-3 py-2.5 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-brand ${fe.message ? "border-danger" : "border-line"}`}
        />
        {fe.message ? <p className="text-sm text-danger">{fe.message}</p> : <p className="text-sm text-ink-soft">Facoltativo</p>}
      </div>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">Nessun impegno: usiamo i tuoi dati solo per risponderti.</p>
        <SubmitButton pending={pending} pendingText="Invio…" className="sm:shrink-0">Richiedi un preventivo</SubmitButton>
      </div>
    </form>
  );
}
