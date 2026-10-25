"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Errore imprevisto in una pagina: messaggio in italiano, nuovo tentativo senza ricaricare tutto. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Qualcosa non ha funzionato</h1>
      <p className="text-lg text-ink-soft">
        Non è stato possibile caricare la pagina. I tuoi dati sono al sicuro: riprova tra qualche istante.
      </p>
      {error.digest && <p className="text-sm text-ink-soft">Codice per l&apos;assistenza: <span className="font-mono">{error.digest}</span></p>}
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark">
          Riprova
        </button>
        <Link href="/app" className="inline-flex h-11 items-center rounded-lg border border-line bg-card px-5 font-semibold hover:border-ink-soft">
          Torna a Oggi
        </Link>
      </div>
    </main>
  );
}
