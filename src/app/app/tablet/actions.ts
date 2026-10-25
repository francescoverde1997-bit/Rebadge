"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "../../(auth)/actions";

export type ActivateState = FormState & { token?: string };

/**
 * Trasforma il dispositivo in uso in una timbratrice:
 * crea il tablet e restituisce il token, che il browser salva solo su quel dispositivo.
 * La sessione del titolare viene chiusa subito dopo dal client (vedi ui.tsx): farlo qui
 * farebbe ricaricare la pagina protetta prima che il token sia stato salvato.
 */
export async function activateThisDevice(_: ActivateState, form: FormData): Promise<ActivateState> {
  const { company } = await requireOwner();
  const name = String(form.get("name") ?? "").trim() || "Tablet";
  if (name.length > 60) return { errors: { name: "Il nome può avere al massimo 60 caratteri" } };

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_device", { p_company_id: company.id, p_name: name });
  if (error || typeof token !== "string") return { error: "Non è stato possibile attivare il tablet. Riprova" };
  return { token };
}

export async function revokeDevice(_: FormState, form: FormData): Promise<FormState> {
  const { company } = await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase
    .from("devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", String(form.get("id") ?? ""))
    .eq("company_id", company.id)
    .is("revoked_at", null);
  if (error) return { error: "Non è stato possibile disattivare il tablet. Riprova" };
  revalidatePath("/app", "layout");
  return { success: "Tablet disattivato: da ora non può più timbrare." };
}
