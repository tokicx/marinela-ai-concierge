"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const prompts = [
  "Želim prirodan balayage. Koja mi usluga odgovara i kada Mia ima slobodan termin sljedeći tjedan?",
  "Želim više dužine i volumena, ali nisam sigurna trebam li konzultaciju prije ekstenzija.",
  "Pronađi prvi slobodan termin za konzultaciju i pripremi ga da ga mogu potvrditi.",
] as const;

export default function ConciergeGuide() {
  const [supportState, setSupportState] = useState<"checking" | "ready" | "unsupported" | "error">("checking");
  const [copied, setCopied] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    const initialFrame = window.requestAnimationFrame(() => {
      const capabilityAvailable = Boolean(document.modelContext?.registerTool);
      const registrationState = document.documentElement.dataset.marinelaWebmcp;
      setSupportState(
        !capabilityAvailable
          ? "unsupported"
          : registrationState === "ready"
            ? "ready"
            : registrationState === "error"
              ? "error"
              : "checking",
      );
    });
    const markReady = () => setSupportState("ready");
    const markError = () => setSupportState("error");
    window.addEventListener("marinela:webmcp-ready", markReady);
    window.addEventListener("marinela:webmcp-error", markError);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener("marinela:webmcp-ready", markReady);
      window.removeEventListener("marinela:webmcp-error", markError);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  async function copyPrompt(prompt: string, index: number) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(index);
      setCopyFeedback("Upit je kopiran i spreman za razgovor s agentom.");
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        setCopied((current) => current === index ? null : current);
        setCopyFeedback("");
        copyTimer.current = null;
      }, 2200);
    } catch {
      setCopied(null);
      setCopyFeedback("Kopiranje nije uspjelo — označite upit ručno.");
    }
  }

  return (
    <section className="concierge-console" aria-labelledby="concierge-console-title">
      <div className="concierge-console-topline">
        <span
          className={`concierge-status ${supportState}`}
          role="status"
          aria-live="polite"
        >
          <i aria-hidden="true" />
          {supportState === "ready"
            ? "AI agent spreman"
            : supportState === "unsupported"
              ? "Otvorite u ChatGPT pregledniku"
              : supportState === "error"
                ? "AI alati trenutačno nisu dostupni"
                : "Provjera AI alata"}
        </span>
        <span>WebMCP · 5 alata</span>
      </div>

      <div className="concierge-console-heading">
        <img
          src="/brand/marinela-crest-on-dark.svg"
          alt=""
          width="224"
          height="212"
        />
        <div>
          <p>Marinela AI Concierge</p>
          <h2 id="concierge-console-title">Pitajte kao u razgovoru.</h2>
        </div>
      </div>

      <p className="concierge-console-copy">
        U ChatGPT pregledniku otvorite razgovor uz ovu stranicu i opišite željeni
        rezultat. Agent može pročitati aktualni cjenik, pronaći uslugu, provjeriti
        raspoloživost i pripremiti termin za vašu osobnu potvrdu.
      </p>

      <div className="concierge-prompts" aria-label="Primjeri pitanja">
        {prompts.map((prompt, index) => (
          <button type="button" key={prompt} onClick={() => copyPrompt(prompt, index)}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{prompt}</strong>
            <small>{copied === index ? "Kopirano" : "Kopiraj upit"}</small>
          </button>
        ))}
      </div>

      <p className="concierge-copy-status" aria-live="polite">
        {copyFeedback}
      </p>

      <div className="concierge-console-actions">
        <Link className="gold-button" href="/rezervacija">Klasična rezervacija</Link>
        <Link className="ghost-link" href="/cjenik">Pogledaj cjenik</Link>
      </div>
    </section>
  );
}
