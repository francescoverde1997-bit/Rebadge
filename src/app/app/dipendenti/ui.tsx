"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Field, Notice, Reveal, SubmitButton, submitWithoutReset } from "@/components/ui";
import { generatePin } from "@/lib/validation";
import type { FormState } from "../../(auth)/actions";
import { changePin, createEmployee, setEmployeeActive, updateEmployee } from "./actions";

export type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  active: boolean;
  pin_set_at: string | null;
};

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  return null;
}

/** Campo PIN con pulsante "Genera": il titolare non deve inventarsi nulla. */
function PinField({ error, label = "PIN per il tablet" }: { error?: string; label?: string }) {
  const [pin, setPin] = useState("");
  const id = useId(); // più campi PIN possono essere aperti insieme
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          className={`h-11 w-32 rounded-lg border bg-card px-3 text-lg tracking-[0.3em] outline-none focus:border-brand ${error ? "border-danger" : "border-line"}`}
        />
        <button
          type="button"
          onClick={() => setPin(generatePin())}
          className="h-11 rounded-lg border border-line bg-card px-4 font-semibold hover:border-ink-soft"
        >
          Genera
        </button>
      </div>
      {error ? (
        <p id={`${id}-help`} className="text-sm text-danger">{error}</p>
      ) : (
        <p id={`${id}-help`} className="text-sm text-ink-soft">Da 4 a 6 cifre. Il dipendente lo usa per timbrare.</p>
      )}
    </div>
  );
}

export function AddEmployee({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState<FormState, FormData>(createEmployee, {});
  const [formKey, setFormKey] = useState(0);
  const lastSuccess = useRef<string | undefined>(undefined);

  // Dopo un inserimento riuscito il form si svuota per il dipendente successivo
  useEffect(() => {
    if (state.success && state.success !== lastSuccess.current) {
      lastSuccess.current = state.success;
      setFormKey((k) => k + 1);
    }
  }, [state.success]);

  const v = state.success ? undefined : state.values;
  return (
    <div className="space-y-3">
      {!open && state.success && <Notice tone="success">{state.success}</Notice>}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="anim-pop inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Aggiungi dipendente
        </button>
      )}
      <Reveal open={open}>
    <section aria-labelledby="add-t" className="rounded-xl border border-line bg-card p-6">
      <h3 id="add-t" className="font-display text-lg font-bold">Nuovo dipendente</h3>
      <form key={formKey} onSubmit={submitWithoutReset(action)} className="mt-5 grid gap-5 sm:grid-cols-2" noValidate>
        <Field label="Nome" name="first_name" autoComplete="off" defaultValue={v?.first_name} error={state.errors?.first_name} />
        <Field label="Cognome" name="last_name" autoComplete="off" defaultValue={v?.last_name} error={state.errors?.last_name} />
        <div className="sm:col-span-2">
          <Field
            label="Email (facoltativa)"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={v?.email}
            error={state.errors?.email}
            hint="Servirà più avanti per fargli vedere le proprie ore."
          />
        </div>
        <div className="sm:col-span-2"><PinField error={state.errors?.pin} /></div>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Feedback state={state} />
          <div className="flex gap-3">
            <SubmitButton pending={pending} pendingText="Salvataggio…">Aggiungi dipendente</SubmitButton>
            {!startOpen && (
              <button type="button" onClick={() => setOpen(false)} className="h-11 px-3 font-semibold text-ink-soft hover:text-ink">
                Chiudi
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
      </Reveal>
    </div>
  );
}

type Panel = null | "edit" | "pin";

export function EmployeeRow({ employee: e }: { employee: Employee }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [editState, edit, editing] = useActionState<FormState, FormData>(updateEmployee, {});
  const [pinState, pin, savingPin] = useActionState<FormState, FormData>(changePin, {});
  const [activeState, toggle, toggling] = useActionState<FormState, FormData>(setEmployeeActive, {});
  const name = `${e.first_name} ${e.last_name}`;

  // chiude il pannello dopo un salvataggio riuscito
  useEffect(() => { if (editState.success) setPanel(null); }, [editState]);
  useEffect(() => { if (pinState.success) setPanel(null); }, [pinState]);

  return (
    <li className="p-4 transition-colors duration-150 hover:bg-paper/60 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${e.active ? "" : "text-ink-soft"}`}>{name}</p>
          {e.email && <p className="truncate text-sm text-ink-soft">{e.email}</p>}
        </div>
        {e.active && (
          e.pin_set_at
            ? <span className="rounded-full bg-present-soft px-2.5 py-1 text-sm font-medium text-present">PIN impostato</span>
            : <span className="rounded-full bg-warn-soft px-2.5 py-1 text-sm font-medium text-warn">Manca il PIN</span>
        )}
        <div className="flex flex-wrap gap-1">
          {e.active && (
            <>
              <RowButton pressed={panel === "edit"} onClick={() => setPanel(panel === "edit" ? null : "edit")} label={`Modifica ${name}`}>Modifica</RowButton>
              <RowButton pressed={panel === "pin"} onClick={() => setPanel(panel === "pin" ? null : "pin")} label={`Cambia PIN di ${name}`}>Cambia PIN</RowButton>
            </>
          )}
          <form action={toggle} data-removing={toggling ? "" : undefined}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="active" value={String(!e.active)} />
            <button
              aria-label={`${e.active ? "Disattiva" : "Riattiva"} ${name}`}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${e.active ? "text-ink-soft hover:text-danger" : "text-brand hover:underline"}`}
            >
              {e.active ? "Disattiva" : "Riattiva"}
            </button>
          </form>
        </div>
      </div>

      {activeState.error && <div className="mt-3"><Notice tone="error">{activeState.error}</Notice></div>}
      {!panel && (editState.success || pinState.success) && (
        <div className="mt-3"><Notice tone="success">{pinState.success ?? editState.success}</Notice></div>
      )}

      <Reveal open={panel === "edit"}>
        <div className="pt-4">
        <form onSubmit={submitWithoutReset(edit)} className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="id" value={e.id} />
          <Field label="Nome" name="first_name" defaultValue={e.first_name} error={editState.errors?.first_name} />
          <Field label="Cognome" name="last_name" defaultValue={e.last_name} error={editState.errors?.last_name} />
          <div className="sm:col-span-2">
            <Field label="Email (facoltativa)" name="email" type="email" defaultValue={e.email ?? ""} error={editState.errors?.email} />
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2">
            {editState.error && <Notice tone="error">{editState.error}</Notice>}
            <SubmitButton className="self-start" pending={editing} pendingText="Salvataggio…">Salva modifiche</SubmitButton>
          </div>
        </form>
        </div>
      </Reveal>

      <Reveal open={panel === "pin"}>
        <div className="pt-4">
        <form onSubmit={submitWithoutReset(pin)} className="flex flex-col gap-4 border-t border-line pt-4" noValidate>
          <input type="hidden" name="id" value={e.id} />
          <PinField label="Nuovo PIN" error={pinState.errors?.pin} />
          {pinState.error && <Notice tone="error">{pinState.error}</Notice>}
          <SubmitButton className="self-start" pending={savingPin} pendingText="Salvataggio…">Salva PIN</SubmitButton>
        </form>
        </div>
      </Reveal>
    </li>
  );
}

function RowButton({ children, onClick, pressed, label }: { children: React.ReactNode; onClick: () => void; pressed: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={pressed}
      aria-label={label}
      className={`h-9 rounded-lg px-3 text-sm font-semibold ${pressed ? "bg-paper text-ink" : "text-brand hover:bg-paper"}`}
    >
      {children}
    </button>
  );
}
