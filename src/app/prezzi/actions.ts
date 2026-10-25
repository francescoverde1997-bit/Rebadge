"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { EMPLOYEE_RANGES } from "@/lib/plans";

export type CustomPlanState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"company_name" | "contact_name" | "email" | "phone" | "employees_range" | "locations" | "message", string>>;
};

const schema = z.object({
  company_name: z.string().trim().min(2, "Scrivi il nome dell'azienda").max(120, "Massimo 120 caratteri"),
  contact_name: z.string().trim().min(2, "Scrivi il tuo nome").max(120, "Massimo 120 caratteri"),
  email: z.string().trim().max(200).email("Email non valida"),
  phone: z.string().trim().max(40, "Massimo 40 caratteri").regex(/^[+\d\s().-]*$/, "Solo numeri, spazi e +").optional().or(z.literal("")),
  employees_range: z.enum(EMPLOYEE_RANGES.map((r) => r.value) as [string, ...string[]], { message: "Scegli quanti dipendenti avete" }),
  locations: z.union([z.literal(""), z.coerce.number().int("Numero intero").min(1, "Almeno 1").max(1000, "Massimo 1000")]).optional(),
  message: z.string().trim().max(2000, "Massimo 2000 caratteri").optional(),
});

export async function requestCustomPlan(_: CustomPlanState, form: FormData): Promise<CustomPlanState> {
  // Campo trappola: invisibile alle persone, i bot lo compilano. Fingiamo che sia andato tutto bene.
  if (String(form.get("website") ?? "") !== "") return { ok: true };

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: CustomPlanState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as keyof NonNullable<CustomPlanState["fieldErrors"]>;
      fieldErrors[k] ??= issue.message;
    }
    return { fieldErrors };
  }
  if (!isSupabaseConfigured) return { error: "Il servizio non è ancora configurato: riprova più tardi." };

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_custom_plan", {
    p_company_name: d.company_name,
    p_contact_name: d.contact_name,
    p_email: d.email,
    p_phone: d.phone || null,
    p_employees_range: d.employees_range,
    p_locations: typeof d.locations === "number" ? d.locations : null,
    p_message: d.message || null,
  });
  if (error) {
    if (error.code === "P0005") return { error: "Abbiamo già ricevuto le tue richieste: ti ricontatteremo a breve." };
    return { error: "Non è stato possibile inviare la richiesta. Riprova tra poco." };
  }
  return { ok: true };
}
