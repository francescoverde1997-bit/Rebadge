"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Barra di caricamento sottile in alto durante il passaggio da una pagina all'altra.
 * Compare solo se il caricamento dura più di 150 ms (niente lampeggi sui cambi veloci)
 * e sparisce appena la nuova pagina è pronta.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  // nuova pagina pronta: via la barra
  useEffect(() => { setActive(false); }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // stessa pagina o ancora
      if (url.pathname.includes("/file")) return; // download dei report
      setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // rete lenta o navigazione annullata: la barra non resta per sempre
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 10_000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;
  return (
    <div aria-hidden className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-brand/10">
      <div className="progress-bar h-full w-2/5 rounded-full bg-brand" />
    </div>
  );
}
