/**
 * Testo dell'email del promemoria serale (funzione pura): oggetto, HTML e testo semplice.
 * Contiene solo nomi e orari, il minimo indispensabile. Ogni riga porta al giorno da correggere.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { it } from "date-fns/locale";
import type { ReminderContent } from "./reminders";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildReminderEmail(opts: {
  companyName: string;
  siteUrl: string;
  content: ReminderContent;
  timeZone: string;
  now: Date;
}): { subject: string; html: string; text: string } {
  const { companyName, siteUrl, content, timeZone: tz, now } = opts;
  const site = siteUrl.replace(/\/$/, "");
  const hm = (d: Date) => formatInTimeZone(d, tz, "HH:mm");
  const dayLabel = (date: string) => formatInTimeZone(fromZonedTime(`${date}T12:00:00`, tz), tz, "EEEE d MMMM", { locale: it });
  const hours = (since: Date) => {
    const min = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
    return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
  };
  // collegamento al giorno: apre direttamente la correzione (#g-AAAA-MM-GG)
  const link = (employeeId: string, date: string) => `${site}/app/presenze/${employeeId}?mese=${date.slice(0, 7)}#g-${date}`;
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");

  const n = content.open.length + content.missed.length;
  const subject = `ReBadge · ${n === 1 ? "1 timbratura da controllare" : `${n} timbrature da controllare`}`;

  const openLines = content.open.map((o) => ({
    text: `${o.name}: entrata alle ${hm(o.since)}, nessuna uscita (da ${hours(o.since)} ore)`,
    href: link(o.employeeId, formatInTimeZone(o.since, tz, "yyyy-MM-dd")),
  }));
  const missedLines = content.missed.map((m) => ({
    text: `${m.name}: ${dayLabel(m.date)}, ${m.type === "missing_out" ? `entrata alle ${hm(m.at)} senza uscita` : `uscita alle ${hm(m.at)} senza entrata`}`,
    href: link(m.employeeId, m.date),
  }));
  const firstHref = (openLines[0] ?? missedLines[0])?.href ?? `${site}/app`;

  const P = "font-family:Helvetica,Arial,sans-serif;color:#1b2b44;font-size:15px;line-height:1.5";
  const list = (lines: { text: string; href: string }[]) =>
    `<ul style="${P};padding-left:20px">${lines.map((l) => `<li style="margin:6px 0"><a href="${esc(l.href)}" style="color:#24508a">${esc(l.text)}</a></li>`).join("")}</ul>`;
  const html = [
    `<p style="${P};font-size:13px;color:#4a5a70">${esc(companyName)} · ${esc(dayLabel(today))}</p>`,
    openLines.length ? `<p style="${P}"><strong>Risultano ancora al lavoro:</strong></p>${list(openLines)}` : "",
    missedLines.length ? `<p style="${P}"><strong>Timbrature dei giorni scorsi ancora da sistemare:</strong></p>${list(missedLines)}` : "",
    `<p><a href="${esc(firstHref)}" style="display:inline-block;background:#24508a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:bold">Sistema ora</a></p>`,
    `<p style="${P};font-size:13px;color:#4a5a70">Finché una timbratura non è sistemata quel turno non conta nelle ore e il PDF definitivo del mese resta bloccato.<br>Puoi cambiare l'orario o disattivare il promemoria in Impostazioni → Promemoria serale.</p>`,
    `<p style="${P};font-size:13px;color:#4a5a70">ReBadge · Timbra. Controlla. Invia.</p>`,
  ].join("\n");

  const text = [
    `${companyName} · ${dayLabel(today)}`,
    "",
    ...(openLines.length ? ["Risultano ancora al lavoro:", ...openLines.map((l) => `- ${l.text}\n  ${l.href}`), ""] : []),
    ...(missedLines.length ? ["Timbrature dei giorni scorsi ancora da sistemare:", ...missedLines.map((l) => `- ${l.text}\n  ${l.href}`), ""] : []),
    "Finché una timbratura non è sistemata quel turno non conta nelle ore e il PDF definitivo del mese resta bloccato.",
    "Puoi cambiare l'orario o disattivare il promemoria in Impostazioni → Promemoria serale.",
  ].join("\n");

  return { subject, html, text };
}
