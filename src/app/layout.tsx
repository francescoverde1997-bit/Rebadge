import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NavProgress } from "@/components/nav-progress";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReBadge · Timbra. Controlla. Invia.",
  description: "ReBadge: timbrature da tablet, ferie e report ore per il consulente. Il cartellino presenze digitale per piccole aziende.",
  applicationName: "ReBadge",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="antialiased">
        <Suspense fallback={null}><NavProgress /></Suspense>
        {children}
      </body>
    </html>
  );
}
