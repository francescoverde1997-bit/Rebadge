"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  authErrorMessage, fieldErrors, newPasswordSchema, resetRequestSchema, signInSchema, signUpSchema,
  type FieldErrors,
} from "@/lib/validation";

export type FormState = {
  errors?: FieldErrors;
  error?: string;
  success?: string;
  values?: Record<string, string>;
};

async function origin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: str(form, "name"), email: str(form, "email") };
  const parsed = signUpSchema.safeParse({ ...values, password: str(form, "password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { company_name: parsed.data.name, signup_kind: "owner" },
      emailRedirectTo: `${await origin()}/auth/callback?next=/app`,
    },
  });
  if (error) return { error: authErrorMessage(error.code, error.message), values };

  // Con la conferma email disattivata Supabase restituisce subito la sessione
  if (data.session) redirect("/app");
  // Email già registrata: Supabase risponde senza errore ma senza identità (anti-enumerazione)
  return {
    success: `Ti abbiamo inviato un'email a ${parsed.data.email}. Apri il link per attivare l'account.`,
  };
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: str(form, "email") };
  const parsed = signInSchema.safeParse({ ...values, password: str(form, "password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorMessage(error.code, error.message), values };
  redirect("/app");
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: str(form, "email") };
  const parsed = resetRequestSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/callback?next=/reimposta-password`,
  });
  if (error && error.code?.startsWith("over_")) return { error: authErrorMessage(error.code), values };
  // Stessa risposta che l'email esista o no: non riveliamo chi è registrato
  return { success: "Se l'email è registrata, riceverai un link per scegliere una nuova password." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({ password: str(form, "password"), confirm: str(form, "confirm") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Il link è scaduto. Richiedi un nuovo link di recupero" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authErrorMessage(error.code, error.message) };
  redirect("/app?password=aggiornata");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/accedi");
}
