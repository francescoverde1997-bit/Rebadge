import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_SETTINGS, type Punch } from "./hours/calculate";
import { buildReminderEmail } from "./reminder-email";
import { isEmpty, isReminderTime, minutesToTime, reminderContent, REMINDER_TIMES } from "./reminders";

const TZ = "Europe/Rome";
const at = (s: string) => fromZonedTime(s, TZ);
let n = 0;
const p = (kind: "in" | "out", s: string): Punch => ({ id: `p${++n}`, kind, at: at(s) });
const NOW = at("2026-10-27 20:00"); // martedì sera
const people = [{ id: "a", name: "Anna Rossi" }, { id: "b", name: "Bruno Gallo" }, { id: "c", name: "Chiara Esposito" }];

describe("chi ricordare la sera", () => {
  it("ancora al lavoro, uscite mancanti dei giorni scorsi, chi è in regola non compare", () => {
    const byEmp = new Map<string, Punch[]>([
      ["a", [p("in", "2026-10-27 14:02")]], // pomeriggio senza uscita: ancora dentro
      ["b", [p("in", "2026-10-23 08:01"), p("in", "2026-10-27 08:00"), p("out", "2026-10-27 17:00")]], // venerdì senza uscita
      ["c", [p("in", "2026-10-27 08:00"), p("out", "2026-10-27 17:00")]], // in regola
    ]);
    const c = reminderContent(people, byEmp, DEFAULT_SETTINGS, TZ, NOW);
    expect(c.open.map((o) => [o.name, o.since.toISOString()])).toEqual([["Anna Rossi", at("2026-10-27 14:02").toISOString()]]);
    expect(c.missed.map((m) => [m.name, m.date, m.type])).toEqual([["Bruno Gallo", "2026-10-23", "missing_out"]]);
    expect(isEmpty(c)).toBe(false);
  });

  it("dopo il turno massimo un'entrata senza uscita non è più 'al lavoro' ma da sistemare", () => {
    const byEmp = new Map([["a", [p("in", "2026-10-26 08:00")]]]); // ieri, oltre 16 ore fa
    const c = reminderContent(people, byEmp, DEFAULT_SETTINGS, TZ, NOW);
    expect(c.open).toEqual([]);
    expect(c.missed.map((m) => [m.date, m.type])).toEqual([["2026-10-26", "missing_out"]]);
  });

  it("giornata in regola: niente da ricordare, niente email", () => {
    const byEmp = new Map([["c", [p("in", "2026-10-27 08:00"), p("out", "2026-10-27 17:00")]]]);
    expect(isEmpty(reminderContent(people, byEmp, DEFAULT_SETTINGS, TZ, NOW))).toBe(true);
  });

  it("orario del promemoria nel fuso dell'azienda, anche con il cambio d'ora", () => {
    expect(isReminderTime(1200, TZ, at("2026-10-27 19:59"))).toBe(false);
    expect(isReminderTime(1200, TZ, at("2026-10-27 20:00"))).toBe(true);
    expect(isReminderTime(1410, TZ, at("2026-10-27 23:00"))).toBe(false);
    expect(isReminderTime(1200, TZ, at("2026-03-29 20:30"))).toBe(true); // ora legale appena iniziata
    expect(REMINDER_TIMES.map(minutesToTime)).toEqual(["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"]);
  });
});

describe("email del promemoria", () => {
  const content = {
    open: [{ employeeId: "a", name: "Anna <Rossi>", since: at("2026-10-27 14:02") }],
    missed: [{ employeeId: "b", name: "Bruno Gallo", date: "2026-10-23", type: "missing_out" as const, at: at("2026-10-23 08:01") }],
  };
  const mail = buildReminderEmail({ companyName: "Ferraro Impianti", siteUrl: "https://rebadge.vercel.app/", content, timeZone: TZ, now: NOW });

  it("oggetto, righe con orari e durata, collegamenti al giorno da correggere", () => {
    expect(mail.subject).toBe("ReBadge · 2 timbrature da controllare");
    expect(mail.text).toContain("entrata alle 14:02, nessuna uscita (da 5:58 ore)");
    expect(mail.text).toContain("Bruno Gallo: venerdì 23 ottobre, entrata alle 08:01 senza uscita");
    expect(mail.text).toContain("https://rebadge.vercel.app/app/presenze/b?mese=2026-10#g-2026-10-23");
    expect(mail.html).toContain('href="https://rebadge.vercel.app/app/presenze/a?mese=2026-10#g-2026-10-27"');
    expect(mail.html).toContain("Sistema ora");
  });

  it("i nomi non possono iniettare HTML", () => {
    expect(mail.html).toContain("Anna &lt;Rossi&gt;");
    expect(mail.html).not.toContain("<Rossi>");
  });

  it("una sola timbratura: oggetto al singolare", () => {
    const one = buildReminderEmail({ companyName: "X", siteUrl: "https://x.it", content: { open: content.open, missed: [] }, timeZone: TZ, now: NOW });
    expect(one.subject).toBe("ReBadge · 1 timbratura da controllare");
    expect(one.text).not.toContain("giorni scorsi");
  });
});
