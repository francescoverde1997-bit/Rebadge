import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { logoPublicUrl } from "@/lib/logo";
import type { PlanId } from "@/lib/plans";

export type Company = {
  id: string;
  name: string;
  logo_path: string | null;
  timezone: string;
  plan_status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string;
  plan: PlanId | null;
  custom_employee_limit: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export type CompanySettings = {
  rounding_minutes: number;
  auto_break_minutes: number;
  auto_break_after_minutes: number;
  daily_overtime_after_minutes: number;
  max_shift_minutes: number;
  track_night: boolean;
  night_start_minutes: number;
  night_end_minutes: number;
  track_holiday: boolean;
  patron_month_day: string | null;
  patron_name: string | null;
  work_saturday: boolean;
};

/** Azienda dell'utente collegato (una per titolare nell'MVP). Reindirizza se manca la sessione. */
export const getCurrentCompany = cache(async () => {
  if (!isSupabaseConfigured) redirect("/accedi");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/accedi");

  const { data: membership, error } = await supabase
    .from("company_members")
    .select("role, companies(id, name, logo_path, timezone, plan_status, trial_ends_at, plan, custom_employee_limit, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Impossibile caricare l'azienda: ${error.message}`);

  const company = membership?.companies as unknown as Company | null;
  if (!company) return { user, company: null, role: null, logoUrl: null };

  const logoUrl = logoPublicUrl(company.logo_path);
  return { user, company, role: membership!.role as "owner" | "employee", logoUrl };
});

export async function requireOwner() {
  const ctx = await getCurrentCompany();
  if (!ctx.company || ctx.role !== "owner") redirect("/app");
  return ctx as typeof ctx & { company: Company };
}

export function trialDaysLeft(company: Company, now = new Date()): number {
  const ms = new Date(company.trial_ends_at).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
