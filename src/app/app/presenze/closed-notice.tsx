import Link from "next/link";

export function ClosedNotice({ closedAt, month }: { closedAt: string; month: string }) {
  return (
    <p role="status" className="rounded-lg bg-present-soft px-4 py-3 text-present">
      Mese chiuso il {closedAt}: il PDF è stato inviato e le ore non si possono più modificare. Per correggere qualcosa contatta l&apos;assistenza.{" "}
      <Link href={`/app/report?mese=${month}`} className="font-semibold underline underline-offset-4">Vai al report</Link>
    </p>
  );
}
