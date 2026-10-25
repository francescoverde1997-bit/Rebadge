import type { Metadata } from "next";
import { requireOwner } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { AddEmployee, EmployeeRow, type Employee } from "./ui";

export const metadata: Metadata = { title: "Dipendenti · ReBadge" };

export default async function EmployeesPage() {
  const { company } = await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, active, pin_set_at")
    .eq("company_id", company.id)
    .order("last_name")
    .order("first_name");
  if (error) throw new Error("Impossibile caricare i dipendenti");

  const employees = (data ?? []) as Employee[];
  const active = employees.filter((e) => e.active);
  const inactive = employees.filter((e) => !e.active);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">
          Dipendenti <span className="font-sans text-lg font-normal text-ink-soft">{active.length}</span>
        </h2>
      </div>

      <AddEmployee startOpen={employees.length === 0} />

      {active.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {active.map((e) => <EmployeeRow key={e.id} employee={e} />)}
        </ul>
      ) : (
        employees.length > 0 && <p className="text-ink-soft">Nessun dipendente attivo.</p>
      )}

      {inactive.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer font-semibold text-ink-soft hover:text-ink">
            Disattivati ({inactive.length})
          </summary>
          <p className="mt-2 text-sm text-ink-soft">
            Non compaiono sul tablet. Le loro ore restano nei report dei mesi passati.
          </p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
            {inactive.map((e) => <EmployeeRow key={e.id} employee={e} />)}
          </ul>
        </details>
      )}
    </div>
  );
}
