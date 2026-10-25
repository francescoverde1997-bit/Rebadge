import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Atterraggio dei link email (conferma account, recupero password). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const requested = searchParams.get("next") ?? "/app";
  // Solo percorsi interni: niente redirect verso siti esterni
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/accedi?errore=link`);
}
