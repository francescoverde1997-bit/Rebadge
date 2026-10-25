"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, leaveSchema } from "@/lib/validation";
import type { FormState } from "../../(auth)/actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

const readValues = (form: FormData) => ({
  employee_id: str(form, "employee_id"), type: str(form, "type"), start_date: str(form, "start_date"),
  end_date: str(form, "end_date"), permit_minutes: str(form, "permit_minutes") || "day", note: str(form, "note"),
  inps_protocol: str(form, "inps_protocol"),
});

const CLOSED_MSG = "Il mese è chiuso: le ore non si possono più modificare. Contatta l'assistenza.";
const OVERLAP_MSG = "In quei giorni questo dipendente ha già un'assenza. Elimina quella esistente o cambia le date.";

/** Il titolare registra un'assenza: è già approvata. */
export async function addLeave(_: FormState, form: FormData): Promise<FormState> {
  const { company, user } = await requireOwner();
  const values = readValues(form);
  const parsed = leaveSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    company_id: company.id,
    ...parsed.data,
    status: "approved",
    created_by: user.id,
  });
  if (error?.code === "23P01") return { error: OVERLAP_MSG, values };
  if (error?.code === "55000") return { error: CLOSED_MSG, values };
  if (error) return { error: "Non è stato possibile salvare l'assenza. Riprova", values };
  revalidatePath("/app", "layout");
  return { success: parsed.data.type === "malattia" ? "Malattia aggiunta" : "Assenza aggiunta" };
}

/** Correzione di un'assenza inserita per errore (date, dipendente, tipo, protocollo). Bloccata nei mesi chiusi dal DB. */
export async function updateLeave(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const id = str(form, "id");
  const values = readValues(form);
  const parsed = leaveSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .update(parsed.data)
    .eq("id", id)
    .eq("company_id", company.id)
    .select("id");
  if (error?.code === "23P01") return { error: OVERLAP_MSG, values };
  if (error?.code === "55000") return { error: CLOSED_MSG, values };
  if (error) return { error: "Non è stato possibile salvare le modifiche. Riprova", values };
  if (!data?.length) return { error: "Assenza non trovata: forse è già stata eliminata.", values };
  revalidatePath("/app", "layout");
  return { success: "Modifiche salvate" };
}

export async function deleteLeave(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .delete()
    .eq("id", str(form, "id"))
    .eq("company_id", company.id);
  if (error?.code === "55000") return { error: CLOSED_MSG };
  if (error) return { error: "Non è stato possibile eliminare l'assenza. Riprova" };
  revalidatePath("/app", "layout");
  return { success: "Assenza eliminata" };
}
