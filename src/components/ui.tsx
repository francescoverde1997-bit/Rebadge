"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { startTransition, useEffect, useId, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";

/**
 * Invia il form senza il reset automatico di React 19: i campi restano come li ha lasciati l'utente,
 * sia dopo un salvataggio riuscito sia dopo un errore.
 */
export function submitWithoutReset(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}

export function SubmitButton({ children, pendingText, variant = "primary", className = "", pending: pendingProp }: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  /** Da passare quando il form usa onSubmit invece di action */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "bg-card text-ink border border-line hover:border-ink-soft",
    danger: "bg-card text-danger border border-line hover:border-danger",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-11 items-center justify-center rounded-lg px-5 font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${styles} ${className}`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {pendingText ?? "Attendi…"}
        </span>
      ) : children}
    </button>
  );
}

export function Field({ label, name, error, hint, className = "", ...input }: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
} & ComponentProps<"input">) {
  const id = `f-${name}-${useId().replace(/:/g, "")}`; // univoco anche con più form aperti nella stessa pagina
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
        className={`h-11 rounded-lg border bg-card px-3 text-base text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-brand ${error ? "border-danger" : "border-line"} ${className}`}
      />
      {error ? (
        <p id={`${id}-err`} className="text-sm text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}

export function SelectField({ label, name, error, hint, options, ...select }: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  options: { value: string | number; label: string }[];
} & ComponentProps<"select">) {
  const id = `f-${name}-${useId().replace(/:/g, "")}`; // univoco anche con più form aperti nella stessa pagina
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        className={`h-11 rounded-lg border bg-card px-3 text-base text-ink outline-none focus:border-brand ${error ? "border-danger" : "border-line"}`}
        {...select}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-sm text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "bg-danger-soft text-danger",
    success: "bg-present-soft text-present",
    info: "bg-paper text-ink-soft",
  }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`anim-in flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${styles}`}>
      {tone === "success" && <Check className="mt-px" />}
      <span>{children}</span>
    </p>
  );
}

/** Anello di caricamento discreto: eredita il colore del testo. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`spinner h-4 w-4 shrink-0 ${className}`} fill="none">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Spunta che si disegna: conferma che un'operazione è andata a buon fine. */
export function Check({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`check-draw h-4 w-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

/**
 * Apertura e chiusura morbide di moduli e pannelli (altezza + dissolvenza, ~200 ms).
 * Il contenuto resta montato durante la chiusura, poi viene rimosso.
 */
export function Reveal({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const [settled, setSettled] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // due frame: il browser registra lo stato chiuso prima di animare l'apertura
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      const t = setTimeout(() => setSettled(true), 260);
      return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    }
    setSettled(false);
    setShown(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)] ${
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      } ${className}`}
    >
      {/* durante l'animazione si taglia l'eccedenza; a pannello aperto ombre e anelli di focus restano visibili */}
      <div className={`min-h-0 ${settled ? "" : "overflow-hidden"}`}>{children}</div>
    </div>
  );
}

export function TextLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} className={`font-medium text-brand underline-offset-4 hover:underline ${props.className ?? ""}`} />;
}
