import type { NextConfig } from "next";

/**
 * Intestazioni di sicurezza su tutte le pagine:
 * - l'app non si può incorporare in altri siti (niente clickjacking sui pulsanti di correzione o di chiusura del mese);
 * - il browser non indovina il tipo dei file scaricati (report PDF ed Excel);
 * - fotocamera, microfono e posizione disattivati: l'app non li usa (DECISIONS n. 8, niente geolocalizzazione);
 * - HTTPS obbligatorio una volta in produzione.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Il logo può arrivare a 2 MB: margine per l'encoding del form
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
