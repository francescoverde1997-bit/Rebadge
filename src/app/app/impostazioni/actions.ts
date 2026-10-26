"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { companyNameSchema, fieldErrors, hoursRulesSchema, reminderSchema, validateLogo } from "@/lib/validation";
import type { FormState } from "../../(auth)/actions";

const refresh = () => revalidatePath("/app", "layout");

export async function updateCompanyName(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const values = { name: String(form.get("name") ?? "") };
  const parsed = companyNameSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ name: parsed.data.name }).eq("id", company.id);
  if (error) return { error: "Non è stato possibile salvare il nome. Riprova" };
  refresh();
  return { success: "Nome salvato" };
}

export async function uploadLogo(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const file = form.get("logo");
  const check = validateLogo(file instanceof File ? file : null);
  if (!check.ok) return { errors: { logo: check.error } };

  const supabase = await createClient();
  // Nome nuovo a ogni caricamento: evita che browser e CDN mostrino il logo vecchio
  const path = `${company.id}/logo-${Date.now()}.${check.ext}`;
  const { error: upErr } = await supabase.storage
    .from("logos")
    .upload(path, file as File, { contentType: (file as File).type, upsert: false });
  if (upErr) return { error: "Caricamento non riuscito. Riprova" };

  const { error } = await supabase.from("companies").update({ logo_path: path }).eq("id", company.id);
  if (error) {
    await supabase.storage.from("logos").remove([path]);
    return { error: "Non è stato possibile salvare il logo. Riprova" };
  }
  if (company.logo_path) await supabase.storage.from("logos").remove([company.logo_path]);
  refresh();
  return { success: "Logo aggiornato" };
}

export async function removeLogo(): Promise<FormState> {
  const { company } = await requireOwner();
  if (!company.logo_path) return {};
  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ logo_path: null }).eq("id", company.id);
  if (error) return { error: "Non è stato possibile rimuovere il logo. Riprova" };
  await supabase.storage.from("logos").remove([company.logo_path]);
  refresh();
  return { success: "Logo rimosso" };
}

export async function updateHoursRules(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const values = Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const parsed = hoursRulesSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("company_id", company.id);
  if (error) return { error: "Non è stato possibile salvare le regole. Riprova" };
  refresh();
  return { success: "Regole salvate. Valgono per tutti i calcoli, anche dei mesi passati." };
}

export async function updateReminder(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const values = { reminder_enabled: String(form.get("reminder_enabled") ?? ""), reminder_minutes: String(form.get("reminder_minutes") ?? "") };
  const parsed = reminderSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("company_id", company.id);
  if (error) return { error: "Non è stato possibile salvare il promemoria. Riprova" };
  refresh();
  return { success: parsed.data.reminder_enabled ? "Promemoria salvato" : "Promemoria disattivato" };
}
