import { formatInTimeZone } from "date-fns-tz";

const TOKEN_KEY = "presenze.tablet";

export function saveKioskToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage bloccato: gestito dalla schermata */ }
}
export function readKioskToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function clearKioskToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* niente da fare */ }
}

export type KioskEmployee = { id: string; first_name: string; last_name: string; has_pin: boolean };
export type KioskInfo = {
  device: { name: string };
  company: { name: string; logo_path: string | null; timezone: string };
  employees: KioskEmployee[];
};

export type PunchResult =
  | { ok: true; kind: "in" | "out"; punched_at: string; first_name: string; duplicate?: boolean }
  | { ok: false; error: "wrong_pin" | "locked" | "no_pin"; locked_until?: string };

export type Outcome = { tone: "in" | "out" | "error"; title: string; detail: string };

/** Testo della conferma mostrata in grande dopo la timbratura. */
export function describeResult(r: PunchResult, timeZone: string): Outcome {
  if (r.ok) {
    const time = formatInTimeZone(new Date(r.punched_at), timeZone, "HH:mm");
    if (r.duplicate) {
      return {
        tone: r.kind,
        title: `${r.kind === "in" ? "Entrata" : "Uscita"} già registrata alle ${time}`,
        detail: `${r.first_name}, hai appena timbrato: non serve ripetere.`,
      };
    }
    return r.kind === "in"
      ? { tone: "in", title: `Entrata alle ${time}`, detail: `Buon lavoro, ${r.first_name}.` }
      : { tone: "out", title: `Uscita alle ${time}`, detail: `A presto, ${r.first_name}.` };
  }
  switch (r.error) {
    case "wrong_pin":
      return { tone: "error", title: "PIN non corretto", detail: "Riprova. Dopo 5 errori il PIN si blocca per 5 minuti." };
    case "locked": {
      const until = r.locked_until ? ` fino alle ${formatInTimeZone(new Date(r.locked_until), timeZone, "HH:mm")}` : " per 5 minuti";
      return { tone: "error", title: "PIN bloccato", detail: `Troppi tentativi errati: riprova${until} o chiedi al titolare.` };
    }
    case "no_pin":
      return { tone: "error", title: "PIN non impostato", detail: "Chiedi al titolare di impostare il tuo PIN." };
  }
}

/** Il server risponde "Tablet non autorizzato" (42501) quando il token è revocato o non valido. */
export function isRevokedError(err: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(err && (err.code === "42501" || /non autorizzato/i.test(err.message ?? "")));
}

/** Da quanti dipendenti in su la timbratrice mostra il filtro per iniziale del nome. */
export const KIOSK_FILTER_FROM = 13;

/** Iniziale del nome per il filtro della timbratrice: maiuscola e senza accento ("Élodie" → "E"). */
export function nameInitial(firstName: string): string {
  return firstName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
}

/** Iniziali presenti tra i dipendenti, in ordine alfabetico, senza doppioni. */
export function kioskInitials(employees: Pick<KioskEmployee, "first_name">[]): string[] {
  return Array.from(new Set(employees.map((e) => nameInitial(e.first_name)).filter(Boolean))).sort();
}

/**
 * L'errore di una chiamata del tablet è la rete che manca? Solo in quel caso si dice "controlla la rete".
 * Un errore con codice è una risposta del database: la rete funziona, il problema è del servizio.
 */
export function isNetworkError(err: { code?: string; message?: string } | null | undefined, online = true): boolean {
  if (!online) return true;
  if (!err) return false;
  if (err.code) return false;
  return /fetch|network|load failed|timed? ?out|aborted|connection/i.test(err.message ?? "");
}

/** Messaggi a tutto schermo quando la timbratura non è stata registrata. */
export const PUNCH_FAILED: Record<"offline" | "server", Outcome> = {
  offline: { tone: "error", title: "Timbratura non registrata", detail: "Il tablet non è connesso a internet. Controlla la rete e riprova." },
  server: { tone: "error", title: "Timbratura non registrata", detail: "Il servizio non ha risposto. Riprova tra poco: se succede ancora, avvisa il titolare." },
};
