"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, manualPunchInstant, manualPunchSchema, voidPunchSchema } from "@/lib/validation";
import type { FormState } from "../../(auth)/actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Aggiunge una timbratura dimenticata. Solo il titolare; il motivo resta nel registro. */
export async function addPunch(_: FormState, form: FormData): Promise<FormState> {
  const { company, user } = await requireOwner();
  const values = {
    employee_id: str(form, "employee_id"), date: str(form, "date"), time: str(form, "time"),
    kind: str(form, "kind"), note: str(form, "note"),
  };
  const parsed = manualPunchSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const instant = manualPunchInstant(parsed.data.date, parsed.data.time, company.timezone);
  if (!instant.ok) return { errors: { time: instant.error }, values };

  const supabase = await createClient();
  const { error } = await supabase.from("punches").insert({
    company_id: company.id,
    employee_id: parsed.data.employee_id,
    kind: parsed.data.kind,
    punched_at: instant.at.toISOString(),
    source: "manual",
    created_by: user.id,
    note: parsed.data.note,
  });
  if (error?.code === "55000") return { error: "Il mese è chiuso: le ore non si possono più modificare. Contatta l'assistenza.", values };
  if (error) return { error: "Non è stato possibile salvare la timbratura. Riprova", values };
  revalidatePath("/app", "layout");
  return { success: `${parsed.data.kind === "in" ? "Entrata" : "Uscita"} delle ${parsed.data.time} aggiunta` };
}

/** Annulla una timbratura sbagliata. Non si cancella: resta visibile, barrata, con il motivo. */
export async function voidPunch(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const parsed = voidPunchSchema.safeParse({ id: str(form, "id"), reason: str(form, "reason") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("punches")
    .update({ voided_at: new Date().toISOString(), void_reason: parsed.data.reason })
    .eq("id", parsed.data.id)
    .eq("company_id", company.id)
    .is("voided_at", null);
  if (error?.code === "55000") return { error: "Il mese è chiuso: le ore non si possono più modificare. Contatta l'assistenza." };
  if (error) return { error: "Non è stato possibile annullare la timbratura. Riprova" };
  revalidatePath("/app", "layout");
  return { success: "Timbratura annullata" };
}
