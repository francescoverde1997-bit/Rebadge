import { describe, expect, it } from "vitest";
import {
  authErrorMessage, employeeCreateSchema, employeeUpdateSchema, fieldErrors, generatePin, hoursRulesSchema,
  isWeakPin, manualPunchInstant, minutesToTime, manualPunchSchema, newPasswordSchema, pinSchema, signUpSchema, validateLogo,
  leaveSchema, voidPunchSchema,
} from "./validation";

describe("registrazione", () => {
  it("accetta nome, email e password validi e normalizza", () => {
    const r = signUpSchema.parse({ name: "  Bar Mario  ", email: " Mario@Bar.IT ", password: "segreta123" });
    expect(r).toEqual({ name: "Bar Mario", email: "mario@bar.it", password: "segreta123" });
  });
  it("segnala ogni campo non valido", () => {
    const r = signUpSchema.safeParse({ name: " ", email: "x", password: "123" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "name", "password"]);
    }
  });
  it("le password devono coincidere", () => {
    const r = newPasswordSchema.safeParse({ password: "abcdefgh", confirm: "abcdefgx" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).confirm).toBe("Le password non coincidono");
  });
});

describe("regole ore", () => {
  it("converte le ore del form in minuti", () => {
    const r = hoursRulesSchema.parse({
      rounding_minutes: "15", auto_break_minutes: "30", auto_break_after_hours: "6",
      daily_overtime_after_hours: "7.5", max_shift_hours: "16",
      track_night: "on", night_start: "22:00", night_end: "06:00", // track_holiday assente = non spuntata
    });
    expect(r).toEqual({
      rounding_minutes: 15, auto_break_minutes: 30, auto_break_after_minutes: 360,
      daily_overtime_after_minutes: 450, max_shift_minutes: 960,
      track_night: true, night_start_minutes: 1320, night_end_minutes: 360, track_holiday: false,
      patron_month_day: null, patron_name: null, work_saturday: false,
    });
  });
  it("fascia notturna: inizio e fine diversi se il conteggio è attivo", () => {
    const base = { rounding_minutes: "0", auto_break_minutes: "0", auto_break_after_hours: "6", daily_overtime_after_hours: "8", max_shift_hours: "16" };
    expect(hoursRulesSchema.safeParse({ ...base, track_night: "on", night_start: "22:00", night_end: "22:00" }).success).toBe(false);
    expect(hoursRulesSchema.safeParse({ ...base, track_night: "on", night_start: "25:00", night_end: "06:00" }).success).toBe(false);
    const off = hoursRulesSchema.parse({ ...base, night_start: "22:00", night_end: "22:00" });
    expect([off.track_night, off.night_start_minutes, off.night_end_minutes]).toEqual([false, 1320, 360]);
    expect(minutesToTime(1320)).toBe("22:00");
  });
  it("Santo Patrono: giorno e mese insieme, data esistente", () => {
    const base = {
      rounding_minutes: "0", auto_break_minutes: "0", auto_break_after_hours: "6", daily_overtime_after_hours: "8",
      max_shift_hours: "16", track_night: "on", night_start: "22:00", night_end: "06:00",
    };
    const ok = hoursRulesSchema.parse({ ...base, patron_day: "24", patron_month: "6", patron_name: " San Giovanni " });
    expect([ok.patron_month_day, ok.patron_name]).toEqual(["06-24", "San Giovanni"]);
    expect(hoursRulesSchema.safeParse({ ...base, patron_day: "30", patron_month: "2" }).success).toBe(false);
    expect(hoursRulesSchema.safeParse({ ...base, patron_day: "24", patron_month: "" }).success).toBe(false);
    expect(hoursRulesSchema.parse({ ...base, patron_day: "29", patron_month: "2" }).patron_month_day).toBe("02-29");
  });
  it("rifiuta valori fuori dai limiti del database", () => {
    expect(hoursRulesSchema.safeParse({
      rounding_minutes: "7", auto_break_minutes: "30", auto_break_after_hours: "6",
      daily_overtime_after_hours: "8", max_shift_hours: "16",
    }).success).toBe(false);
    expect(hoursRulesSchema.safeParse({
      rounding_minutes: "0", auto_break_minutes: "0", auto_break_after_hours: "6",
      daily_overtime_after_hours: "8", max_shift_hours: "30",
    }).success).toBe(false);
  });
});

describe("logo", () => {
  const file = (type: string, size: number) => new File([new Uint8Array(size)], "logo", { type });
  it("accetta immagini fino a 2 MB", () => {
    expect(validateLogo(file("image/png", 1000))).toEqual({ ok: true, ext: "png" });
    expect(validateLogo(file("image/svg+xml", 1000))).toEqual({ ok: true, ext: "svg" });
  });
  it("rifiuta formati e dimensioni non ammessi", () => {
    expect(validateLogo(file("application/pdf", 1000)).ok).toBe(false);
    expect(validateLogo(file("image/png", 3 * 1024 * 1024)).ok).toBe(false);
    expect(validateLogo(null).ok).toBe(false);
  });
});

describe("errori auth", () => {
  it("traduce i codici noti", () => {
    expect(authErrorMessage("invalid_credentials")).toBe("Email o password non corretti");
    expect(authErrorMessage("user_already_exists")).toContain("Esiste già");
    expect(authErrorMessage(undefined)).toBe("Operazione non riuscita. Riprova");
  });
});


describe("dipendenti", () => {
  it("crea con email facoltativa e nomi ripuliti", () => {
    const r = employeeCreateSchema.parse({ first_name: " Luca ", last_name: "Verdi", email: "", pin: "4821" });
    expect(r).toEqual({ first_name: "Luca", last_name: "Verdi", email: null, pin: "4821" });
    const r2 = employeeUpdateSchema.parse({ first_name: "Sara", last_name: "Neri", email: " Sara@X.IT " });
    expect(r2.email).toBe("sara@x.it");
  });
  it("segnala nome, cognome, email e PIN non validi", () => {
    const r = employeeCreateSchema.safeParse({ first_name: "", last_name: " ", email: "nope", pin: "12" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "first_name", "last_name", "pin"]);
  });
  it("rifiuta i PIN facili", () => {
    for (const p of ["0000", "1111", "1234", "4321", "123456", "98765"]) {
      expect(isWeakPin(p), p).toBe(true);
      expect(pinSchema.safeParse(p).success).toBe(false);
    }
    for (const p of ["4821", "9152", "777333", "1357"]) expect(pinSchema.safeParse(p).success, p).toBe(true);
  });
  it("genera PIN validi", () => {
    for (let i = 0; i < 200; i++) expect(pinSchema.safeParse(generatePin()).success).toBe(true);
    // con un generatore che produce sempre "1" il primo tentativo è debole: deve riprovare
    let n = 0;
    const seq = [0.1, 0.1, 0.1, 0.1, 0.4, 0.8, 0.2, 0.1];
    expect(generatePin(4, () => seq[n++ % seq.length])).toBe("4821");
  });
});


describe("correzioni", () => {
  const base = { employee_id: "6f1c1c4e-2a8b-4f43-9a2e-0d1c1a2b3c4d", date: "2026-10-21", time: "17:30", kind: "out", note: "Uscita dimenticata" };
  it("accetta una correzione completa", () => {
    expect(manualPunchSchema.safeParse(base).success).toBe(true);
  });
  it("richiede ora valida, tipo e motivo", () => {
    const r = manualPunchSchema.safeParse({ ...base, time: "25:00", kind: "x", note: " " });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["kind", "note", "time"]);
    expect(voidPunchSchema.safeParse({ id: base.employee_id, reason: "no" }).success).toBe(false);
  });
  it("converte l'ora locale e rifiuta il futuro", () => {
    const now = new Date("2026-10-22T08:00:00Z"); // 10:00 a Roma
    const ok = manualPunchInstant("2026-10-21", "17:30", "Europe/Rome", now);
    expect(ok.ok && ok.at.toISOString()).toBe("2026-10-21T15:30:00.000Z");
    expect(manualPunchInstant("2026-10-22", "10:03", "Europe/Rome", now).ok).toBe(true);  // tolleranza
    expect(manualPunchInstant("2026-10-22", "11:00", "Europe/Rome", now).ok).toBe(false);
  });
});

describe("assenze", () => {
  const emp = "6f1c1c4e-2a8b-4f43-9a2e-0d1c1a2b3c4d";
  it("ferie su più giorni; fine facoltativa = un solo giorno", () => {
    const r = leaveSchema.parse({ employee_id: emp, type: "ferie", start_date: "2026-10-19", end_date: "2026-10-23", note: " Mare " });
    expect(r).toMatchObject({ start_date: "2026-10-19", end_date: "2026-10-23", hours: null, note: "Mare" });
    expect(leaveSchema.parse({ employee_id: emp, type: "malattia", start_date: "2026-10-19" }).end_date).toBe("2026-10-19");
  });
  it("permesso a ore: un solo giorno, durata in mezz'ore", () => {
    const r = leaveSchema.parse({ employee_id: emp, type: "permesso", start_date: "2026-10-19", end_date: "2026-10-25", permit_minutes: "150" });
    expect(r).toMatchObject({ end_date: "2026-10-19", hours: 2.5 });
    expect(leaveSchema.safeParse({ employee_id: emp, type: "permesso", start_date: "2026-10-19", permit_minutes: "7" }).success).toBe(false);
  });
  it("malattia: protocollo INPS facoltativo, spazi tolti, formato controllato", () => {
    const base = { employee_id: emp, type: "malattia", start_date: "2026-10-19", end_date: "2026-10-21" };
    expect(leaveSchema.parse(base).inps_protocol).toBeNull();
    expect(leaveSchema.parse({ ...base, inps_protocol: " 123 456 789 " }).inps_protocol).toBe("123456789");
    const bad = leaveSchema.safeParse({ ...base, inps_protocol: "12;" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].path).toEqual(["inps_protocol"]);
  });
  it("il protocollo INPS vale solo per la malattia", () => {
    const r = leaveSchema.parse({ employee_id: emp, type: "ferie", start_date: "2026-10-19", inps_protocol: "123456789" });
    expect(r.inps_protocol).toBeNull();
  });
  it("date invertite e campi mancanti", () => {
    const r = leaveSchema.safeParse({ employee_id: "", type: "x", start_date: "" });
    expect(r.success).toBe(false);
    expect(leaveSchema.safeParse({ employee_id: emp, type: "ferie", start_date: "2026-10-20", end_date: "2026-10-19" }).success).toBe(false);
  });
});
