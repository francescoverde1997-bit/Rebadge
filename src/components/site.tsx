import Link from "next/link";
import { BadgeMark, BRAND_SLOGAN, Logo } from "@/components/logo";

/** Intestazione delle pagine pubbliche (homepage, prezzi). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" aria-label="ReBadge, pagina iniziale" className="shrink-0 rounded-lg">
          {/* sui telefoni più stretti solo il simbolo: "Accedi" e "Prova gratis" devono restare nello schermo */}
          <Logo size="md" className="max-[379px]:hidden" />
          <BadgeMark className="h-9 w-9 min-[380px]:hidden" />
        </Link>
        <nav aria-label="Principale" className="flex items-center gap-1 sm:gap-2">
          <Link href="/#come-funziona" className="hidden rounded-lg px-3 py-2 font-medium text-ink-soft hover:text-ink md:block">Come funziona</Link>
          <Link href="/prezzi" className="hidden rounded-lg px-3 py-2 font-medium text-ink-soft hover:text-ink sm:block">Prezzi</Link>
          <Link href="/accedi" className="rounded-lg px-2 py-2 font-medium text-ink-soft hover:text-ink sm:px-3">Accedi</Link>
          <Link href="/registrati" className="ml-1 inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-brand px-3 font-semibold text-white hover:bg-brand-dark sm:px-4">
            Prova gratis
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-ink-soft sm:px-6">
        <div className="flex items-center gap-3"><Logo size="sm" /><span>{BRAND_SLOGAN}</span></div>
        <nav aria-label="Piè di pagina" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/prezzi" className="hover:text-ink">Prezzi</Link>
          <Link href="/accedi" className="hover:text-ink">Accedi</Link>
          <Link href="/registrati" className="hover:text-ink">Registrati</Link>
        </nav>
      </div>
    </footer>
  );
}
