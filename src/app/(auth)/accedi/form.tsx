"use client";

import { useActionState } from "react";
import { Field, Notice, SubmitButton, TextLink } from "@/components/ui";
import { signIn, type FormState } from "../actions";

export function SignInForm() {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.errors?.email} required />
      <div className="flex flex-col gap-1.5">
        <Field label="Password" name="password" type="password" autoComplete="current-password" error={state.errors?.password} required />
        <TextLink href="/password-dimenticata" className="self-end text-sm">Password dimenticata?</TextLink>
      </div>
      <SubmitButton pendingText="Accesso in corso…">Accedi</SubmitButton>
      <p className="text-center text-sm text-ink-soft">
        Non hai un account? <TextLink href="/registrati">Registra la tua azienda</TextLink>
      </p>
    </form>
  );
}
