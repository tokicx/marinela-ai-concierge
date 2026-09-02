import type { Metadata } from "next";
import Link from "next/link";
import FooterMeta from "../footer-meta";
import SiteHeader from "../site-header";
import ConciergeGuide from "./concierge-guide";
import { publicAssetUrl, SALON_NAME, SOCIAL_IMAGE_ALT } from "../../lib/site";

export const metadata: Metadata = {
  title: "AI savjetnik za odabir usluge i termina",
  description:
    "Marinela AI Concierge pomaže pronaći odgovarajuću frizersku uslugu, aktualnu cijenu i slobodan termin uz sigurnu osobnu potvrdu rezervacije.",
  alternates: { canonical: "/concierge" },
  openGraph: {
    title: "Marinela AI Concierge",
    description: "Savjet o usluzi, aktualni cjenik i provjera slobodnih termina na jednom mjestu.",
    url: "/concierge",
    siteName: SALON_NAME,
    locale: "hr_HR",
    type: "website",
    images: [{
      url: publicAssetUrl("/og.png"),
      width: 1200,
      height: 630,
      alt: SOCIAL_IMAGE_ALT,
    }],
  },
};

const capabilities = [
  ["01", "Savjet", "Pronalazi uslugu prema željenom rezultatu, ne prema nagađanju."],
  ["02", "Cjenik", "Čita aktualne javne cijene koje salon uređuje u dashboardu."],
  ["03", "Termin", "Provjerava stvarnu raspoloživost Marinele i Mije."],
  ["04", "Potvrda", "Priprema odabir, ali termin potvrđujete osobno vi."],
] as const;

export default function ConciergePage() {
  return (
    <div className="lux-site concierge-route">
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="concierge-stage">
          <div className="concierge-intro">
            <p className="lux-eyebrow">Savjet i termin · WebMCP</p>
            <h1>
              Opišite želju.
              <em>Agent priprema sljedeći korak.</em>
            </h1>
            <p>
              Ne morate unaprijed znati stručni naziv usluge. Recite što želite
              postići, a concierge će povezati vaš cilj s provjerenim podacima salona.
            </p>
            <div className="concierge-principle">
              <span aria-hidden="true">✦</span>
              <p>
                Agent ne postavlja medicinske dijagnoze i nikada ne potvrđuje termin
                bez vaše jasne završne radnje.
              </p>
            </div>
          </div>
          <ConciergeGuide />
        </section>

        <section className="concierge-capabilities" aria-labelledby="concierge-capabilities-title">
          <div>
            <p className="lux-eyebrow gold-text">Čovjek odlučuje · agent pomaže</p>
            <h2 id="concierge-capabilities-title">Od pitanja do provjerenog termina.</h2>
          </div>
          <div className="concierge-capability-grid">
            {capabilities.map(([number, title, copy]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="booking-route-footer concierge-footer">
        <Link href="/">← Povratak na početnu</Link>
        <FooterMeta />
        <a href="tel:+385955565738">095 556 5738</a>
      </footer>
    </div>
  );
}
