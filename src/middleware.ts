import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

const AUTH_PAGES = ["/accedi", "/registrati", "/password-dimenticata"];

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  // il layout dell'area riservata legge il percorso per i blocchi dell'abbonamento
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Rinnova la sessione e verifica l'utente con il server Auth
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user && path.startsWith("/app")) return redirect("/accedi");
  if (user && AUTH_PAGES.includes(path)) return redirect("/app");
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/accedi", "/registrati", "/password-dimenticata", "/reimposta-password"],
};
