"use client";

import { createClient as createSupabase } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { it } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearKioskToken, describeResult, isNetworkError, isRevokedError, KIOSK_FILTER_FROM, kioskInitials, nameInitial,
  PUNCH_FAILED, readKioskToken,
  type KioskEmployee, type KioskInfo, type Outcome, type PunchResult,
} from "@/lib/kiosk";
import { logoPublicUrl } from "@/lib/logo";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { BadgeMark } from "@/components/logo";

type Screen =
  | { kind: "loading" }
  | { kind: "inactive"; reason: "missing" | "revoked" }
  | { kind: "suspended" }
  | { kind: "list" }
  | { kind: "pin"; employee: KioskEmployee }
  | { kind: "result"; outcome: Outcome };

const PIN_IDLE_MS = 20_000;     // il tastierino si chiude se nessuno lo usa
const RESULT_MS = 4_000;        // la conferma resta visibile 4 secondi
const REFRESH_MS = 120_000;     // aggiorna l'elenco dipendenti ogni 2 minuti

export default function KioskPage() {
  const supabase = useMemo(
    () => (isSupabaseConfigured
      ? createSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      : null),
    [],
  );
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<KioskInfo | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [offline, setOffline] = useState(false);

  const revoke = useCallback(() => {
    clearKioskToken();
    setToken(null);
    setScreen({ kind: "inactive", reason: "revoked" });
  }, []);

  const load = useCallback(async (t: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("kiosk_info", { p_token: t });
    if (error) {
      if (isRevokedError(error)) return revoke();
      if (error.code === "P0004") { setScreen({ kind: "suspended" }); return; } // abbonamento non attivo
      // rete assente: avviso fisso finché non torna; errore del servizio: si riprova al prossimo aggiornamento
      if (isNetworkError(error, navigator.onLine)) setOffline(true);
      setScreen((s) => (s.kind === "loading" ? { kind: "list" } : s));
      return;
    }
    setOffline(false);
    setInfo(data as KioskInfo);
    setScreen((s) => (s.kind === "loading" || s.kind === "suspended" ? { kind: "list" } : s));
  }, [supabase, revoke]);

  // avvio: legge il token salvato all'attivazione
  useEffect(() => {
    const t = readKioskToken();
    if (!t) { setScreen({ kind: "inactive", reason: "missing" }); return; }
    setToken(t);
    load(t);
  }, [load]);

  // aggiornamento periodico e al ritorno in primo piano
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => load(token), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load(token);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [token, load]);

  // servizio sospeso: controlla ogni 30 secondi se l'abbonamento è tornato attivo
  useEffect(() => {
    if (!token || screen.kind !== "suspended") return;
    const id = setInterval(() => load(token), 30_000);
    return () => clearInterval(id);
  }, [token, screen.kind, load]);

  // senza rete: riprova ogni 10 secondi
  useEffect(() => {
    if (!token || !offline) return;
    const id = setInterval(() => load(token), 10_000);
    return () => clearInterval(id);
  }, [token, offline, load]);

  // schermo sempre acceso, dove il browser lo consente
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        lock = (await wl?.request("screen")) ?? null;
      } catch { /* non supportato o negato: nessun problema */ }
    };
    request();
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); lock?.release().catch(() => {}); };
  }, []);

  const punch = useCallback(async (employee: KioskEmployee, pin: string): Promise<"retry" | "done"> => {
    if (!supabase || !token || !info) return "retry";
    const { data, error } = await supabase.rpc("kiosk_punch", { p_token: token, p_employee_id: employee.id, p_pin: pin });
    if (error) {
      if (isRevokedError(error)) { revoke(); return "done"; }
      if (error.code === "P0004") { setScreen({ kind: "suspended" }); return "done"; }
      const offlineNow = isNetworkError(error, navigator.onLine);
      if (offlineNow) setOffline(true);
      else console.error("[timbratrice] errore del servizio", error.code, error.message);
      setScreen({ kind: "result", outcome: PUNCH_FAILED[offlineNow ? "offline" : "server"] });
      return "done";
    }
    setOffline(false);
    const result = data as PunchResult;
    if (!result.ok && result.error === "wrong_pin") return "retry";
    setScreen({ kind: "result", outcome: describeResult(result, info.company.timezone) });
    return "done";
  }, [supabase, token, info, revoke]);

  if (!isSupabaseConfigured) {
    return <Centered title="Configurazione mancante" text="Il servizio non è configurato su questo server." />;
  }
  if (screen.kind === "loading") return <Centered title="Caricamento…" />;
  if (screen.kind === "inactive") {
    return (
      <Centered
        title={screen.reason === "revoked" ? "Tablet disattivato" : "Tablet non attivato"}
        text={screen.reason === "revoked"
          ? "Il titolare ha disattivato questo tablet. Per riattivarlo accedi come titolare e apri la sezione Tablet."
          : "Per usare questo dispositivo come timbratrice, accedi come titolare e apri la sezione Tablet."}
        action={{ href: "/accedi", label: "Accedi come titolare" }}
      />
    );
  }

  if (screen.kind === "suspended") {
    return (
      <Centered
        title="Servizio sospeso"
        text="L'abbonamento non è attivo: le timbrature non vengono registrate. Il titolare può riattivarlo dalla sezione Abbonamento; il tablet ripartirà da solo."
      />
    );
  }

  const tz = info?.company.timezone ?? "Europe/Rome";
  return (
    <main className="flex min-h-dvh flex-col">
      <Header info={info} tz={tz} />
      {offline && (
        <p role="alert" className="mx-4 mb-6 rounded-lg bg-warn px-4 py-3 text-center text-lg font-semibold text-white sm:mx-8">
          Connessione assente: le timbrature non vengono registrate finché la rete non torna.
        </p>
      )}
      {screen.kind === "list" && !info && (
        <Centered title="In attesa della connessione" text="Il tablet riprova da solo ogni pochi secondi." inline />
      )}
      {screen.kind === "list" && info && (
        <EmployeeGrid employees={info.employees} onPick={(e) => setScreen({ kind: "pin", employee: e })} />
      )}
      {screen.kind === "pin" && (
        <PinPad
          employee={screen.employee}
          onCancel={() => setScreen({ kind: "list" })}
          onSubmit={(pin) => punch(screen.employee, pin)}
        />
      )}
      {screen.kind === "result" && (
        <Result outcome={screen.outcome} onDone={() => setScreen({ kind: "list" })} />
      )}
      {/* firma discreta del marchio: il protagonista resta il nome dell'azienda */}
      <footer aria-hidden className="mt-auto flex items-center justify-center gap-2 pb-5 text-sm text-white/40">
        <BadgeMark variant="dark" className="h-4 w-4 opacity-70" />
        ReBadge
      </footer>
    </main>
  );
}

function Header({ info, tz }: { info: KioskInfo | null; tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const logo = logoPublicUrl(info?.company.logo_path);
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
      <div className="flex min-w-0 items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo dal bucket pubblico */}
        {logo && <img src={logo} alt="" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />}
        <p className="font-display text-2xl font-bold sm:text-3xl">{info?.company.name}</p>
      </div>
      {now && (
        <div className="text-right" aria-live="off">
          <p className="font-display text-5xl font-bold tabular-nums sm:text-6xl">{formatInTimeZone(now, tz, "HH:mm")}</p>
          <p className="text-lg text-white/70 first-letter:uppercase">{formatInTimeZone(now, tz, "EEEE d MMMM", { locale: it })}</p>
        </div>
      )}
    </header>
  );
}

function EmployeeGrid({ employees, onPick }: { employees: KioskEmployee[]; onPick: (e: KioskEmployee) => void }) {
  // filtro per iniziale: si azzera da solo, perché l'elenco si rimonta dopo ogni timbratura
  const [initial, setInitial] = useState<string | null>(null);
  if (employees.length === 0) {
    return <Centered title="Nessun dipendente" text="Il titolare deve aggiungere i dipendenti dalla sezione Dipendenti." inline />;
  }
  const withFilter = employees.length >= KIOSK_FILTER_FROM;
  const shown = withFilter && initial ? employees.filter((e) => nameInitial(e.first_name) === initial) : employees;
  const chip = (on: boolean) =>
    `h-12 min-w-14 rounded-xl px-4 text-lg font-bold active:scale-95 ${on ? "bg-white text-ink" : "border border-white/25 text-white hover:border-white/60"}`;
  return (
    <section aria-label="Chi sta timbrando?" className="anim-in flex-1 px-4 pb-8 sm:px-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl text-white/80">Tocca il tuo nome</h1>
        {withFilter && (
          <p className="text-white/70" aria-live="polite">
            {initial ? `${shown.length} con la ${initial}` : `${employees.length} dipendenti`}
          </p>
        )}
      </div>
      {withFilter && (
        <div role="group" aria-label="Filtra per iniziale del nome" className="mb-5 flex flex-wrap gap-2">
          <button type="button" aria-pressed={!initial} onClick={() => setInitial(null)} className={chip(!initial)}>Tutti</button>
          {kioskInitials(employees).map((l) => (
            <button key={l} type="button" aria-pressed={initial === l} onClick={() => setInitial(l)} className={chip(initial === l)}>{l}</button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e)}
              className="flex h-28 w-full flex-col items-start justify-center rounded-xl bg-white px-5 text-left text-ink active:scale-[0.98] active:bg-white/90"
            >
              <span className="font-display text-2xl font-bold leading-tight">{e.first_name}</span>
              <span className="text-lg text-ink-soft">{e.last_name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"] as const;

function PinPad({ employee, onCancel, onSubmit }: {
  employee: KioskEmployee;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<"retry" | "done">;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touch = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(onCancel, PIN_IDLE_MS);
  }, [onCancel]);
  useEffect(() => { touch(); return () => { if (idle.current) clearTimeout(idle.current); }; }, [touch]);

  const press = useCallback(async (k: (typeof KEYS)[number]) => {
    if (busy) return;
    touch();
    if (k === "del") { setPin((p) => p.slice(0, -1)); return; }
    if (k === "ok") {
      if (pin.length < 4) return;
      setBusy(true);
      const r = await onSubmit(pin);
      setBusy(false);
      if (r === "retry") { setWrong(true); setPin(""); }
      return;
    }
    setWrong(false);
    setPin((p) => (p.length < 6 ? p + k : p));
  }, [busy, pin, onSubmit, touch]);

  // tastiera fisica (utile anche con tastiere Bluetooth)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("del");
      else if (e.key === "Enter") press("ok");
      else if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, onCancel]);

  return (
    <section aria-label={`PIN di ${employee.first_name} ${employee.last_name}`} className="anim-in flex flex-1 flex-col items-center px-4 pb-8">
      <p className="font-display text-3xl font-bold">{employee.first_name} {employee.last_name}</p>
      <p className={`mt-2 text-lg ${wrong ? "font-semibold text-[#ffb4b4]" : "text-white/70"}`} role={wrong ? "alert" : undefined}>
        {wrong ? "PIN non corretto, riprova" : "Inserisci il tuo PIN"}
      </p>
      <div aria-hidden key={wrong ? "wrong" : "ok"} className={`my-6 flex h-6 gap-4 ${wrong ? "shake" : ""}`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`h-5 w-5 rounded-full border-2 border-white transition-[background-color,scale] duration-150 ${i < pin.length ? "scale-110 bg-white" : "scale-100"}`} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{pin.length} cifre inserite</p>
      <div className="grid w-full max-w-sm grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={busy || (k === "ok" && pin.length < 4)}
            aria-label={k === "del" ? "Cancella" : k === "ok" ? "Conferma" : k}
            className={`h-20 rounded-xl text-3xl font-semibold active:scale-95 disabled:opacity-40 ${
              k === "ok" ? "bg-present text-white" : k === "del" ? "bg-white/10 text-white" : "bg-white text-ink"
            }`}
          >
            {k === "del" ? "⌫" : k === "ok" ? (busy ? "…" : "OK") : k}
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="mt-6 h-12 px-6 text-xl font-semibold text-white/80 underline-offset-4 hover:underline">
        Non sono io
      </button>
    </section>
  );
}

function Result({ outcome, onDone }: { outcome: Outcome; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, RESULT_MS);
    return () => clearTimeout(id);
  }, [onDone]);
  const bg = { in: "bg-present", out: "bg-brand", error: "bg-danger" }[outcome.tone];
  return (
    <button
      type="button"
      onClick={onDone}
      className={`anim-fade fixed inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center ${bg}`}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="check-draw anim-pop h-16 w-16 sm:h-20 sm:w-20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {outcome.tone !== "error" ? <path d="M4.5 10.5l3.5 3.5 7.5-8" /> : <path d="M6 6l8 8M14 6l-8 8" />}
      </svg>
      <span role="status" className="anim-in font-display text-5xl font-bold sm:text-7xl">{outcome.title}</span>
      <span className="text-2xl text-white/90 sm:text-3xl">{outcome.detail}</span>
      <span className="mt-8 text-lg text-white/70">Tocca per continuare</span>
    </button>
  );
}

function Centered({ title, text, action, inline }: { title: string; text?: string; action?: { href: string; label: string }; inline?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 px-6 text-center ${inline ? "flex-1" : "min-h-dvh"}`}>
      <h1 className="font-display text-4xl font-bold">{title}</h1>
      {text && <p className="max-w-lg text-xl text-white/80">{text}</p>}
      {action && (
        <a href={action.href} className="mt-4 inline-flex h-12 items-center rounded-lg bg-white px-6 font-semibold text-ink">
          {action.label}
        </a>
      )}
    </div>
  );
}
