"use server";

import { requireOwner } from "@/lib/company";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { currentMonth, parseMonth } from "@/lib/hours/month";
import { buildReportPdf } from "@/lib/report-pdf";
import { fetchClosure, italianDateTime, loadLogoPng, loadMonthReport } from "@/lib/report-data";

export type CloseState = { error?: string; downloadUrl?: string };

/**
 * PDF definitivo: genera il documento, lo archivia e chiude il mese.
 * Condizioni: mese finito, non già chiuso, nessuna timbratura da sistemare.
 */
export async function closeMonth(_: CloseState, form: FormData): Promise<CloseState> {
  const { company } = await requireOwner();
  const requested = String(form.get("month") ?? "");
  const month = parseMonth(requested, company.timezone);
  if (month !== requested) return { error: "Mese non valido" };
  if (month >= currentMonth(company.timezone)) {
    return { error: "Il mese non è ancora finito: il PDF definitivo si scarica dal primo giorno del mese successivo." };
  }

  const supabase = await createClient();
  if (await fetchClosure(supabase, company.id, month)) {
    return { downloadUrl: `/app/report/file?mese=${month}&tipo=pdf` };
  }

  const now = new Date();
  const { report, settings } = await loadMonthReport(supabase, company, month, now);
  if (report.anomalies > 0) {
    return { error: `Ci sono ${report.anomalies} timbrature da sistemare. Sistemale in Presenze prima di chiudere il mese.` };
  }

  const pdf = buildReportPdf(report, {
    status: { kind: "final", closedAtLabel: italianDateTime(now, company.timezone, false) },
    generatedAtLabel: italianDateTime(now, company.timezone),
    logo: await loadLogoPng(company.logo_path),
  });
  const path = `${company.id}/${month}-${now.getTime()}.pdf`;
  const up = await supabase.storage.from("reports").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) return { error: "Non è stato possibile archiviare il PDF. Riprova" };

  const totals = Object.fromEntries(report.employees.map((e) => [e.name, { ...e.totals, ...e.leave }]));
  const { error } = await supabase.rpc("close_month", {
    p_company_id: company.id, p_month: month, p_settings: settings, p_totals: totals, p_pdf_path: path,
  });
  if (error) {
    // il PDF appena caricato non appartiene a nessuna chiusura: lo toglie il server (il bucket non consente
    // cancellazioni agli utenti, per proteggere i documenti inviati)
    await createAdminClient()?.storage.from("reports").remove([path]);
    if (error.code === "23505") return { downloadUrl: `/app/report/file?mese=${month}&tipo=pdf` }; // chiuso nel frattempo
    return { error: "Non è stato possibile chiudere il mese. Riprova" };
  }

  // niente revalidatePath qui: aggiornerebbe la pagina prima che parta il download.
  // È il browser a scaricare il PDF e poi a ricaricare la pagina (vedi ui.tsx).
  return { downloadUrl: `/app/report/file?mese=${month}&tipo=pdf` };
}
