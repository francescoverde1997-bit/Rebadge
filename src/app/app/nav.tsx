"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "../(auth)/actions";

const LINKS = [
  { href: "/app", label: "Oggi" },
  { href: "/app/presenze", label: "Presenze" },
  { href: "/app/ferie", label: "Ferie" },
  { href: "/app/report", label: "Report" },
  { href: "/app/dipendenti", label: "Dipendenti" },
  { href: "/app/tablet", label: "Tablet" },
  { href: "/app/impostazioni", label: "Impostazioni" },
  { href: "/app/abbonamento", label: "Abbonamento" },
];

/** Su smartphone le prime quattro sezioni stanno nella barra in basso, le altre in "Altro". */
const MAIN = LINKS.slice(0, 4);
const MORE = LINKS.slice(4);

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Sezioni" className="mx-auto mt-4 hidden max-w-6xl gap-1 px-2 sm:flex sm:px-4">
      {LINKS.map((l) => {
        const active = isActive(path, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap px-3 pb-3 pt-1 text-sm font-semibold ${
              active ? "text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {l.label}
            {/* indicatore della sezione: si allarga dal centro quando la sezione diventa attiva */}
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 h-0.5 origin-center rounded-full bg-brand transition-[scale,opacity] duration-200 ease-[var(--ease-out)] ${
                active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra di navigazione in basso, solo su smartphone: tutte le sezioni a portata di pollice. */
export function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((l) => isActive(path, l.href));

  useEffect(() => setOpen(false), [path]); // cambio sezione: il pannello si chiude
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const item = "flex flex-col items-center justify-center gap-1 text-[11px]";
  return (
    <div className="sm:hidden">
      {open && <button type="button" aria-label="Chiudi il menu" onClick={() => setOpen(false)} className="anim-fade fixed inset-0 z-30 bg-ink/30" />}
      {open && (
        <div id="altre-sezioni" className="anim-in fixed inset-x-3 bottom-[5.5rem] z-40 rounded-xl border border-line bg-card p-2 shadow-lg">
          <ul>
            {MORE.map((l) => {
              const active = isActive(path, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-12 items-center rounded-lg px-4 font-semibold ${active ? "bg-paper text-brand" : "text-ink hover:bg-paper"}`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <form action={signOut} className="mt-1 border-t border-line pt-1">
            <button className="flex h-12 w-full items-center rounded-lg px-4 font-semibold text-ink-soft hover:bg-paper">Esci</button>
          </form>
        </div>
      )}
      <nav aria-label="Sezioni" className="fixed inset-x-0 bottom-0 z-40 grid h-[4.75rem] grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {MAIN.map((l) => {
          const active = isActive(path, l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={`${item} ${active ? "font-bold text-brand" : "text-ink-soft"}`}>
              <NavIcon name={l.label} />
              {l.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="altre-sezioni"
          className={`${item} ${open || moreActive ? "font-bold text-brand" : "text-ink-soft"}`}
        >
          <NavIcon name="Altro" />
          Altro
        </button>
      </nav>
    </div>
  );
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    Oggi: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    Presenze: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 4v16" /></>,
    Ferie: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    Report: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
    Altro: <path d="M4 7h16M4 12h16M4 17h16" />,
  };
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
