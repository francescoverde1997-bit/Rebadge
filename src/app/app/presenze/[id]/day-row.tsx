"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Field, Notice, Reveal, SubmitButton, submitWithoutReset } from "@/components/ui";
import type { FormState } from "../../../(auth)/actions";
import { addPunch, voidPunch } from "../actions";

export type DayView = {
  date: string;
  label: string;
  holiday: string | null;
  weekend: boolean;
  punches: {
    id: string; kind: "in" | "out"; time: string; manual: boolean;
    note: string | null; voided: boolean; voidReason: string | null;
    shiftOf: string | null; // uscita di un turno iniziato in un altro giorno
  }[];
  workedMinutes: number;
  overtimeMinutes: number;
  worked: string | null;
  overtime: string | null;
  night: string | null;
  holidayHours: string | null;
  breakDeducted: string | null;
  missingOut: boolean;
  missingIn: boolean;
  inProgress: boolean;
  absence: string | null;
  absenceType?: string | null; // "malattia" → rosso, come nel calendario assenze
};

const ABSENCE_CHIP: Record<string, string> = {
  ferie: "bg-brand text-white",
  permesso: "bg-warn-soft text-warn",
  malattia: "bg-danger text-white",
  altro: "bg-line text-ink",
};

export function DayRow({ day, employeeId, locked = false }: { day: DayView; employeeId: string; locked?: boolean }) {
  const [open, setOpen] = useState(false);
  const flagged = day.missingIn || day.missingOut;
  const empty = day.punches.length === 0 && !day.absence;
  const quiet = empty && (day.weekend || Boolean(day.holiday));
  const anchor = `g-${day.date}`;

  // collegamento diretto al giorno (#g-2026-10-19, da Oggi o dall'avviso in alto): apre le correzioni
  useEffect(() => {
    if (locked) return;
    const check = () => { if (window.location.hash === `#${anchor}`) setOpen(true); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [anchor, locked]);

  return (
    <li id={anchor} data-day={day.date} className={`scroll-mt-24 px-4 transition-[padding,background-color] duration-200 sm:px-5 ${empty && !open ? "py-1.5" : "py-3"} ${flagged ? "bg-warn-soft/60 shadow-[inset_3px_0_0_var(--color-warn)]" : "hover:bg-paper/60"}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className={`w-24 shrink-0 ${empty ? `text-sm ${quiet ? "text-ink-soft/60" : "text-ink-soft"}` : "font-semibold"}`}>
          <span className="first-letter:uppercase">{day.label}</span>
          {day.holiday && <span className="block text-xs font-normal text-ink-soft">{day.holiday}</span>}
        </div>

        <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Timbrature">
          {empty && <li className="sr-only">Nessuna timbratura</li>}
          {day.absence && (
            <li className={`rounded-md px-2 py-0.5 text-sm font-medium ${ABSENCE_CHIP[day.absenceType ?? "ferie"] ?? ABSENCE_CHIP.ferie}`}>{day.absence}</li>
          )}
          {day.punches.map((p) => (
            <li
              key={p.id}
              title={p.voided ? `Annullata: ${p.voidReason}` : p.manual ? `Aggiunta dal titolare: ${p.note}` : undefined}
              className={`whitespace-nowrap rounded-md px-2 py-0.5 text-sm tabular-nums ${
                p.voided
                  ? "bg-paper text-ink-soft line-through"
                  : p.kind === "in" ? "bg-present-soft text-present" : "bg-paper text-ink"
              }`}
            >
              <span className="sr-only">{p.kind === "in" ? "Entrata" : "Uscita"}{p.voided ? " annullata" : ""} </span>
              <span aria-hidden>{p.kind === "in" ? "Entra" : "Esce"} </span>
              {p.time}
              {p.shiftOf && !p.voided && <span className="ml-1 text-xs text-ink-soft">turno di {p.shiftOf}</span>}
              {p.manual && !p.voided && <span className="ml-1 text-xs font-semibold" aria-label="aggiunta dal titolare">✎</span>}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
          {flagged && (
            <span className="rounded-md border-[1.5px] border-dashed border-warn/50 px-2 py-0.5 text-sm font-medium text-warn">
              {day.missingOut ? "Manca l'uscita" : "Manca l'entrata"}
            </span>
          )}
          {/* dettagli del giorno come etichette su una riga: straordinario, notte, festive */}
          {(day.overtime || day.night || day.holidayHours) && (
            <span className="flex flex-wrap gap-1.5 whitespace-nowrap text-xs font-medium tabular-nums">
              {day.overtime && <span className="rounded-md bg-warn-soft px-2 py-0.5 text-warn">{day.overtime} straordinario</span>}
              {day.night && <span className="rounded-md bg-[#e7e9f6] px-2 py-0.5 text-[#2e3a7a]">{day.night} di notte</span>}
              {day.holidayHours && <span className="rounded-md bg-danger-soft px-2 py-0.5 text-danger">{day.holidayHours} festive</span>}
            </span>
          )}
          <span className="w-16 text-right tabular-nums">
            {day.inProgress && !day.worked ? <span className="text-sm font-semibold text-present">in corso</span>
              : day.worked ? <span className="font-bold">{day.worked}</span>
              : !empty && <span className="text-ink-soft">—</span>}
          </span>
          {!locked && (flagged && !open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={false}
              className="h-9 rounded-lg bg-warn px-3 text-sm font-semibold text-white hover:bg-warn/90"
            >
              {day.missingOut ? "Aggiungi l'uscita" : "Aggiungi l'entrata"}
              <span className="sr-only"> di {day.label}</span>
            </button>
          ) : empty ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={`Aggiungi ${day.label}`}
              className={`h-8 rounded-lg px-3 text-sm font-semibold ${open ? "bg-paper text-ink" : "text-ink-soft hover:text-brand"}`}
            >
              Aggiungi
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={`Correggi ${day.label}`}
              title="Correggi le timbrature del giorno"
              className={`grid h-9 w-9 place-items-center rounded-lg border ${open ? "border-line bg-paper text-ink" : "border-transparent text-ink-soft hover:border-line hover:text-ink"}`}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
          ))}
        </div>
      </div>

      <Reveal open={open && !locked}>
        <Corrections day={day} employeeId={employeeId} onDone={() => setOpen(false)} />
      </Reveal>
    </li>
  );
}

function Corrections({ day, employeeId, onDone }: { day: DayView; employeeId: string; onDone: () => void }) {
  const [state, add, adding] = useActionState<FormState, FormData>(addPunch, {});
  const id = useId();
  const suggested = day.missingOut ? "out" : day.missingIn ? "in" : (day.punches.filter((p) => !p.voided).at(-1)?.kind === "in" ? "out" : "in");

  // si chiude solo quando arriva un NUOVO salvataggio riuscito: i ridisegni successivi (es. pagina aggiornata
  // dal server, pannello riaperto) non devono richiuderlo rileggendo il "salvato" precedente
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => { if (state.success) doneRef.current(); }, [state]);
  const valid = day.punches.filter((p) => !p.voided);

  return (
    <div className="mt-4 grid gap-6 border-t border-line pt-4 md:grid-cols-2">
      <form onSubmit={submitWithoutReset(add)} className="flex flex-col gap-4" noValidate>
        <h3 className="font-semibold">Aggiungi una timbratura dimenticata</h3>
        <input type="hidden" name="employee_id" value={employeeId} />
        <input type="hidden" name="date" value={day.date} />
        <fieldset className="flex gap-2">
          <legend className="mb-1.5 text-sm font-medium">Tipo</legend>
          {(["in", "out"] as const).map((k) => (
            <label key={k} className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-4 has-[:checked]:border-brand has-[:checked]:bg-paper">
              <input type="radio" name="kind" value={k} defaultChecked={k === suggested} className="accent-brand" />
              {k === "in" ? "Entrata" : "Uscita"}
            </label>
          ))}
        </fieldset>
        {state.errors?.kind && <p className="text-sm text-danger">{state.errors.kind}</p>}
        <Field label="Ora" name="time" type="time" required error={state.errors?.time} className="w-36" />
        <Field
          label="Motivo"
          name="note"
          placeholder="Es. uscita dimenticata, confermata dal dipendente"
          maxLength={200}
          error={state.errors?.note}
          hint="Resta nel registro delle modifiche."
        />
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <SubmitButton className="self-start" pending={adding} pendingText="Salvataggio…">Aggiungi timbratura</SubmitButton>
      </form>

      <div>
        <h3 className="font-semibold">Timbrature del giorno</h3>
        {valid.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nessuna timbratura valida in questo giorno.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {valid.map((p) => <VoidPunch key={p.id} punch={p} formId={`${id}-${p.id}`} />)}
          </ul>
        )}
        {day.punches.some((p) => p.voided) && (
          <ul className="mt-4 space-y-1 text-sm text-ink-soft">
            {day.punches.filter((p) => p.voided).map((p) => (
              <li key={p.id}>
                <span className="line-through">{p.kind === "in" ? "Entrata" : "Uscita"} {p.time}</span> annullata: {p.voidReason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VoidPunch({ punch, formId }: { punch: DayView["punches"][number]; formId: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(voidPunch, {});
  const label = `${punch.kind === "in" ? "Entrata" : "Uscita"} ${punch.time}`;

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="font-medium tabular-nums">{label}</span>
          {punch.manual && <span className="block text-sm text-ink-soft">Aggiunta dal titolare: {punch.note}</span>}
        </span>
        {!asking && (
          <button type="button" onClick={() => setAsking(true)} aria-label={`Annulla ${label}`} className="h-9 rounded-lg px-3 text-sm font-semibold text-ink-soft hover:text-danger">
            Annulla
          </button>
        )}
      </div>
      {asking && (
        <form id={formId} onSubmit={submitWithoutReset(action)} className="mt-3 flex flex-col gap-3" noValidate>
          <input type="hidden" name="id" value={punch.id} />
          <Field label="Perché la annulli?" name="reason" placeholder="Es. timbratura doppia" maxLength={200} error={state.errors?.reason} />
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <div className="flex gap-2">
            <SubmitButton variant="danger" className="h-9 px-3 text-sm" pending={pending} pendingText="…">Annulla timbratura</SubmitButton>
            <button type="button" onClick={() => setAsking(false)} className="h-9 px-2 text-sm font-semibold text-ink-soft">Lascia com&apos;è</button>
          </div>
        </form>
      )}
    </li>
  );
}
