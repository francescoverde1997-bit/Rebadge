import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_URL } from "./env";

/**
 * Client con chiave service_role: ignora la RLS. Usato SOLO dal server per i webhook di Stripe
 * (aggiornare lo stato dell'abbonamento). Mai importarlo in componenti client.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
