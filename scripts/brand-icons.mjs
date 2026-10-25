// Genera le icone e i file del marchio ReBadge dal disegno di src/components/logo.tsx.
// Uso: npm run brand:icons
import sharp from "sharp";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const INK = "#1b2b44", BRAND = "#24508a", PAPER = "#f7f8fa";
const mark = (variant) => {
  const back = variant === "light" ? INK : "rgba(255,255,255,.22)";
  const slot = variant === "light" ? PAPER : INK;
  const tile = variant === "tile" ? `<rect width="64" height="64" rx="15" fill="${INK}"/>` : variant === "square" ? `<rect width="64" height="64" fill="${INK}"/>` : "";
  const inner = variant === "tile" || variant === "square";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${tile}<g${inner ? ' transform="translate(6.4 6.4) scale(.8)"' : ""}>` +
    `<rect x="12" y="7" width="34" height="48" rx="9" fill="${inner ? "rgba(255,255,255,.22)" : back}" transform="rotate(-10 29 31)"/>` +
    `<rect x="18" y="9" width="34" height="48" rx="9" fill="${BRAND}"/>` +
    `<rect x="29" y="15" width="12" height="4.2" rx="2.1" fill="${inner ? INK : slot}"/>` +
    `<path d="M26 37.5l5.6 5.6L44 30.5" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
};

mkdirSync("public/brand", { recursive: true });
writeFileSync("src/app/icon.svg", mark("tile"));                 // favicon (Next.js)
writeFileSync("public/brand/rebadge-mark.svg", mark("light"));     // simbolo su fondo chiaro
writeFileSync("public/brand/rebadge-mark-dark.svg", mark("dark")); // simbolo su fondo scuro
writeFileSync("public/brand/rebadge-icon.svg", mark("tile"));      // icona arrotondata
// iPhone/iPad e app del tablet: quadrato pieno (il sistema arrotonda da sé)
await sharp(Buffer.from(mark("square")), { density: 600 }).resize(180, 180).png().toFile("src/app/apple-icon.png");
for (const s of [192, 512]) await sharp(Buffer.from(mark("square")), { density: 600 }).resize(s, s).png().toFile(`public/brand/icon-${s}.png`);

// Logo completo (simbolo + scritta) in PNG, per email e documenti: reso con il font del marchio
const font = (f) => readFileSync(f).toString("base64");
const brico = font("node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2");
const pub = font("node_modules/@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2");
const lockup = (dark) => `<!doctype html><html><head><style>
@font-face{font-family:B;src:url(data:font/woff2;base64,${brico}) format("woff2");font-weight:200 800}
@font-face{font-family:P;src:url(data:font/woff2;base64,${pub}) format("woff2");font-weight:100 900}
html,body{margin:0;background:transparent}
.l{display:inline-flex;align-items:center;gap:16px;padding:8px}
.m{width:72px;height:72px}
.w{font-family:B;font-size:52px;line-height:1;letter-spacing:-.03em}
.re{font-weight:600;color:${dark ? "#9db8de" : BRAND}}.b{font-weight:800;color:${dark ? "#fff" : INK}}
.s{font-family:P;font-weight:500;font-size:17px;margin-top:8px;color:${dark ? "rgba(255,255,255,.72)" : "#4a5a70"}}
</style></head><body><div class="l"><div class="m">${mark(dark ? "dark" : "light")}</div>
<div><div class="w"><span class="re">Re</span><span class="b">Badge</span></div><div class="s">Timbra. Controlla. Invia.</div></div></div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [dark, name] of [[false, "rebadge-logo"], [true, "rebadge-logo-dark"]]) {
  await page.setContent(lockup(dark));
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".l").screenshot({ path: `public/brand/${name}.png`, omitBackground: true });
}
await browser.close();
console.log("✓ icone e logo ReBadge generati");
