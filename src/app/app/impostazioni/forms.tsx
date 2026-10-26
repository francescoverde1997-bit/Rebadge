"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, Notice, SelectField, SubmitButton, submitWithoutReset } from "@/components/ui";
import type { CompanySettings } from "@/lib/company";
import { minutesToTime } from "@/lib/validation";
import type { FormState } from "../../(auth)/actions";
import { removeLogo, updateCompanyName, updateHoursRules, updateReminder, uploadLogo } from "./actions";
import { REMINDER_TIMES } from "@/lib/reminders";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  return null;
}

export function CompanyNameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCompanyName, {});
  return (
    <form onSubmit={submitWithoutReset(action)} className="flex flex-col gap-4" noValidate>
      <Field label="Nome" name="name" defaultValue={name} error={state.errors?.name} maxLength={120} required />
      <Feedback state={state} />
      <SubmitButton className="self-start" pending={pending} pendingText="Salvataggio…">Salva nome</SubmitButton>
    </form>
  );
}

export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(uploadLogo, {});
  const [removeState, remove] = useActionState<FormState>(removeLogo, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shown = preview ?? logoUrl;
  // Dopo il salvataggio arriva un nuovo URL firmato: l'anteprima locale non serve più
  useEffect(() => { setPreview(null); setFileName(null); }, [logoUrl]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="grid h-28 w-28 shrink-0 place-items-center rounded-lg border border-dashed border-line bg-paper">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- anteprima locale o URL firmato
          <img src={shown} alt="Logo attuale" className="max-h-24 max-w-24 object-contain" />
        ) : (
          <span className="text-sm text-ink-soft">Nessun logo</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <form
          ref={formRef}
          action={action}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="f-logo"
              className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-card px-4 font-semibold text-ink hover:border-ink-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand"
            >
              Scegli un file
              <input
                id="f-logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                aria-invalid={state.errors?.logo ? true : undefined}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPreview(f ? URL.createObjectURL(f) : null);
                  setFileName(f?.name ?? null);
                }}
                className="sr-only"
              />
            </label>
            <span className="truncate text-sm text-ink-soft">{fileName ?? "Nessun file scelto"}</span>
          </div>
          {state.errors?.logo && <p className="text-sm text-danger">{state.errors.logo}</p>}
          <Feedback state={state} />
          <SubmitButton className="self-start" pendingText="Caricamento…">Carica logo</SubmitButton>
        </form>
        {logoUrl && !preview && (
          <form action={remove}>
            <Feedback state={removeState} />
            <SubmitButton variant="danger" className="mt-1" pendingText="Rimozione…">Rimuovi logo</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

const ROUNDING = [
  { value: 0, label: "Nessun arrotondamento" },
  { value: 5, label: "Ai 5 minuti più vicini" },
  { value: 10, label: "Ai 10 minuti più vicini" },
  { value: 15, label: "Al quarto d'ora più vicino" },
  { value: 30, label: "Alla mezz'ora più vicina" },
];
const BREAK = [
  { value: 0, label: "No, la pausa si timbra" },
  { value: 15, label: "Sì, 15 minuti" },
  { value: 30, label: "Sì, 30 minuti" },
  { value: 45, label: "Sì, 45 minuti" },
  { value: 60, label: "Sì, 1 ora" },
];

const DAYS = [{ value: "", label: "—" }, ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))];
const MONTHS = [
  { value: "", label: "—" },
  ...["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
    .map((m, i) => ({ value: String(i + 1), label: m })),
];

// orari a mezz'ora in formato 24 ore, indipendenti dalla lingua del browser
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const t = minutesToTime(i * 30);
  return { value: t, label: t };
});

function Toggle({ name, label, defaultChecked, onChange }: {
  name: string; label: string; defaultChecked: boolean; onChange?: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={(ev) => onChange?.(ev.target.checked)}
        className="h-5 w-5 accent-brand"
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}

export function HoursRulesForm({ settings }: { settings: CompanySettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateHoursRules, {});
  const e = state.errors ?? {};
  const initial = {
    rounding_minutes: String(settings.rounding_minutes),
    auto_break_minutes: String(settings.auto_break_minutes),
    auto_break_after_hours: String(settings.auto_break_after_minutes / 60),
    daily_overtime_after_hours: String(settings.daily_overtime_after_minutes / 60),
    max_shift_hours: String(settings.max_shift_minutes / 60),
  };
  const [autoBreak, setAutoBreak] = useState(Number(initial.auto_break_minutes));
  const [trackNight, setTrackNight] = useState(settings.track_night);
  const patronMonth = settings.patron_month_day ? String(Number(settings.patron_month_day.slice(0, 2))) : "";
  const patronDay = settings.patron_month_day ? String(Number(settings.patron_month_day.slice(3, 5))) : "";

  return (
    <form onSubmit={submitWithoutReset(action)} className="flex flex-col gap-5" noValidate>
      <SelectField
        label="Arrotondamento di entrata e uscita"
        name="rounding_minutes"
        options={ROUNDING}
        defaultValue={initial.rounding_minutes}
        error={e.rounding_minutes}
      />
      <SelectField
        label="Detrarre una pausa quando non viene timbrata?"
        name="auto_break_minutes"
        options={BREAK}
        defaultValue={initial.auto_break_minutes}
        onChange={(ev) => setAutoBreak(Number(ev.target.value))}
        error={e.auto_break_minutes}
        hint="Se il dipendente timbra la pausa, si conta quella reale."
      />
      {autoBreak > 0 ? (
        <Field
          label="Detrai la pausa nei giorni con almeno (ore)"
          name="auto_break_after_hours"
          type="number" inputMode="decimal" step="0.5" min={1} max={12}
          defaultValue={initial.auto_break_after_hours}
          error={e.auto_break_after_hours}
        />
      ) : (
        <input type="hidden" name="auto_break_after_hours" value={initial.auto_break_after_hours} />
      )}
      <Field
        label="Straordinario oltre (ore al giorno)"
        name="daily_overtime_after_hours"
        type="number" inputMode="decimal" step="0.5" min={1} max={24}
        defaultValue={initial.daily_overtime_after_hours}
        error={e.daily_overtime_after_hours}
      />
      <Field
        label="Turno massimo (ore)"
        name="max_shift_hours"
        type="number" inputMode="numeric" step="1" min={4} max={24}
        defaultValue={initial.max_shift_hours}
        error={e.max_shift_hours}
        hint="Oltre questa durata un'entrata senza uscita viene segnalata come uscita dimenticata."
      />

      <fieldset className="flex flex-col gap-4 border-t border-line pt-5">
        <legend className="sr-only">Ore notturne e festive</legend>
        <p className="text-sm text-ink-soft">
          Le ore notturne e festive sono già comprese nel totale: vengono indicate a parte nel riepilogo e nel report,
          così il consulente applica le maggiorazioni del tuo contratto.
        </p>
        <Toggle
          name="track_night"
          label="Indica le ore notturne"
          defaultChecked={settings.track_night}
          onChange={setTrackNight}
        />
        {trackNight ? (
          <div className="flex flex-wrap items-start gap-4 pl-8">
            <div className="w-32">
              <SelectField label="Dalle" name="night_start" options={HALF_HOURS} defaultValue={minutesToTime(settings.night_start_minutes)} error={e.night_start} />
            </div>
            <div className="w-32">
              <SelectField label="Alle" name="night_end" options={HALF_HOURS} defaultValue={minutesToTime(settings.night_end_minutes)} error={e.night_end} />
            </div>
            <p className="basis-full text-sm text-ink-soft">Di solito 22:00–06:00. Alcuni contratti indicano 00:00–06:00.</p>
          </div>
        ) : (
          <>
            <input type="hidden" name="night_start" value={minutesToTime(settings.night_start_minutes)} />
            <input type="hidden" name="night_end" value={minutesToTime(settings.night_end_minutes)} />
          </>
        )}
        <Toggle
          name="track_holiday"
          label="Indica le ore festive (domeniche, festività nazionali e Santo Patrono)"
          defaultChecked={settings.track_holiday}
        />
      </fieldset>

      <div className="border-t border-line pt-5">
        <SelectField
          label="Settimana lavorativa"
          name="work_days"
          options={[{ value: "5", label: "5 giorni (lunedì–venerdì)" }, { value: "6", label: "6 giorni (lunedì–sabato)" }]}
          defaultValue={settings.work_saturday ? "6" : "5"}
          hint="Serve a contare i giorni di ferie: con 6 giorni anche il sabato è un giorno di ferie."
        />
      </div>

      <fieldset className="flex flex-col gap-3 border-t border-line pt-5">
        <legend className="font-semibold">Santo Patrono</legend>
        <p className="-mt-1 text-sm text-ink-soft">
          La festa del patrono del tuo comune conta come giorno festivo. Lascia vuoto se non vuoi indicarla.
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-28">
            <SelectField label="Giorno" name="patron_day" options={DAYS} defaultValue={patronDay} error={e.patron_day} />
          </div>
          <div className="w-40">
            <SelectField label="Mese" name="patron_month" options={MONTHS} defaultValue={patronMonth} />
          </div>
          <div className="min-w-48 flex-1">
            <Field label="Nome (facoltativo)" name="patron_name" defaultValue={settings.patron_name ?? ""} placeholder="Es. San Giovanni" maxLength={60} error={e.patron_name} />
          </div>
        </div>
      </fieldset>

      <Feedback state={state} />
      <SubmitButton className="self-start" pending={pending} pendingText="Salvataggio…">Salva regole</SubmitButton>
    </form>
  );
}

export function ReminderForm({ enabled, minutes, email }: { enabled: boolean; minutes: number; email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateReminder, {});
  const [on, setOn] = useState(enabled);
  return (
    <form onSubmit={submitWithoutReset(action)} className="flex flex-col gap-4" noValidate>
      <Toggle name="reminder_enabled" label="Mandami il promemoria serale" defaultChecked={enabled} onChange={setOn} />
      <div className={on ? "" : "opacity-50"}>
        <SelectField
          label="Orario"
          name="reminder_minutes"
          defaultValue={String(minutes)}
          disabled={!on}
          error={state.errors?.reminder_minutes}
          hint={`Arriva a ${email}, solo se qualcuno risulta ancora al lavoro o c'è una timbratura da sistemare. Se lavorate anche la sera, scegli un orario dopo la chiusura.`}
          options={REMINDER_TIMES.map((m) => ({ value: String(m), label: minutesToTime(m) }))}
          className="w-36"
        />
        {/* con il menu disattivato il valore non viene inviato: si conserva l'orario scelto */}
        {!on && <input type="hidden" name="reminder_minutes" value={String(minutes)} />}
      </div>
      <Feedback state={state} />
      <SubmitButton className="self-start" pending={pending} pendingText="Salvataggio…">Salva promemoria</SubmitButton>
    </form>
  );
}
