import type { Metadata } from "next";
import { SignUpForm } from "./form";

export const metadata: Metadata = { title: "Registrati · ReBadge" };

export default function Page() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Crea l&apos;account della tua azienda</h1>
      <p className="mt-2 text-ink-soft">14 giorni di prova gratuita, senza carta di credito.</p>
      <SignUpForm />
    </>
  );
}
