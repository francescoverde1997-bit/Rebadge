import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Timbratrice · ReBadge",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // niente zoom accidentale con i tocchi rapidi
  userScalable: false,
  themeColor: "#1b2b44",
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh select-none bg-ink text-white">{children}</div>;
}
