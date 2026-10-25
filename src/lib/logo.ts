import { SUPABASE_URL } from "@/lib/supabase/env";

/** URL pubblico del logo (bucket "logos" in sola lettura pubblica). */
export function logoPublicUrl(path: string | null | undefined): string | null {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/logos/${path.split("/").map(encodeURIComponent).join("/")}`;
}
