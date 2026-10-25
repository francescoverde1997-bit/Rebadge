import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Punch } from "@/lib/hours/calculate";
import { DEFAULT_SETTINGS, type HoursSettings } from "@/lib/hours/calculate";
import { toHoursSettings } from "@/lib/hours/month";
import type { Leave } from "@/lib/leave";

export type PunchRow = {
  id: string;
  employee_id: string;
  kind: "in" | "out";
  punched_at: string;
  source: "kiosk" | "manual";
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type EmployeeLite = { id: string; first_name: string; last_name: string; active: boolean };

const PAGE = 1000; // limite predefinito di righe per richiesta in Supabase

/** Timbrature dell'azienda in un intervallo, caricate a pagine. */
export async function fetchPunches(
  supabase: SupabaseClient,
  opts: { companyId: string; from: Date; to: Date; employeeId?: string; includeVoided?: boolean },
): Promise<PunchRow[]> {
  const rows: PunchRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("punches")
      .select("id, employee_id, kind, punched_at, source, note, voided_at, void_reason")
      .eq("company_id", opts.companyId)
      .gte("punched_at", opts.from.toISOString())
      .lt("punched_at", opts.to.toISOString());
    if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
    if (!opts.includeVoided) q = q.is("voided_at", null);
    const { data, error } = await q.order("punched_at").order("id").range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Impossibile caricare le timbrature: ${error.message}`);
    rows.push(...((data ?? []) as PunchRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export function toPunch(r: PunchRow): Punch {
  return { id: r.id, kind: r.kind, at: new Date(r.punched_at) };
}

export function groupByEmployee(rows: PunchRow[]): Map<string, Punch[]> {
  const m = new Map<string, Punch[]>();
  for (const r of rows) {
    if (r.voided_at) continue;
    const list = m.get(r.employee_id) ?? [];
    list.push(toPunch(r));
    m.set(r.employee_id, list);
  }
  return m;
}

export async function fetchSettings(supabase: SupabaseClient, companyId: string): Promise<HoursSettings> {
  const { data } = await supabase
    .from("company_settings")
    .select("rounding_minutes, auto_break_minutes, auto_break_after_minutes, daily_overtime_after_minutes, max_shift_minutes, track_night, night_start_minutes, night_end_minutes, track_holiday, patron_month_day, patron_name, work_saturday")
    .eq("company_id", companyId)
    .maybeSingle();
  return data ? toHoursSettings(data) : DEFAULT_SETTINGS;
}

export async function fetchEmployees(supabase: SupabaseClient, companyId: string): Promise<EmployeeLite[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, active")
    .eq("company_id", companyId)
    .order("last_name")
    .order("first_name");
  if (error) throw new Error("Impossibile caricare i dipendenti");
  return (data ?? []) as EmployeeLite[];
}

/** Assenze (non rifiutate) che toccano l'intervallo di date [from, to], estremi inclusi. */
export async function fetchLeaves(
  supabase: SupabaseClient,
  opts: { companyId: string; from: string; to: string; employeeId?: string },
): Promise<Leave[]> {
  const rows: Leave[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("leave_requests")
      .select("id, employee_id, type, start_date, end_date, hours, note, inps_protocol")
      .eq("company_id", opts.companyId)
      .neq("status", "rejected")
      .lte("start_date", opts.to)
      .gte("end_date", opts.from);
    if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
    const { data, error } = await q.order("start_date").order("id").range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Impossibile caricare le assenze: ${error.message}`);
    rows.push(...((data ?? []).map((r) => ({ ...r, hours: r.hours == null ? null : Number(r.hours) })) as Leave[]));
    if (!data || data.length < PAGE) return rows;
  }
}
