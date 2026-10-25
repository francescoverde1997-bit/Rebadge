/** Festività nazionali italiane + Santo Patrono dell'azienda (inserito dal cliente). */

/** Festa del patrono dell'azienda: mese e giorno (es. "06-24") e nome facoltativo. */
export type Patron = { monthDay: string; name?: string | null } | null | undefined;

function easterSunday(year: number): { m: number; d: number } {
  // Algoritmo di Meeus/Jones/Butcher (calendario gregoriano)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function italianHolidays(year: number): Map<string, string> {
  const h = new Map<string, string>();
  const add = (m: number, d: number, name: string) => h.set(`${year}-${pad(m)}-${pad(d)}`, name);
  add(1, 1, "Capodanno");
  add(1, 6, "Epifania");
  add(4, 25, "Festa della Liberazione");
  add(5, 1, "Festa dei Lavoratori");
  add(6, 2, "Festa della Repubblica");
  add(8, 15, "Ferragosto");
  if (year >= 2026) add(10, 4, "San Francesco d'Assisi"); // festività nazionale reintrodotta dal 2026
  add(11, 1, "Ognissanti");
  add(12, 8, "Immacolata Concezione");
  add(12, 25, "Natale");
  add(12, 26, "Santo Stefano");
  const { m, d } = easterSunday(year);
  add(m, d, "Pasqua");
  const monday = new Date(Date.UTC(year, m - 1, d + 1));
  h.set(`${year}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`, "Lunedì dell'Angelo");
  return h;
}

export function isHoliday(isoDate: string, patron?: Patron): string | undefined {
  const national = italianHolidays(Number(isoDate.slice(0, 4))).get(isoDate);
  if (national) return national;
  if (patron && isoDate.slice(5) === patron.monthDay) return patron.name?.trim() || "Santo Patrono";
  return undefined;
}

/** Giorni lavorativi (lun–ven, esclusi festivi) in un intervallo di date incluso. */
export function workingDaysBetween(startIso: string, endIso: string, patron?: Patron): string[] {
  const out: string[] = [];
  const cur = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const wd = cur.getUTCDay();
    if (wd !== 0 && wd !== 6 && !isHoliday(iso, patron)) out.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
