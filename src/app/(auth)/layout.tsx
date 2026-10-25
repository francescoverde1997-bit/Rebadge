import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Notice } from "@/components/ui";
import { BRAND_SLOGAN, Logo } from "@/components/logo";

/** Il "cartellino": una colonna di orari timbrati fa da segno grafico delle pagine di accesso. */
const STAMPS = ["07:58", "12:31", "13:29", "17:02"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      <aside className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <Link href="/" aria-label="ReBadge, pagina iniziale" className="self-start"><Logo variant="dark" size="md" /></Link>
        <div aria-hidden className="w-64 rounded-md bg-white/95 p-5 font-sans text-ink shadow-[0_20px_40px_-20px_rgba(0,0,0,.6)] -rotate-2">
          <div className="flex items-baseline justify-between border-b border-line pb-2">
            <span className="font-display font-bold">Anna Rossi</span>
            <span className="text-sm text-ink-soft">lun 19</span>
          </div>
          <ul className="mt-3 space-y-2">
            {STAMPS.map((t, i) => (
              <li key={t} className="flex items-center justify-between text-lg">
                <span className={i % 2 ? "text-ink-soft" : "text-present"}>{i % 2 ? "Uscita" : "Entrata"}</span>
                <span className="font-semibold tabular-nums">{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-line pt-2 font-semibold">
            <span>Totale</span><span className="tabular-nums">8:04</span>
          </div>
        </div>
        <div className="max-w-sm">
          <p className="font-display text-2xl font-bold">{BRAND_SLOGAN}</p>
          <p className="mt-2 text-lg leading-relaxed text-white/80">
            I tuoi dipendenti timbrano dal tablet. A fine mese mandi il report al consulente.
          </p>
        </div>
      </aside>
      <section className="flex flex-col justify-center px-4 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" aria-label="ReBadge, pagina iniziale" className="mb-10 inline-block lg:hidden"><Logo size="md" /></Link>
          {!isSupabaseConfigured && (
            <div className="mb-6">
              <Notice tone="error">
                Supabase non è configurato: compila NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
              </Notice>
            </div>
          )}
          {children}
          <p className="mt-10 border-t border-line pt-6 text-sm text-ink-soft">
            Quanto costa? <Link href="/prezzi" className="font-medium text-brand underline-offset-4 hover:underline">Vedi piani e prezzi</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
