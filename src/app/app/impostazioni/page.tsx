import type { Metadata } from "next";
import { requireOwner, type CompanySettings } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS } from "@/lib/hours/calculate";
import { CompanyNameForm, HoursRulesForm, LogoForm } from "./forms";

export const metadata: Metadata = { title: "Impostazioni · ReBadge" };

export default async function SettingsPage() {
  const { company, logoUrl } = await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_settings")
    .select("rounding_minutes, auto_break_minutes, auto_break_after_minutes, daily_overtime_after_minutes, max_shift_minutes, track_night, night_start_minutes, night_end_minutes, track_holiday, patron_month_day, patron_name, work_saturday")
    .eq("company_id", company.id)
    .maybeSingle();

  const settings: CompanySettings = data ?? {
    rounding_minutes: DEFAULT_SETTINGS.roundingMinutes,
    auto_break_minutes: DEFAULT_SETTINGS.autoBreakMinutes,
    auto_break_after_minutes: DEFAULT_SETTINGS.autoBreakAfterMinutes,
    daily_overtime_after_minutes: DEFAULT_SETTINGS.dailyOvertimeAfterMinutes,
    max_shift_minutes: DEFAULT_SETTINGS.maxShiftMinutes,
    track_night: DEFAULT_SETTINGS.trackNight,
    night_start_minutes: DEFAULT_SETTINGS.nightStartMinutes,
    night_end_minutes: DEFAULT_SETTINGS.nightEndMinutes,
    track_holiday: DEFAULT_SETTINGS.trackHoliday,
    patron_month_day: null,
    patron_name: null,
    work_saturday: false,
  };

  return (
    <div className="max-w-3xl space-y-10">
      <h2 className="font-display text-2xl font-bold">Impostazioni</h2>

      <Section id="nome" title="Nome dell'azienda" text="Compare in alto nella dashboard, sul tablet e nei report.">
        <CompanyNameForm name={company.name} />
      </Section>

      <Section id="logo" title="Logo" text="PNG, JPG, WebP o SVG fino a 2 MB. Compare nella dashboard e nell'intestazione dei report.">
        <LogoForm logoUrl={logoUrl} />
      </Section>

      <Section id="regole" title="Regole di calcolo delle ore" text="Valgono per tutti i dipendenti. I valori iniziali vanno bene per la maggior parte delle aziende.">
        <HoursRulesForm settings={settings} />
      </Section>
    </div>
  );
}

function Section({ id, title, text, children }: { id: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-6 rounded-xl border border-line bg-card p-6">
      <h3 id={`${id}-t`} className="font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{text}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
