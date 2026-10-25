import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { parseMonth } from "@/lib/hours/month";
import { reportFileName } from "@/lib/report";
import { buildReportPdf } from "@/lib/report-pdf";
import { buildReportXlsx } from "@/lib/report-xlsx";
import { italianDateTime, loadLogoPng, loadMonthReport } from "@/lib/report-data";

export const dynamic = "force-dynamic";

/**
 * Download del report:
 * - mese aperto: PDF in bozza (non chiude nulla) o Excel
 * - mese chiuso: il PDF archiviato, identico a quello inviato al consulente, o l'Excel ricalcolato con le regole congelate
 */
export async function GET(request: NextRequest) {
  const { company, role } = await getCurrentCompany();
  if (!company || role !== "owner") return new NextResponse("Non autorizzato", { status: 403 });

  const params = request.nextUrl.searchParams;
  const requested = params.get("mese");
  const month = parseMonth(requested, company.timezone);
  if (requested !== month) return new NextResponse("Mese non valido", { status: 400 });
  const kind = params.get("tipo") === "xlsx" ? "xlsx" : "pdf";

  const supabase = await createClient();
  const { report, closure } = await loadMonthReport(supabase, company, month);

  if (kind === "pdf" && closure) {
    const { data, error } = await supabase.storage.from("reports").download(closure.pdf_path);
    if (error || !data) return new NextResponse("PDF archiviato non disponibile. Contatta l'assistenza.", { status: 500 });
    return file(new Uint8Array(await data.arrayBuffer()), reportFileName(company.name, month, "pdf"), "application/pdf");
  }

  if (kind === "pdf") {
    const pdf = buildReportPdf(report, {
      status: { kind: "draft" },
      generatedAtLabel: italianDateTime(new Date(), company.timezone),
      logo: await loadLogoPng(company.logo_path),
    });
    return file(pdf, reportFileName(company.name, month, "pdf", true), "application/pdf");
  }

  const status = closure
    ? `Definitivo, mese chiuso il ${italianDateTime(new Date(closure.closed_at), company.timezone, false)}`
    : "Bozza, non definitivo";
  const xlsx = await buildReportXlsx(report, status);
  return file(xlsx, reportFileName(company.name, month, "xlsx", !closure), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function file(bytes: Uint8Array, name: string, type: string) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
