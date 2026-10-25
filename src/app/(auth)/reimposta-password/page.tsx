"use client";

import { useActionState } from "react";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { updatePassword, type FormState } from "../actions";

export default function Page() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Scegli una nuova password</h1>
      <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <Field label="Nuova password" name="password" type="password" autoComplete="new-password" hint="Almeno 8 caratteri" error={state.errors?.password} required />
        <Field label="Ripeti la password" name="confirm" type="password" autoComplete="new-password" error={state.errors?.confirm} required />
        <SubmitButton pendingText="Salvataggio…">Salva password</SubmitButton>
      </form>
    </>
  );
}
