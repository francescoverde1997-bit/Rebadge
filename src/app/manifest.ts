import type { MetadataRoute } from "next";

/** "Aggiungi a schermata Home" sul tablet: si apre direttamente la timbratrice a tutto schermo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReBadge — Timbratrice",
    short_name: "Timbratrice",
    start_url: "/timbra",
    display: "fullscreen",
    orientation: "any",
    background_color: "#1b2b44",
    theme_color: "#1b2b44",
    lang: "it",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
