"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Field, Notice, Reveal, SelectField, SubmitButton, submitWithoutReset } from "@/components/ui";
import type { FormState } from "../../(auth)/actions";
import { addLeave, deleteLeave, updateLeave } from "./actions";

const TYPES = [
  { value: "ferie", label: "Ferie" },
  { value: "permesso", label: "Permesso" },
  { value: "malattia", label: "Malattia" },
  { value: "altro", label: "Altra assenza" },
];
const DURATIONS = [
  { value: "day", label: "Giornata intera" },
  ...Array.from({ length: 16 }, (_, i) => {
    const m = (i + 1) * 30;
    return { value: String(m), label: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ore` };
  }),
];

export interface LeaveInitial {
  id: string;
  employee_id: string;
  type: string;
  start_date: string;
  end_date: string;
  hours: number | null;
  note: string | null;
  inps_protocol: string | null;
}

type Employee = { id: string; name: string };

/** Campi dell'assenza: le etichette cambiano con il tipo (malattia: inizio/fine malattia e protocollo INPS). */
function LeaveForm({ employees, initial, state, action, pending, submitLabel, onClose, title }: {
  employees: Employee[];
  initial: Partial<LeaveInitial> & { start_date: string };
  state: FormState;
  action: (fd: FormData) => void;
  pending: boolean;
  submitLabel: string;
  onClose: () => void;
  title: string;
}) {
  const startMinutes = initial.hours != null ? String(Math.round(initial.hours * 60)) : "day";
  const v = state.success ? undefined : state.values;
  const [type, setType] = useState(v?.type ?? initial.type ?? "ferie");
  const [duration, setDuration] = useState(v?.permit_minutes ?? startMinutes);
  const hourly = type === "permesso" && duration !== "day";
  const sick = type === "malattia";
  const e = state.success ? {} : state.errors ?? {};
  const val = (k: keyof LeaveInitial, fallback = "") => v?.[k] ?? (initial[k] == null ? fallback : String(initial[k]));
  const endDefault = v?.end_date ?? (initial.end_date && initial.end_date !== initial.start_date ? initial.end_date : "");

  return (
    <section aria-label={title} className="max-w-3xl rounded-xl border border-line bg-card p-6">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <form onSubmit={submitWithoutReset(action)} className="mt-5 grid gap-5 sm:grid-cols-2" noValidate>
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <SelectField
          label="Dipendente"
          name="employee_id"
          options={[{ value: "", label: "Scegli…" }, ...employees.map((x) => ({ value: x.id, label: x.name }))]}
          defaultValue={val("employee_id")}
          error={e.employee_id}
        />
        <SelectField label="Tipo" name="type" options={TYPES} value={type} onChange={(ev) => setType(ev.target.value)} error={e.type} />
        <Field
          label={hourly ? "Giorno" : sick ? "Data di inizio malattia" : "Dal"}
          name="start_date"
          type="date"
          defaultValue={val("start_date")}
          error={e.start_date}
        />
        {hourly ? (
          <input type="hidden" name="end_date" value="" />
        ) : (
          <Field
            label={sick ? "Data di fine malattia" : "Al (compreso)"}
            name="end_date"
            type="date"
            defaultValue={endDefault}
            error={e.end_date}
            hint={sick ? "Come sul certificato. Vuoto se è un solo giorno." : "Lascia vuoto per un solo giorno."}
          />
        )}
        {type === "permesso" && (
          <SelectField
            label="Durata del permesso"
            name="permit_minutes"
            options={DURATIONS}
            value={duration}
            onChange={(ev) => setDuration(ev.target.value)}
            error={e.permit_minutes}
          />
        )}
        {sick && (
          <Field
            label="Protocollo certificato INPS (facoltativo)"
            name="inps_protocol"
            inputMode="text"
            autoComplete="off"
            maxLength={40}
            defaultValue={val("inps_protocol")}
            error={e.inps_protocol}
            placeholder="Es. 123456789"
            hint="Il numero che il medico comunica al dipendente: finisce nel report per il consulente."
          />
        )}
        <div className={type === "permesso" || sick ? "" : "sm:col-span-2"}>
          <Field label="Nota (facoltativa)" name="note" maxLength={200} defaultValue={val("note")} error={e.note} placeholder={sick ? "" : "Es. visita medica"} />
        </div>
        <div className="flex flex-col gap-3 sm:col-span-2">
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <div className="flex gap-3">
            <SubmitButton pending={pending} pendingText="Salvataggio…">{submitLabel}</SubmitButton>
            <button type="button" onClick={onClose} className="h-11 px-3 font-semibold text-ink-soft hover:text-ink">
              {initial.id ? "Annulla" : "Chiudi"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

export function AddLeave({ employees, defaultDate }: { employees: Employee[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(addLeave, {});
  const [formKey, setFormKey] = useState(0);
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.success && state.success !== last.current) {
      last.current = state.success;
      setFormKey((k) => k + 1); // modulo pulito per la prossima assenza
    }
  }, [state.success]);

  if (employees.length === 0) return null;
  return (
    <div className="space-y-3">
      {state.success && <Notice key={state.success + formKey} tone="success">{state.success}</Notice>}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="anim-pop inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Aggiungi assenza
        </button>
      )}
      <Reveal open={open}>
        <LeaveForm
          key={formKey}
          title="Nuova assenza"
          employees={employees}
          initial={{ start_date: defaultDate, type: "ferie" }}
          state={state}
          action={action}
          pending={pending}
          submitLabel="Aggiungi assenza"
          onClose={() => setOpen(false)}
        />
      </Reveal>
    </div>
  );
}

/** Riga dell'elenco assenze con Modifica ed Elimina; il modulo di modifica si apre sotto la riga. */
export function LeaveRow({ leave, employees, label, closed, children }: {
  leave: LeaveInitial;
  employees: Employee[];
  label: string;
  closed: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(updateLeave, {});
  const last = useRef<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (state.success && state.success !== last.current) {
      last.current = state.success;
      setOpen(false);
      setSaved(true);
    }
  }, [state.success]);

  return (
    <li onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="-mx-2 rounded-lg px-2 transition-colors duration-150 hover:bg-paper/70">
      {/* l'assenza selezionata si accende anche nel calendario */}
      {(open || hover) && (
        <style>{`[data-leave="${leave.id}"]{box-shadow:0 0 0 2px var(--color-card),0 0 0 4px var(--color-ink);scale:1.06;z-index:1}`}</style>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{children}</span>
        {closed ? (
          <span className="text-sm text-ink-soft">mese chiuso</span>
        ) : (
          <span className="flex items-center gap-1">
            {saved && (
              <span role="status" className="anim-in mr-1 inline-flex items-center gap-1 text-sm font-semibold text-present">
                <Check />Modifiche salvate
              </span>
            )}
            {!open && (
              <button
                type="button"
                onClick={() => { setOpen(true); setSaved(false); }}
                aria-label={`Modifica ${label}`}
                className="h-8 rounded-lg px-3 text-sm font-semibold text-brand hover:bg-paper"
              >
                Modifica
              </button>
            )}
            <DeleteLeave id={leave.id} label={label} />
          </span>
        )}
      </div>
      <Reveal open={open}>
        <div className="pb-2 pt-3">
          <LeaveForm
            title={`Modifica: ${label}`}
            employees={employees}
            initial={leave}
            state={state}
            action={action}
            pending={pending}
            submitLabel="Salva modifiche"
            onClose={() => setOpen(false)}
          />
        </div>
      </Reveal>
    </li>
  );
}

export function DeleteLeave({ id, label }: { id: string; label: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(deleteLeave, {});
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} aria-label={`Elimina ${label}`} className="h-8 rounded-lg px-3 text-sm font-semibold text-ink-soft hover:text-danger">
        Elimina
      </button>
    );
  }
  return (
    <form onSubmit={submitWithoutReset(action)} data-removing={pending ? "" : undefined} className="anim-pop flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-sm">Eliminare?</span>
      <SubmitButton variant="danger" className="h-8 px-3 text-sm" pending={pending} pendingText="…">Sì, elimina</SubmitButton>
      <button type="button" onClick={() => setAsking(false)} className="h-8 px-2 text-sm font-semibold text-ink-soft">No</button>
    </form>
  );
}

/** Sul telefono il calendario non sta tutto: lo fa partire da oggi (se oggi è nel mese mostrato). */
export function ScrollToToday({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const cell = box?.querySelector<HTMLElement>("[data-today]");
    const sticky = box?.querySelector<HTMLElement>("thead th");
    if (box && cell && box.scrollWidth > box.clientWidth) {
      box.scrollLeft = Math.max(0, cell.offsetLeft - (sticky?.offsetWidth ?? 0) - cell.offsetWidth * 2);
    }
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
