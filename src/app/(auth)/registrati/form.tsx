"use client";

import { useActionState } from "react";
import { Field, Notice, SubmitButton, TextLink } from "@/components/ui";
import { signUp, type FormState } from "../actions";

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUp, {});

  if (state.success) {
    return (
      <div className="mt-8 space-y-4">
        <Notice tone="success">{state.success}</Notice>
        <p className="text-sm text-ink-soft">
          Non trovi l&apos;email? Controlla nella posta indesiderata.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field
        label="Nome"
        name="name"
        autoComplete="organization"
        placeholder="Es. Bar Centrale"
        hint="Il nome della tua azienda. Comparirà in alto nella dashboard e potrai cambiarlo quando vuoi."
        defaultValue={state.values?.name}
        error={state.errors?.name}
        required
      />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.errors?.email} required />
      <Field label="Password" name="password" type="password" autoComplete="new-password" hint="Almeno 8 caratteri" error={state.errors?.password} required />
      <SubmitButton pendingText="Creazione account…">Crea account</SubmitButton>
      <p className="text-center text-sm text-ink-soft">
        Hai già un account? <TextLink href="/accedi">Accedi</TextLink>
      </p>
    </form>
  );
}
