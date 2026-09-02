import Link from "next/link";
import { chatGPTSignOutPath } from "../chatgpt-auth";

export default function AccessDenied() {
  return (
    <main className="admin-gate">
      <Link className="admin-gate-brand" href="/" aria-label="Marinela Hair Design — početna">
        <img
          className="admin-gate-logo"
          src="/brand/marinela-signature-on-dark.svg"
          alt="Marinela Hair Design"
          width="564"
          height="340"
        />
      </Link>
      <section className="admin-gate-card">
        <span className="admin-gate-lock" aria-hidden="true">
          <img src="/brand/marinela-crest-on-dark.svg" alt="" width="224" height="212" />
        </span>
        <p className="admin-gate-eyebrow">Privatni pristup</p>
        <h1>Ovaj račun nema pristup.</h1>
        <p>Prijavite se Google ili Apple računom koji je Marinela odobrila za upravljanje salonom.</p>
        <a className="admin-gate-primary" href={chatGPTSignOutPath("/prijava")}>Pokušaj drugim računom <span aria-hidden="true">↗</span></a>
        <Link className="admin-gate-secondary" href="/">← Povratak na stranicu</Link>
      </section>
    </main>
  );
}
