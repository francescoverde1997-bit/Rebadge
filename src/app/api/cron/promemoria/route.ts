import { NextResponse, type NextRequest } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEmployees, fetchPunches, groupByEmployee } from "@/lib/attendance";
import { toHoursSettings } from "@/lib/hours/month";
import { isServiceActive } from "@/lib/plans";
import { isEmpty, isReminderTime, reminderContent, REMINDER_LOOKBACK_DAYS } from "@/lib/reminders";
import { buildReminderEmail } from "@/lib/reminder-email";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Promemoria serale (decisione 74). Lo chiama un orologio esterno (Vercel Cron) ogni ora:
 * per ogni azienda attiva, dall'orario scelto in poi e una sola volta al giorno, se qualcuno risulta
 * ancora al lavoro o ci sono timbrature da sistemare, manda un'email al titolare.
 * Protetto da CRON_SECRET (Vercel lo invia come "Authorization: Bearer <segreto>").
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Non autorizzato", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return new NextResponse("Servizio non configurato", { status: 503 });

  // solo nei test: si può simulare l'ora (?ora=ISO). In produzione la variabile non esiste.
  const requested = request.nextUrl.searchParams.get("ora");
  const now = process.env.REMINDER_ALLOW_TEST_TIME === "1" && requested ? new Date(requested) : new Date();

  const { data: companies, error } = await admin.from("companies").select("id, name, timezone, plan, plan_status, trial_ends_at");
  if (error) return new NextResponse("Errore nel caricamento delle aziende", { status: 500 });

  const results: { company: string; esito: string }[] = [];
  for (const c of companies ?? []) {
    const out = (esito: string) => results.push({ company: c.id, esito });
    try {
      if (!isServiceActive(c, now)) { out("servizio non attivo"); continue; }
      const { data: s } = await admin.from("company_settings").select("*").eq("company_id", c.id).maybeSingle();
      if (!s?.reminder_enabled) { out("promemoria disattivato"); continue; }
      if (!isReminderTime(s.reminder_minutes, c.timezone, now)) { out("non ancora l'ora"); continue; }
      const localDate = formatInTimeZone(now, c.timezone, "yyyy-MM-dd");
      const { data: already } = await admin.from("reminder_log").select("local_date").eq("company_id", c.id).eq("local_date", localDate).maybeSingle();
      if (already) { out("già inviato oggi"); continue; }

      const employees = (await fetchEmployees(admin, c.id)).filter((e) => e.active);
      const punches = await fetchPunches(admin, { companyId: c.id, from: new Date(now.getTime() - REMINDER_LOOKBACK_DAYS * 86_400_000), to: now });
      const content = reminderContent(
        employees.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` })),
        groupByEmployee(punches), toHoursSettings(s), c.timezone, now,
      );
      if (isEmpty(content)) { out("tutto in ordine, nessuna email"); continue; }

      const { data: owner } = await admin.from("company_members").select("user_id").eq("company_id", c.id).eq("role", "owner").limit(1).maybeSingle();
      const email = owner ? (await admin.auth.admin.getUserById(owner.user_id)).data.user?.email : null;
      if (!email) { out("titolare senza email"); continue; }

      // prima si registra l'invio (vincolo unico: mai due email nello stesso giorno), poi si manda
      const { error: logErr } = await admin.from("reminder_log").insert({ company_id: c.id, local_date: localDate });
      if (logErr) { out(logErr.code === "23505" ? "già inviato oggi" : "registro non disponibile"); continue; }
      const mail = buildReminderEmail({ companyName: c.name, siteUrl: siteUrl(), content, timeZone: c.timezone, now });
      const sent = await sendEmail({ to: email, ...mail });
      if (!sent.sent) {
        // non inviata: si toglie dal registro, così si riprova al prossimo giro
        await admin.from("reminder_log").delete().eq("company_id", c.id).eq("local_date", localDate);
        out(sent.skipped ?? `invio non riuscito: ${sent.error}`);
        continue;
      }
      out(`inviato (${content.open.length} al lavoro, ${content.missed.length} da sistemare)`);
    } catch (e) {
      console.error("[promemoria]", c.id, e);
      out("errore");
    }
  }
  return NextResponse.json({ ora: now.toISOString(), aziende: results.length, risultati: results });
}
