import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { PLANS, dailyPriceCents, formatPrice } from "@/lib/plans";
import { Pricing, TrialLink } from "@/components/pricing";
import { SiteFooter, SiteHeader } from "@/components/site";
import { VideoButton } from "@/components/video-dialog";
// Schermate vere dell'app demo: si rigenerano con `npm run shots:home`
import shotOggi from "../../public/home/oggi.webp";
import shotPresenze from "../../public/home/presenze.webp";
import shotReport from "../../public/home/report.webp";
import shotTabletNomi from "../../public/home/tablet-nomi.webp";
import shotTabletPin from "../../public/home/tablet-pin.webp";

const fromDay = formatPrice(dailyPriceCents(PLANS[0].priceCents));

export const metadata: Metadata = {
  title: "ReBadge · Timbra. Controlla. Invia.",
  description:
    "ReBadge: i dipendenti timbrano con nome e PIN sul tablet in sede, le ore si calcolano da sole e a fine mese mandi il report al consulente. " +
    `Per piccole aziende, da ${fromDay} al giorno. 14 giorni di prova gratuita.`,
};

const STEPS: { n: string; title: string; text: string; points: string[]; shot: StaticImageData; alt: string; device: "tablet" | "browser" }[] = [
  {
    n: "1",
    title: "Timbrano dal tablet",
    text: "Un tablet fisso in sede. Il dipendente tocca il suo nome, inserisce il PIN ed è fatto: entrata o uscita le capisce da solo.",
    points: [
      "L'orario lo segna il server, non il tablet: nessuno può spostarlo",
      "Doppio tocco per sbaglio? Ignorato",
      "Funziona su qualsiasi tablet con un browser",
    ],
    shot: shotTabletNomi,
    alt: "La timbratrice sul tablet: i dipendenti toccano il proprio nome",
    device: "tablet",
  },
  {
    n: "2",
    title: "Tu controlli, le ore si contano da sole",
    text: "Vedi chi è al lavoro adesso e il riepilogo del mese di ogni dipendente, già calcolato.",
    points: [
      "Ore ordinarie, straordinari, notturne e festive",
      "Se qualcuno dimentica di timbrare, te lo segnaliamo",
      "Correggi con un motivo: ogni modifica resta registrata",
    ],
    shot: shotPresenze,
    alt: "Il riepilogo mensile delle presenze con ore ordinarie, straordinari, notturne e festive",
    device: "browser",
  },
  {
    n: "3",
    title: "A fine mese, mandi il report al consulente",
    text: "PDF ed Excel pronti con il tuo logo e lo spazio per le firme. Niente più fogli da ricopiare.",
    points: [
      "Ore in ore:minuti e in decimali, come le vuole il consulente",
      "Scaricato il PDF definitivo, il mese si chiude: le ore non cambiano più",
      "Ferie, permessi e malattia già nel report",
    ],
    shot: shotReport,
    alt: "La sezione Report con anteprima PDF, Excel e PDF definitivo per il consulente",
    device: "browser",
  },
];

const FEATURES = [
  { title: "Ferie, permessi e malattia", text: "Calendario del mese per tutta l'azienda. Ferie in giorni lavorativi, permessi a ore." },
  { title: "Regole tue", text: "Arrotondamenti, pausa automatica, soglia degli straordinari, fascia notturna: decidi tu, per la tua azienda." },
  { title: "Festivi e Santo Patrono", text: "Domeniche e festività nazionali già incluse. Il Patrono del tuo comune lo aggiungi in un attimo." },
  { title: "Turni di notte", text: "Un turno che finisce dopo mezzanotte resta nel giorno in cui è iniziato, con l'ora legale gestita." },
  { title: "Più tablet, nessun limite", text: "Un tablet al bancone, uno in laboratorio: tutti i tablet che servono, in ogni piano." },
  { title: "Il tuo logo", text: "Sull'intestazione dell'app, sul tablet e sul report che mandi al consulente." },
];

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <SiteHeader />

      <main>
        {/* ---------------------------------------------------------------- hero */}
        <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20">
          <div className="max-w-3xl">
            <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-7xl">
              Il cartellino presenze, <span className="text-brand">senza carta.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft sm:text-xl">
              I dipendenti timbrano con nome e PIN sul tablet in sede. Tu vedi chi è al lavoro, le ore si calcolano
              da sole e a fine mese mandi il report al consulente.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/registrati" className="inline-flex h-12 items-center justify-center rounded-lg bg-brand px-6 text-lg font-semibold text-white hover:bg-brand-dark">
                Prova gratis 14 giorni
              </Link>
              <Link href="/prezzi" className="inline-flex h-12 items-center justify-center rounded-lg border border-line bg-card px-6 text-lg font-semibold hover:border-ink-soft">
                Vedi i prezzi
              </Link>
              <VideoButton />
            </div>
            <p className="mt-4 text-ink-soft">
              Senza carta di credito · da <strong className="font-semibold text-ink">{fromDay} al giorno</strong>
            </p>
          </div>

          <div className="relative mt-14 pb-12 sm:mt-16 sm:pb-20 lg:pb-24">
            <BrowserFrame className="lg:mr-40">
              <Image src={shotOggi} alt="La schermata Oggi: chi è al lavoro adesso, chi no e le timbrature da sistemare" priority sizes="(min-width: 1152px) 900px, 100vw" />
            </BrowserFrame>
            <TabletFrame className="absolute bottom-0 right-0 hidden w-[44%] max-w-[460px] sm:block">
              <Image src={shotTabletPin} alt="Il tablet chiede il PIN del dipendente" sizes="460px" />
            </TabletFrame>
          </div>
        </section>

        <section aria-label="Per chi è" className="border-y border-line bg-card">
          <p className="mx-auto max-w-6xl px-4 py-6 text-center text-lg text-ink-soft sm:px-6">
            Per <strong className="font-semibold text-ink">bar, ristoranti, negozi, laboratori, panifici e studi</strong>: chi ha da 1 a 30 dipendenti
            e vuole smettere di contare le ore a mano.
          </p>
        </section>

        {/* ------------------------------------------------------ come funziona */}
        <section id="come-funziona" aria-labelledby="how-t" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 id="how-t" className="max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">Timbra. Controlla. Invia.</h2>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">Tre passaggi, dal tablet al consulente del lavoro.</p>

          <ol className="mt-14 space-y-20 sm:space-y-28">
            {STEPS.map((s, i) => (
              <li key={s.n} className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
                <div className={`lg:col-span-5 ${i % 2 ? "lg:order-2" : ""}`}>
                  <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-ink font-display text-lg font-bold text-white">{s.n}</span>
                  <h3 className="mt-5 font-display text-3xl font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-4 text-lg leading-relaxed text-ink-soft">{s.text}</p>
                  <ul className="mt-6 space-y-3">
                    {s.points.map((p) => (
                      <li key={p} className="flex gap-3"><Tick />{p}</li>
                    ))}
                  </ul>
                </div>
                <div className={`lg:col-span-7 ${i % 2 ? "lg:order-1" : ""}`}>
                  {s.device === "tablet" ? (
                    <TabletFrame><Image src={s.shot} alt={s.alt} sizes="(min-width: 1024px) 640px, 100vw" /></TabletFrame>
                  ) : (
                    <BrowserFrame><Image src={s.shot} alt={s.alt} sizes="(min-width: 1024px) 640px, 100vw" /></BrowserFrame>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ----------------------------------------------------------- funzioni */}
        <section aria-labelledby="feat-t" className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="grid gap-12 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <h2 id="feat-t" className="font-display text-4xl font-bold tracking-tight">Quello che serve, niente di più.</h2>
                <p className="mt-4 text-lg text-ink-soft">
                  Pensato per chi gestisce l&apos;azienda e non ha tempo per un gestionale complicato.
                </p>
              </div>
              <dl className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:col-span-8">
                {FEATURES.map((f) => (
                  <div key={f.title} className="border-t-2 border-ink pt-4">
                    <dt className="font-display text-xl font-bold">{f.title}</dt>
                    <dd className="mt-2 text-ink-soft">{f.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ privacy */}
        <section aria-labelledby="privacy-t" className="bg-ink text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="privacy-t" className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                Niente impronte digitali.<br />Niente GPS.
              </h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/80">
                Per timbrare bastano nome e PIN. Raccogliamo solo i dati che servono per le presenze, come chiede il GDPR.
              </p>
            </div>
            <ul className="grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2">
              {[
                ["Dati in Europa", "Database su server nell'Unione Europea."],
                ["Ogni azienda separata", "Nessuno vede i dati di un'altra azienda: lo garantisce il database."],
                ["Correzioni tracciate", "Le timbrature non si cancellano: si correggono con un motivo, e resta tutto registrato."],
                ["Il tablet non dice chi c'è", "Sullo schermo in sede si vedono solo i nomi, non chi è presente."],
              ].map(([t, d]) => (
                <li key={t} className="bg-ink p-6">
                  <p className="font-display text-lg font-bold">{t}</p>
                  <p className="mt-1.5 text-white/70">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- prezzi */}
        <section id="prezzi" aria-labelledby="price-t" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-2xl">
            <h2 id="price-t" className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Paghi per quanti dipendenti hai.</h2>
            <p className="mt-4 text-lg text-ink-soft">
              Prezzi IVA esclusa, addebito mensile. Cambi piano o disdici quando vuoi.{" "}
              <Link href="/prezzi" className="font-medium text-brand underline-offset-4 hover:underline">Domande sui prezzi</Link>
            </p>
          </div>
          <div className="mt-12">
            <Pricing
              interactive
              actions={Object.fromEntries(PLANS.map((p, i) => [p.id, <TrialLink key={p.id} primary={i === PLANS.length - 1} />]))}
              customAction={
                <Link href="/prezzi#personalizzato" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-white px-5 font-semibold text-ink transition-colors hover:bg-white/90">
                  Richiedi un preventivo
                </Link>
              }
            />
          </div>
        </section>

        {/* ---------------------------------------------------------- chiusura */}
        <section aria-labelledby="cta-t" className="px-4 pb-20 sm:px-6 sm:pb-28">
          <div className="mx-auto max-w-6xl rounded-3xl bg-brand px-6 py-14 text-center text-white sm:px-12 sm:py-20">
            <h2 id="cta-t" className="mx-auto max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Questo mese, le ore contale con ReBadge.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
              14 giorni gratis con tutte le funzioni. Ti servono solo un tablet e cinque minuti per aggiungere i dipendenti.
            </p>
            <Link href="/registrati" className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-7 text-lg font-semibold text-brand hover:bg-white/90">
              Crea l&apos;account gratis
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function BrowserFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-card shadow-[0_30px_60px_-30px_rgba(27,43,68,.35)] ${className}`}>
      <div aria-hidden className="flex h-8 items-center gap-1.5 border-b border-line bg-paper px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" />
      </div>
      {children}
    </div>
  );
}

function TabletFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[1.75rem] bg-[#0f1a2b] p-2.5 shadow-[0_30px_60px_-24px_rgba(15,26,43,.6)] sm:p-3 ${className}`}>
      <div className="overflow-hidden rounded-[1.15rem]">{children}</div>
    </div>
  );
}

function Tick() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-present" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
