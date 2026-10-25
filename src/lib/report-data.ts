import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { formatInTimeZone } from "date-fns-tz";
import { it } from "date-fns/locale";
import { fetchEmployees, fetchLeaves, fetchPunches, fetchSettings, groupByEmployee } from "@/lib/attendance";
import type { Company } from "@/lib/company";
import { DEFAULT_SETTINGS, type HoursSettings } from "@/lib/hours/calculate";
import { daysOfMonth, fetchWindow } from "@/lib/hours/month";
import { logoPublicUrl } from "@/lib/logo";
import { buildMonthReport, type MonthReport } from "@/lib/report";

export type Closure = { month: string; closed_at: string; pdf_path: string; settings: HoursSettings };

export async function fetchClosures(supabase: SupabaseClient, companyId: string): Promise<Closure[]> {
  const { data, error } = await supabase
    .from("month_closures")
    .select("month, closed_at, pdf_path, settings")
    .eq("company_id", companyId)
    .order("month", { ascending: false });
  if (error) throw new Error(`Impossibile caricare i mesi chiusi: ${error.message}`);
  return (data ?? []) as Closure[];
}

export async function fetchClosure(supabase: SupabaseClient, companyId: string, month: string): Promise<Closure | null> {
  const { data } = await supabase
    .from("month_closures")
    .select("month, closed_at, pdf_path, settings")
    .eq("company_id", companyId)
    .eq("month", month)
    .maybeSingle();
  return (data as Closure | null) ?? null;
}

/** Regole del mese: quelle salvate alla chiusura se il mese è chiuso, altrimenti quelle attuali. */
export async function settingsForMonth(supabase: SupabaseClient, companyId: string, month: string): Promise<{ settings: HoursSettings; closure: Closure | null }> {
  const closure = await fetchClosure(supabase, companyId, month);
  if (closure) return { settings: { ...DEFAULT_SETTINGS, ...closure.settings }, closure };
  return { settings: await fetchSettings(supabase, companyId), closure: null };
}

export async function loadMonthReport(supabase: SupabaseClient, company: Company, month: string, now = new Date()) {
  const { settings, closure } = await settingsForMonth(supabase, company.id, month);
  const days = daysOfMonth(month);
  const { from, to } = fetchWindow(month, company.timezone, settings.maxShiftMinutes);
  const [employees, punches, leaves] = await Promise.all([
    fetchEmployees(supabase, company.id),
    fetchPunches(supabase, { companyId: company.id, from, to }),
    fetchLeaves(supabase, { companyId: company.id, from: days[0], to: days.at(-1)! }),
  ]);
  const report: MonthReport = buildMonthReport({
    companyName: company.name, month, timeZone: company.timezone, settings,
    employees, punches: groupByEmployee(punches), leaves, now,
  });
  return { report, settings, closure };
}

/** Logo per il PDF: qualsiasi formato caricato (PNG, JPG, WebP, SVG) diventa PNG. Se manca o non si legge, niente logo. */
export async function loadLogoPng(logoPath: string | null): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  const url = logoPublicUrl(logoPath);
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()), { density: 300 })
      .resize({ width: 480, height: 240, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { png: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export function italianDateTime(d: Date, tz: string, withTime = true): string {
  return formatInTimeZone(d, tz, withTime ? "d MMMM yyyy, HH:mm" : "d MMMM yyyy", { locale: it });
}
