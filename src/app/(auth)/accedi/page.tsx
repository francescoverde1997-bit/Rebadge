import type { Metadata } from "next";
import { Notice } from "@/components/ui";
import { SignInForm } from "./form";

export const metadata: Metadata = { title: "Accedi · ReBadge" };

export default async function Page({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const { errore } = await searchParams;
  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Accedi</h1>
      {errore === "link" && (
        <div className="mt-6">
          <Notice tone="error">Il link non è valido o è scaduto. Accedi oppure richiedine uno nuovo.</Notice>
        </div>
      )}
      <SignInForm />
    </>
  );
}
