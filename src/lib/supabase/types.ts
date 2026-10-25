/**
 * Tipi del database usati dai client Supabase.
 * `database.types.ts` è GENERATO dal database reale (`npm run db:types`): non si modifica a mano.
 * Qui si correggono solo i dettagli che il generatore non può sapere: i parametri delle funzioni SQL
 * che accettano null (in Postgres ogni parametro può essere null, il generatore li dà tutti obbligatori).
 */
import type { Database as Generated, Json } from "./database.types";

export type { Json };

type Fns = Generated["public"]["Functions"];
/** Rende accettabili null i parametri K della funzione F. */
type NullableArgs<F extends keyof Fns, K extends keyof Fns[F]["Args"]> = Omit<Fns[F], "Args"> & {
  Args: Omit<Fns[F]["Args"], K> & { [P in K]: Fns[F]["Args"][P] | null };
};

export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Functions"> & {
    Functions: Omit<Fns, "create_employee" | "request_custom_plan"> & {
      create_employee: NullableArgs<"create_employee", "p_email">;
      request_custom_plan: NullableArgs<"request_custom_plan", "p_phone" | "p_locations" | "p_message">;
    };
  };
};
