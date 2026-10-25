import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site";

export const metadata: Metadata = { title: "Pagina non trovata · ReBadge" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-20 sm:px-6">
        <p className="font-display text-6xl font-bold text-brand">404</p>
        <h1 className="font-display text-3xl font-bold">Pagina non trovata</h1>
        <p className="text-lg text-ink-soft">
          L&apos;indirizzo potrebbe essere sbagliato, oppure la pagina non esiste più.
          Se stavi aprendo un dipendente, potrebbe essere di un&apos;altra azienda.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href="/app" className="inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark">
            Vai alla tua azienda
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-lg border border-line bg-card px-5 font-semibold hover:border-ink-soft">
            Pagina iniziale
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
