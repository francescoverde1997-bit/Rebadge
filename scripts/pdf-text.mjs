// Testo di un PDF per i test (report-files.test.ts ed e2e phase6).
// Usa pdftotext -layout se installato (Linux, poppler); altrimenti pdfjs-dist, ricostruendo le righe
// dalla posizione del testo: le asserzioni cercano parole sulla stessa riga separate da spazi.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let hasPdftotext;
function pdftotextAvailable() {
  if (hasPdftotext === undefined) {
    try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); hasPdftotext = true; } catch { hasPdftotext = false; }
  }
  return hasPdftotext;
}

export async function pdfText(path) {
  if (pdftotextAvailable()) return execFileSync("pdftotext", ["-layout", path, "-"]).toString();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const { items } = await (await doc.getPage(i)).getTextContent();
    const lines = new Map(); // y arrotondata → pezzi di testo
    for (const it of items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      const line = lines.get(y) ?? [];
      line.push({ x: it.transform[4], s: it.str });
      lines.set(y, line);
    }
    pages.push([...lines.entries()]
      .sort((a, b) => b[0] - a[0]) // dall'alto in basso
      .map(([, l]) => l.sort((a, b) => a.x - b.x).map((p) => p.s).join("  "))
      .join("\n"));
  }
  return pages.join("\f");
}
