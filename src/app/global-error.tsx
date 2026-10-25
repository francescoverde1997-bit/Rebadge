"use client";

import "./globals.css";

/** Errore nel layout principale: pagina minima, autosufficiente, in italiano. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body className="antialiased">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
          <h1 className="font-display text-3xl font-bold">Qualcosa non ha funzionato</h1>
          <p className="text-lg text-ink-soft">ReBadge non è riuscito a caricarsi. I tuoi dati sono al sicuro: riprova tra qualche istante.</p>
          {error.digest && <p className="text-sm text-ink-soft">Codice per l&apos;assistenza: <span className="font-mono">{error.digest}</span></p>}
          <button type="button" onClick={reset} className="inline-flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark">
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
