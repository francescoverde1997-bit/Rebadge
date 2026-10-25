import { INPS_PROTOCOL_RE } from "./leave";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";

const email = z.string().trim().toLowerCase().email("Inserisci un'email valida");
const password = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri")
  .max(72, "La password può avere al massimo 72 caratteri");
export const companyName = z
  .string()
  .trim()
  .min(1, "Inserisci il nome")
  .max(120, "Il nome può avere al massimo 120 caratteri");

export const signUpSchema = z.object({ name: companyName, email, password });
export const signInSchema = z.object({ email, password: z.string().min(1, "Inserisci la password") });
export const resetRequestSchema = z.object({ email });
export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Le password non coincidono", path: ["confirm"] });

export const companyNameSchema = z.object({ name: companyName });

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** I campi in ore arrivano dal form in ore; nel DB stanno in minuti. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** 1320 → "22:00" */
export const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Esiste la data giorno/mese? (anno bisestile di riferimento: il 29 febbraio è valido) */
function isValidMonthDay(month: string, day: string): boolean {
  const m = Number(month), d = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(2024, m, 0)).getUTCDate();
}

export const hoursRulesSchema = z
  .object({
    rounding_minutes: z.coerce.number().refine((v) => [0, 5, 10, 15, 30].includes(v), "Valore non valido"),
    auto_break_minutes: z.coerce.number().refine((v) => [0, 15, 30, 45, 60].includes(v), "Valore non valido"),
    auto_break_after_hours: z.coerce.number().min(1, "Minimo 1 ora").max(12, "Massimo 12 ore"),
    daily_overtime_after_hours: z.coerce.number().min(1, "Minimo 1 ora").max(24, "Massimo 24 ore"),
    max_shift_hours: int(4, 24),
    // le caselle di controllo arrivano solo se spuntate
    track_night: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    night_start: z.string().regex(TIME_RE, "Inserisci l'ora nel formato 22:00"),
    night_end: z.string().regex(TIME_RE, "Inserisci l'ora nel formato 06:00"),
    track_holiday: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    work_days: z.enum(["5", "6"]).optional().default("5"),
    patron_day: z.string().optional().default(""),
    patron_month: z.string().optional().default(""),
    patron_name: z.string().trim().max(60, "Il nome può avere al massimo 60 caratteri").optional().default(""),
  })
  .refine((v) => Boolean(v.patron_day) === Boolean(v.patron_month), {
    message: "Scegli sia il giorno sia il mese, oppure nessuno dei due",
    path: ["patron_day"],
  })
  .refine((v) => !v.patron_day || isValidMonthDay(v.patron_month, v.patron_day), {
    message: "Questa data non esiste",
    path: ["patron_day"],
  })
  .refine((v) => !v.track_night || v.night_start !== v.night_end, {
    message: "Inizio e fine della fascia notturna devono essere diversi",
    path: ["night_end"],
  })
  .transform((v) => ({
    rounding_minutes: v.rounding_minutes,
    auto_break_minutes: v.auto_break_minutes,
    auto_break_after_minutes: Math.round(v.auto_break_after_hours * 60),
    daily_overtime_after_minutes: Math.round(v.daily_overtime_after_hours * 60),
    max_shift_minutes: v.max_shift_hours * 60,
    track_night: v.track_night,
    // se la fascia è disattivata e i campi coincidono, si mantiene il valore predefinito valido
    night_start_minutes: v.night_start === v.night_end ? 1320 : toMinutes(v.night_start),
    night_end_minutes: v.night_start === v.night_end ? 360 : toMinutes(v.night_end),
    track_holiday: v.track_holiday,
    patron_month_day: v.patron_day ? `${v.patron_month.padStart(2, "0")}-${v.patron_day.padStart(2, "0")}` : null,
    patron_name: v.patron_day && v.patron_name ? v.patron_name : null,
    work_saturday: v.work_days === "6",
  }));

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function validateLogo(file: File | null): { ok: true; ext: string } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "Scegli un file" };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { ok: false, error: "Formato non supportato: usa PNG, JPG, WebP o SVG" };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "Il logo supera i 2 MB" };
  return { ok: true, ext };
}

export type FieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Traduce gli errori di Supabase Auth in messaggi chiari per l'utente. */
export function authErrorMessage(code: string | undefined, message?: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Email o password non corretti";
    case "email_not_confirmed":
      return "Conferma prima l'email: ti abbiamo inviato un link";
    case "user_already_exists":
    case "email_exists":
      return "Esiste già un account con questa email. Accedi o recupera la password";
    case "weak_password":
      return "Password troppo debole: usa almeno 8 caratteri con lettere e numeri";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Troppi tentativi. Riprova tra qualche minuto";
    case "same_password":
      return "La nuova password deve essere diversa da quella attuale";
    default:
      return message ? `Operazione non riuscita: ${message}` : "Operazione non riuscita. Riprova";
  }
}

// ---------------------------------------------------------------------------
// Dipendenti
// ---------------------------------------------------------------------------
const personName = (label: string) =>
  z.string().trim().min(1, `Inserisci il ${label}`).max(60, `Il ${label} può avere al massimo 60 caratteri`);

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v || null)
  .pipe(z.string().email("Inserisci un'email valida").nullable());

/** PIN troppo facili da indovinare guardando la tastiera o provando a caso. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 11111
  const asc = "0123456789", desc = "9876543210";
  return asc.includes(pin) || desc.includes(pin); // 1234, 98765
}

export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, "Il PIN deve avere da 4 a 6 cifre")
  .refine((p) => !isWeakPin(p), "PIN troppo facile: evita cifre uguali o in sequenza");

export const employeeCreateSchema = z.object({
  first_name: personName("nome"),
  last_name: personName("cognome"),
  email: optionalEmail,
  pin: pinSchema,
});

export const employeeUpdateSchema = z.object({
  first_name: personName("nome"),
  last_name: personName("cognome"),
  email: optionalEmail,
});

const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function generatePin(length = 4, random: () => number = cryptoRandom): string {
  for (;;) {
    const pin = Array.from({ length }, () => Math.floor(random() * 10)).join("");
    if (!isWeakPin(pin)) return pin;
  }
}

// ---------------------------------------------------------------------------
// Correzioni delle timbrature (solo titolare)
// ---------------------------------------------------------------------------
const reason = z
  .string()
  .trim()
  .min(3, "Scrivi il motivo (almeno 3 caratteri)")
  .max(200, "Il motivo può avere al massimo 200 caratteri");

export const manualPunchSchema = z.object({
  employee_id: z.string().uuid("Dipendente non valido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Inserisci l'ora nel formato 08:30"),
  kind: z.enum(["in", "out"], { message: "Scegli entrata o uscita" }),
  note: reason,
});

export const voidPunchSchema = z.object({
  id: z.string().uuid("Timbratura non valida"),
  reason,
});

/**
 * Ora locale dell'azienda → istante. Rifiuta le timbrature nel futuro
 * (piccola tolleranza per orologi leggermente diversi).
 */
export function manualPunchInstant(
  date: string, time: string, timeZone: string, now = new Date(),
): { ok: true; at: Date } | { ok: false; error: string } {
  const at = fromZonedTime(`${date}T${time}:00`, timeZone);
  if (Number.isNaN(at.getTime())) return { ok: false, error: "Data non valida" };
  if (at.getTime() > now.getTime() + 5 * 60_000) return { ok: false, error: "Non puoi inserire una timbratura nel futuro" };
  return { ok: true, at };
}

// ---------------------------------------------------------------------------
// Assenze: ferie, permessi, malattia (solo titolare)
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Scegli una data");

export const leaveSchema = z
  .object({
    employee_id: z.string().uuid("Scegli il dipendente"),
    type: z.enum(["ferie", "permesso", "malattia", "altro"], { message: "Scegli il tipo di assenza" }),
    start_date: isoDate,
    end_date: z.string().optional().default(""),
    /** permesso: "day" = giornata intera, altrimenti minuti (30, 60, …) */
    permit_minutes: z.string().optional().default("day"),
    note: z.string().trim().max(200, "La nota può avere al massimo 200 caratteri").optional().default(""),
    inps_protocol: z.string().trim().optional().default(""),
  })
  .transform((v) => {
    const hourly = v.type === "permesso" && v.permit_minutes !== "day";
    return {
      employee_id: v.employee_id,
      type: v.type,
      start_date: v.start_date,
      end_date: hourly ? v.start_date : v.end_date || v.start_date,
      hours: hourly ? Number(v.permit_minutes) / 60 : null,
      note: v.note || null,
      // il protocollo INPS vale solo per la malattia: per gli altri tipi viene scartato
      inps_protocol: v.type === "malattia" && v.inps_protocol ? v.inps_protocol.replace(/\s+/g, "") : null,
    };
  })
  .refine((v) => v.inps_protocol === null || INPS_PROTOCOL_RE.test(v.inps_protocol), {
    message: "Il protocollo ha solo numeri e lettere (da 4 a 30 caratteri)", path: ["inps_protocol"],
  })
  .refine((v) => v.end_date >= v.start_date, { message: "La data di fine viene prima di quella di inizio", path: ["end_date"] })
  .refine((v) => v.hours === null || (v.hours > 0 && v.hours <= 12 && Number.isInteger(v.hours * 2)), {
    message: "Scegli la durata del permesso", path: ["permit_minutes"],
  })
  .refine((v) => (Date.parse(v.end_date) - Date.parse(v.start_date)) / 86_400_000 <= 366, {
    message: "Un'assenza può durare al massimo un anno", path: ["end_date"],
  });
