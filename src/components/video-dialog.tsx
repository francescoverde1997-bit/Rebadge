"use client";

import { useRef } from "react";

const SRC = "/video/rebadge-presentazione.mp4";
const POSTER = "/video/rebadge-presentazione-poster.webp";
const CAPTIONS = "/video/rebadge-presentazione.vtt";

/**
 * "Guarda come funziona": il video di presentazione in una finestra (dialog nativo: Esc e focus gestiti dal browser).
 * Il file è sul nostro sito, niente YouTube né cookie di terzi; si scarica e parte solo al clic, con l'audio
 * (il clic dell'utente lo consente). Chiudendo la finestra il video si ferma. I sottotitoli sono già nel video.
 */
export function VideoButton({ className = "" }: { className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const open = () => {
    dialog.current?.showModal();
    video.current?.play().catch(() => { /* se il browser blocca la riproduzione resta il pulsante play */ });
  };
  const pause = () => video.current?.pause();
  const close = () => { pause(); dialog.current?.close(); };

  return (
    <>
      <button type="button" onClick={open} className={`inline-flex h-12 items-center justify-center gap-2.5 rounded-lg px-5 text-lg font-semibold text-ink hover:bg-card ${className}`}>
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
          <svg viewBox="0 0 16 16" className="ml-0.5 h-3.5 w-3.5" fill="currentColor"><path d="M4 2.5v11l9-5.5z" /></svg>
        </span>
        Guarda come funziona
        <span className="text-base font-normal text-ink-soft">1 min</span>
      </button>

      <dialog
        ref={dialog}
        aria-label="Video: come funziona ReBadge"
        onCancel={pause} // Esc: si ferma subito, prima che il browser chiuda la finestra
        onClose={pause}
        onClick={(e) => { if (e.target === dialog.current) close(); }} // clic fuori dal video
        className="m-auto w-[min(92vw,1100px)] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-ink/80"
      >
        <div className="anim-pop relative">
          <video
            ref={video}
            controls
            playsInline
            preload="none"
            poster={POSTER}
            className="aspect-video w-full rounded-xl bg-ink shadow-2xl"
          >
            <source src={SRC} type="video/mp4" />
            <track kind="captions" src={CAPTIONS} srcLang="it" label="Italiano" />
            Il tuo browser non riproduce il video. <a href={SRC}>Scaricalo qui</a>.
          </video>
          <button
            type="button"
            onClick={close}
            aria-label="Chiudi il video"
            className="absolute -top-12 right-0 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-2xl leading-none text-white hover:bg-white/25"
          >
            ×
          </button>
        </div>
      </dialog>
    </>
  );
}
