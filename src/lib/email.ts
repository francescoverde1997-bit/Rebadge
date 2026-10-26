import "server-only";

/**
 * Invio email tramite Resend (API HTTP, nessuna libreria). Solo dal server.
 * Variabili: RESEND_API_KEY, EMAIL_FROM (es. "ReBadge <promemoria@rebadge.it>");
 * RESEND_API_BASE solo per i test (finto servizio email in locale).
 * Senza chiave non si invia nulla: il chiamante riceve { skipped } e lo segnala.
 */
export type EmailResult = { sent: true; id: string } | { sent: false; skipped?: string; error?: string };

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, skipped: "servizio email non configurato" };
  const base = (process.env.RESEND_API_BASE || "https://api.resend.com").replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    const body = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!r.ok || !body.id) return { sent: false, error: `${r.status} ${body.message ?? ""}`.trim() };
    return { sent: true, id: body.id };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "errore di rete" };
  }
}
