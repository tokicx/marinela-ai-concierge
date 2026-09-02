import Link from "next/link";
import { SALON_ADDRESS, SALON_EMAIL } from "../lib/site";
import SiteHeader from "./site-header";

type LegalPageShellProps = {
  children: React.ReactNode;
  current: "privacy" | "terms";
  lead: string;
  title: string;
  updatedAt?: string;
};

export default function LegalPageShell({
  children,
  current,
  lead,
  title,
  updatedAt = "27. kolovoza 2026.",
}: LegalPageShellProps) {
  return (
    <div className="lux-site legal-route">
      <SiteHeader />

      <main id="main-content" tabIndex={-1}>
      <section className="legal-hero" aria-labelledby="legal-page-title">
        <span className="legal-hero-index" aria-hidden="true">MHD / 2026</span>
        <div>
          <p className="lux-eyebrow">Pravne informacije</p>
          <h1 id="legal-page-title">{title}</h1>
          <p>{lead}</p>
        </div>
        <dl>
          <div>
            <dt>Posljednje ažuriranje</dt>
            <dd>{updatedAt}</dd>
          </div>
          <div>
            <dt>Kontakt</dt>
            <dd><a href={"mailto:" + SALON_EMAIL}>{SALON_EMAIL}</a></dd>
          </div>
        </dl>
      </section>

      <section className="legal-layout">
        <aside className="legal-aside" aria-label="Pravni dokumenti">
          <p>Dokumenti</p>
          <nav>
            <Link aria-current={current === "privacy" ? "page" : undefined} href="/privatnost">
              Politika privatnosti
            </Link>
            <Link aria-current={current === "terms" ? "page" : undefined} href="/uvjeti-koristenja">
              Uvjeti korištenja
            </Link>
          </nav>
          <address>
            Marinela Hair Design<br />
            {SALON_ADDRESS.streetAddress}<br />
            {SALON_ADDRESS.postalCode} {SALON_ADDRESS.addressLocality}<br />
            <a href={"mailto:" + SALON_EMAIL}>{SALON_EMAIL}</a>
          </address>
        </aside>
        <article className="legal-copy">{children}</article>
      </section>

      </main>

      <footer className="booking-route-footer legal-page-footer">
        <Link href="/">← Povratak na početnu</Link>
        <nav aria-label="Pravne informacije">
          <Link aria-current={current === "privacy" ? "page" : undefined} href="/privatnost">Privatnost</Link>
          <Link aria-current={current === "terms" ? "page" : undefined} href="/uvjeti-koristenja">Uvjeti korištenja</Link>
        </nav>
        <a href="tel:+385955565738">095 556 5738</a>
      </footer>
    </div>
  );
}
