"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { employeeCreateSchema, employeeUpdateSchema, fieldErrors, pinSchema } from "@/lib/validation";
import type { FormState } from "../../(auth)/actions";

const refresh = () => revalidatePath("/app", "layout");
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createEmployee(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const values = { first_name: str(form, "first_name"), last_name: str(form, "last_name"), email: str(form, "email") };
  const parsed = employeeCreateSchema.safeParse({ ...values, pin: str(form, "pin") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_employee", {
    p_company_id: company.id,
    p_first_name: parsed.data.first_name,
    p_last_name: parsed.data.last_name,
    p_email: parsed.data.email,
    p_pin: parsed.data.pin,
  });
  if (error?.code === "53400") return { error: "Hai raggiunto il numero massimo di dipendenti attivi del tuo piano. Passa al piano superiore dalla sezione Abbonamento.", values };
  if (error) return { error: "Non è stato possibile aggiungere il dipendente. Riprova", values };
  refresh();
  return { success: `${parsed.data.first_name} ${parsed.data.last_name} aggiunto. Comunicagli il PIN per timbrare.` };
}

export async function updateEmployee(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const id = str(form, "id");
  const parsed = employeeUpdateSchema.safeParse({
    first_name: str(form, "first_name"), last_name: str(form, "last_name"), email: str(form, "email"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("employees").update(parsed.data).eq("id", id).eq("company_id", company.id);
  if (error) return { error: "Non è stato possibile salvare le modifiche. Riprova" };
  refresh();
  return { success: "Modifiche salvate" };
}

export async function changePin(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = pinSchema.safeParse(str(form, "pin"));
  if (!parsed.success) return { errors: { pin: parsed.error.issues[0].message } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_pin", { p_employee_id: str(form, "id"), p_pin: parsed.data });
  if (error) return { error: "Non è stato possibile cambiare il PIN. Riprova" };
  refresh();
  return { success: "PIN aggiornato. Il vecchio PIN non funziona più." };
}

export async function setEmployeeActive(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const active = str(form, "active") === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ active })
    .eq("id", str(form, "id"))
    .eq("company_id", company.id);
  if (error?.code === "53400") return { error: "Hai raggiunto il numero massimo di dipendenti attivi del tuo piano. Passa al piano superiore dalla sezione Abbonamento." };
  if (error) return { error: "Operazione non riuscita. Riprova" };
  refresh();
  return { success: active ? "Dipendente riattivato" : "Dipendente disattivato" };
}
