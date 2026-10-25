"use client";

import { useActionState } from "react";
import { Field, Notice, SubmitButton, TextLink } from "@/components/ui";
import { requestPasswordReset, type FormState } from "../actions";

export default function Page() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Recupera la password</h1>
      <p className="mt-2 text-ink-soft">Ti mandiamo un link per sceglierne una nuova.</p>
      {state.success ? (
        <div className="mt-8 space-y-4">
          <Notice tone="success">{state.success}</Notice>
          <TextLink href="/accedi" className="text-sm">Torna all&apos;accesso</TextLink>
        </div>
      ) : (
        <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.errors?.email} required />
          <SubmitButton pendingText="Invio…">Invia il link</SubmitButton>
          <TextLink href="/accedi" className="text-center text-sm">Torna all&apos;accesso</TextLink>
        </form>
      )}
    </>
  );
}
