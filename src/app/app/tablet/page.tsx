import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { it } from "date-fns/locale";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { ActivateDevice, RevokeDevice } from "./ui";

export const metadata: Metadata = { title: "Tablet · ReBadge" };

type Device = { id: string; name: string; created_at: string; last_seen_at: string | null };

export default async function TabletPage() {
  const { company } = await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("devices")
    .select("id, name, created_at, last_seen_at")
    .eq("company_id", company.id)
    .is("revoked_at", null)
    .order("created_at");
  const devices = (data ?? []) as Device[];
  const fmt = (iso: string) => formatInTimeZone(new Date(iso), company.timezone, "d MMM yyyy, HH:mm", { locale: it });

  return (
    <div className="max-w-3xl space-y-8">
      <h2 className="font-display text-2xl font-bold">Tablet</h2>

      <section aria-labelledby="act-t" className="rounded-xl border border-line bg-card p-6">
        <h3 id="act-t" className="font-display text-lg font-bold">Attiva un tablet per le timbrature</h3>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink-soft">
          <li>Apri questa pagina dal tablet che resterà in sede, accedendo con il tuo account.</li>
          <li>Premi &quot;Attiva questo tablet&quot;. Il tuo accesso su quel dispositivo verrà chiuso.</li>
          <li>Da quel momento il tablet mostra solo la schermata per timbrare.</li>
        </ol>
        <div className="mt-5"><ActivateDevice /></div>
      </section>

      <section aria-labelledby="list-t" className="space-y-3">
        <h3 id="list-t" className="font-display text-lg font-bold">Tablet attivi</h3>
        {devices.length === 0 ? (
          <p className="text-ink-soft">Nessun tablet attivo.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-sm text-ink-soft">Attivato il {fmt(d.created_at)}</p>
                  <p className="text-sm text-ink-soft">
                    {d.last_seen_at ? `Ultimo utilizzo: ${fmt(d.last_seen_at)}` : "Non ancora usato"}
                  </p>
                </div>
                <RevokeDevice id={d.id} name={d.name} />
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-ink-soft">Se un tablet viene perso o sostituito, disattivalo: smette subito di funzionare.</p>
      </section>
    </div>
  );
}
