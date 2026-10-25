import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/hours/month";

/** Navigazione tra i mesi: oltre `max` (predefinito: il mese corrente) non si va. */
export function MonthNav({ month, current, basePath, max }: { month: string; current: string; basePath: string; max?: string }) {
  const limit = max ?? current;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const linkCls = "inline-flex h-10 items-center rounded-lg border border-line bg-card px-3 font-semibold hover:border-ink-soft";
  return (
    <nav aria-label="Mese" className="flex items-center gap-2">
      <Link href={`${basePath}?mese=${prev}`} className={linkCls} aria-label={`Mese precedente: ${monthLabel(prev)}`}>‹</Link>
      <p className="min-w-40 text-center font-display text-lg font-bold first-letter:uppercase" aria-live="polite">
        {monthLabel(month)}
      </p>
      {month < limit ? (
        <Link href={`${basePath}?mese=${next}`} className={linkCls} aria-label={`Mese successivo: ${monthLabel(next)}`}>›</Link>
      ) : (
        <span aria-hidden className={`${linkCls} cursor-default opacity-30 hover:border-line`}>›</span>
      )}
    </nav>
  );
}
