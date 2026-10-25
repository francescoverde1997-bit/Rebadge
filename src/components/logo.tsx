/**
 * Marchio ReBadge — logo "A · Il badge": due tesserini sovrapposti (il badge di ogni giorno, rinnovato)
 * con la spunta di "timbrato". Solo i colori della piattaforma.
 * Le icone statiche (src/app/icon.svg, apple-icon.png, public/brand/*) si rigenerano con `npm run brand:icons`.
 */

export const BRAND_NAME = "ReBadge";
export const BRAND_SLOGAN = "Timbra. Controlla. Invia.";

type Variant = "light" | "dark" | "tile";

/** Simbolo. light: su fondo chiaro · dark: su fondo inchiostro · tile: icona quadrata (app, favicon). */
export function BadgeMark({ variant = "light", className = "" }: { variant?: Variant; className?: string }) {
  const back = variant === "light" ? "var(--color-ink)" : "rgb(255 255 255 / 0.22)";
  const slot = variant === "light" ? "var(--color-paper)" : "var(--color-ink)";
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      {variant === "tile" && <rect width="64" height="64" rx="15" fill="var(--color-ink)" />}
      <g transform={variant === "tile" ? "translate(6.4 6.4) scale(.8)" : undefined}>
        <rect x="12" y="7" width="34" height="48" rx="9" fill={back} transform="rotate(-10 29 31)" />
        <rect x="18" y="9" width="34" height="48" rx="9" fill="var(--color-brand)" />
        <rect x="29" y="15" width="12" height="4.2" rx="2.1" fill={slot} />
        <path d="M26 37.5l5.6 5.6L44 30.5" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Logo completo: simbolo + "ReBadge" (e, se richiesto, lo slogan). */
export function Logo({ variant = "light", size = "md", slogan = false, className = "" }: {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  slogan?: boolean;
  className?: string;
}) {
  const s = { sm: { mark: "h-7 w-7", word: "text-xl" }, md: { mark: "h-9 w-9", word: "text-2xl" }, lg: { mark: "h-14 w-14", word: "text-4xl" } }[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BadgeMark variant={variant} className={`${s.mark} shrink-0`} />
      <span className="flex flex-col leading-none">
        <span className={`font-display font-bold tracking-tight ${s.word}`}>
          <span className={`font-semibold ${variant === "dark" ? "text-[#9db8de]" : "text-brand"}`}>Re</span>
          <span className={variant === "dark" ? "text-white" : "text-ink"}>Badge</span>
        </span>
        {slogan && (
          <span className={`mt-1.5 text-sm font-medium ${variant === "dark" ? "text-white/70" : "text-ink-soft"}`}>{BRAND_SLOGAN}</span>
        )}
      </span>
    </span>
  );
}
