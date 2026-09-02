import type { Metadata } from "next";
import Link from "next/link";
import { loadBasePriceList, loadPriceList } from "../../lib/price-list";
import { publicAssetUrl, SALON_NAME, SOCIAL_IMAGE_ALT } from "../../lib/site";
import FooterMeta from "../footer-meta";
import SiteHeader from "../site-header";
import PriceListTabs from "./price-list-tabs";

export const dynamic = "force-dynamic";

const description =
  "Cjenik frizerskih usluga Marinela Hair Design u Solinu — bojanja, šišanja, oblikovanje, pramenovi, dekoloracije i ekstenzije.";

export const metadata: Metadata = {
  title: "Cjenik frizerskih usluga u Solinu",
  description,
  alternates: { canonical: "/cjenik" },
  openGraph: {
    title: "Cjenik usluga | Marinela Hair Design",
    description,
    url: "/cjenik",
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
  twitter: {
    card: "summary_large_image",
    title: "Cjenik usluga | Marinela Hair Design",
    description,
    images: [publicAssetUrl("/og.png")],
  },
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.5" r=".8" className="icon-fill" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 21v-8h3l.5-3H14V8.2c0-.9.3-1.7 1.8-1.7H18V3.8c-.4-.1-1.6-.2-2.8-.2-2.8 0-4.6 1.7-4.6 4.8V10H8v3h2.6v8" />
    </svg>
  );
}

export default async function PriceListPage() {
  const priceListResult = await loadPriceList()
    .then((sections) => ({ sections, fallback: false }))
    .catch(() => ({ sections: loadBasePriceList(), fallback: true }));
  const loadedSections = priceListResult.sections;

  const sections = loadedSections
    .map((section) => ({
      ...section,
      tables: section.tables.filter((table) => table.items.length > 0),
    }))
    .filter((section) => section.tables.length > 0);
  const itemCount = sections.reduce(
    (total, section) => total + section.tables.reduce((sum, table) => sum + table.items.length, 0),
    0,
  );

  return (
    <div className="lux-site price-list-route">
      <SiteHeader priceListActive />

      <main id="main-content" tabIndex={-1}>
      <section className="price-list-hero" id="top">
        <div className="section-index">01 / CJENIK</div>
        <div>
          <p className="lux-eyebrow">Transparentno · detaljno · po mjeri</p>
          <h1>Cjenik<br /><em>usluga.</em></h1>
        </div>
        <div className="price-list-hero-note">
          <span>{itemCount}</span>
          <p>
            Od njege i oblikovanja do potpune transformacije. Odaberite kategoriju
            i pronađite cijenu prema dužini ili gustoći kose.
          </p>
        </div>
      </section>

      {priceListResult.fallback && (
        <p className="price-list-fallback-note" role="status">
          Prikazana je sigurnosna verzija cjenika. Za potvrdu aktualne cijene nazovite salon.
        </p>
      )}

      <PriceListTabs sections={sections} />

      <section className="price-consultation">
        <div>
          <p className="lux-eyebrow">Vaša kosa je jedinstvena</p>
          <h2>Za veliku promjenu,<br />počnimo konzultacijom.</h2>
        </div>
        <div>
          <p>
            Konačna cijena može ovisiti o utrošku materijala, gustoći, trenutačnom
            stanju kose i željenom rezultatu.
          </p>
          <Link className="champagne-button" href="/rezervacija">
            Rezerviraj termin
            <ArrowIcon />
          </Link>
        </div>
      </section>

      </main>

      <footer className="lux-footer price-list-footer">
        <a className="footer-monogram" href="#top" aria-label="Povratak na vrh">
          <img src="/brand/marinela-crest-on-dark.svg" alt="" width="224" height="212" />
        </a>
        <div className="footer-socials">
          <a href="https://www.instagram.com/marinelahairdesign/" target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramIcon /></a>
          <a href="https://www.facebook.com/marinela.grancic/" target="_blank" rel="noreferrer" aria-label="Facebook"><FacebookIcon /></a>
        </div>
        <nav>
          <Link href="/#o-nama">O nama</Link>
          <Link href="/#usluge">Usluge</Link>
          <Link href="/cjenik" aria-current="page">Cjenik</Link>
          <Link href="/rezervacija">Rezervacije</Link>
          <Link href="/#kontakt">Kontakt</Link>
          <Link href="/prijava">Prijava za tim</Link>
        </nav>
        <FooterMeta />
      </footer>

      <a className="mobile-booking-bar" href="/rezervacija" aria-label="Rezerviraj termin">
        Rezerviraj termin
        <ArrowIcon />
      </a>
    </div>
  );
}
