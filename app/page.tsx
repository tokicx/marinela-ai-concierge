import type { Metadata } from "next";
import Link from "next/link";
import FooterMeta from "./footer-meta";
import SiteHeader from "./site-header";
import { bookingHref, team } from "./salon-data";
import { displayOpeningHours, loadOpeningHours, loadServices } from "../lib/salon-settings";
import {
  canonicalUrl,
  publicAssetUrl,
  SALON_ADDRESS,
  SALON_EMAIL,
  SALON_NAME,
  SALON_PHONE,
  SOCIAL_IMAGE_ALT,
} from "../lib/site";

export const dynamic = "force-dynamic";

const homeDescription =
  "Premium frizerski salon u Solinu za balayage, ekstenzije, bojanje i svečane frizure. Upoznajte rad Marinele i Mije i rezervirajte termin online.";

export const metadata: Metadata = {
  title: "Balayage i ekstenzije u Solinu",
  description: homeDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Marinela Hair Design | Frizerski salon Solin",
    description: homeDescription,
    url: "/",
    siteName: SALON_NAME,
    locale: "hr_HR",
    type: "website",
    images: [
      {
        url: publicAssetUrl("/og.png"),
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Marinela Hair Design | Frizerski salon Solin",
    description: homeDescription,
    images: [publicAssetUrl("/og.png")],
  },
};

const signatureStories = [
  {
    number: "01",
    label: "Extensions atelier",
    title: "Dužina koja izgleda kao da je oduvijek vaša.",
    copy: "Nijansa, gustoća i metoda biraju se individualno. Cilj nije samo više kose — već besprijekoran spoj koji se kreće, sjaji i ponaša prirodno.",
    image: "/images/service-extensions.webp",
    fallback: "/images/service-extensions.png",
    alt: "Prirodno uklopljene ekstenzije za dugu kosu",
    position: "right",
    serviceId: "ugradnja-ekstenzija",
  },
  {
    number: "02",
    label: "Dimensional colour",
    title: "Boja s dubinom, svjetlom i karakterom.",
    copy: "Balayage i pramenovi oblikuju se prema tenu, teksturi i načinu na koji nosite kosu. Bez oštrih prijelaza. Bez generičke formule.",
    image: "/images/balayage-result.jpg",
    fallback: "/images/balayage-result.jpg",
    alt: "Dimenzionalni plavi balayage s prirodnim prijelazom",
    position: "left",
    serviceId: "balayage-color",
  },
  {
    number: "03",
    label: "Bridal & occasion",
    title: "Elegancija koja traje od prvog pogleda do zadnjeg plesa.",
    copy: "Frizura za vjenčanje ili posebnu prigodu mora biti sigurna, fotogenična i potpuno vaša. Svaki detalj oblikujemo s razlogom.",
    image: "/images/service-bridal.webp",
    fallback: "/images/service-bridal.png",
    alt: "Elegantna svečana frizura za vjenčanje",
    position: "right",
    serviceId: "wedding-hair",
  },
] as const;

const featureLinks = [
  { icon: "sparkle", title: "AI savjetnik", subtitle: "Savjet i slobodan termin", href: "/concierge" },
  { icon: "calendar", title: "Rezerviraj termin", subtitle: "Brzo i jednostavno", href: "/rezervacija" },
  { icon: "hair", title: "Ekstenzije", subtitle: "Vaša kosa, vaš potpis", href: bookingHref("ugradnja-ekstenzija"), serviceId: "ugradnja-ekstenzija" },
  { icon: "rental", title: "Hair rental", subtitle: "Posudi svoj look", href: bookingHref("najam-kose"), serviceId: "najam-kose" },
  { icon: "diamond", title: "Balayage", subtitle: "Boja po mjeri", href: bookingHref("balayage-color"), serviceId: "balayage-color" },
  { icon: "drop", title: "Marinela Ritual", subtitle: "Njega i obnova", href: bookingHref("marinela-ritual"), serviceId: "marinela-ritual" },
] as const;

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

function FeatureIcon({ name }: { name: (typeof featureLinks)[number]["icon"] }) {
  if (name === "sparkle") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 5c1.7 9.1 6.9 14.3 16 16-9.1 1.7-14.3 6.9-16 16-1.7-9.1-6.9-14.3-16-16 9.1-1.7 14.3-6.9 16-16Z" />
        <path d="M38 7c.6 3 2.3 4.7 5 5.3-2.7.6-4.4 2.3-5 5.2-.6-2.9-2.3-4.6-5-5.2 2.7-.6 4.4-2.3 5-5.3Z" />
      </svg>
    );
  }
  if (name === "calendar") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="7" y="10" width="34" height="31" rx="2" />
        <path d="M15 5v10M33 5v10M7 20h34M15 27h4M24 27h4M33 27h1M15 34h4M24 34h4" />
      </svg>
    );
  }
  if (name === "profile") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="5" y="8" width="38" height="32" rx="3" />
        <circle cx="17" cy="20" r="5" />
        <path d="M9 34c1.5-5 4-7 8-7s6.5 2 8 7M29 17h9M29 23h9M29 29h7" />
      </svg>
    );
  }
  if (name === "hair") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 42C10 35 10 18 17 8c-1 12 4 17 7 20 3-3 8-8 7-20 7 10 7 27-7 34Z" />
        <path d="M17 8c6 3 8 10 7 20M31 8c-6 3-8 10-7 20" />
      </svg>
    );
  }
  if (name === "rental") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M7 16h34l-2 25H9L7 16ZM17 16c0-6 2-10 7-10s7 4 7 10" />
        <path d="M17 22v3M31 22v3" />
      </svg>
    );
  }
  if (name === "diamond") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 17 13 7h22l9 10-20 25L4 17Z" />
        <path d="m13 7 5 10 6-10 6 10 5-10M4 17h40M18 17l6 25 6-25" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M18 12V7h12v5l4 5v23H14V17l4-5Z" />
      <path d="M19 25h10M22 7V3h4v4M21 30c0 4 6 4 6 0" />
    </svg>
  );
}

export default async function Home() {
  const [services, hours] = await Promise.all([loadServices(), loadOpeningHours()]);
  const openingHours = displayOpeningHours(hours);
  const activeServiceIds = new Set(services.map((service) => service.id));
  const schemaDays = [
    "https://schema.org/Sunday",
    "https://schema.org/Monday",
    "https://schema.org/Tuesday",
    "https://schema.org/Wednesday",
    "https://schema.org/Thursday",
    "https://schema.org/Friday",
    "https://schema.org/Saturday",
  ];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${canonicalUrl("/")}#website`,
        url: canonicalUrl("/"),
        name: SALON_NAME,
        inLanguage: "hr-HR",
        publisher: { "@id": `${canonicalUrl("/")}#salon` },
      },
      {
        "@type": "HairSalon",
        "@id": `${canonicalUrl("/")}#salon`,
        name: SALON_NAME,
        url: canonicalUrl("/"),
        description: homeDescription,
        image: publicAssetUrl("/images/hero-desktop.webp"),
        logo: publicAssetUrl("/brand/marinela-signature-on-light.svg"),
        telephone: SALON_PHONE,
        email: SALON_EMAIL,
        priceRange: "€€",
        currenciesAccepted: "EUR",
        paymentAccepted: "Cash",
        areaServed: { "@type": "City", name: "Solin" },
        hasMap: "https://www.google.com/maps/search/?api=1&query=43.5357714,16.4888454",
        address: { "@type": "PostalAddress", ...SALON_ADDRESS },
        geo: {
          "@type": "GeoCoordinates",
          latitude: 43.5357714,
          longitude: 16.4888454,
        },
        openingHoursSpecification: hours
          .filter((entry) => !entry.closed)
          .map((entry) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: schemaDays[entry.dayOfWeek],
            opens: entry.openTime,
            closes: entry.closeTime,
          })),
        employee: team.map((member) => ({
          "@type": "Person",
          name: member.name,
          jobTitle: member.role,
        })),
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Usluge salona",
          itemListElement: services.map((service) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: service.name,
              description: service.description,
            },
            url: canonicalUrl(`/rezervacija?usluga=${encodeURIComponent(service.id)}`),
          })),
        },
        potentialAction: {
          "@type": "ReserveAction",
          target: canonicalUrl("/rezervacija"),
        },
        sameAs: [
          "https://www.instagram.com/marinelahairdesign/",
          "https://www.facebook.com/marinela.grancic/",
        ],
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
      <div className="lux-site">
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>

      <section className="lux-hero" id="top">
        <picture>
          <source media="(max-width: 700px)" srcSet="/images/hero-mobile.webp" type="image/webp" />
          <img
            className="lux-hero-image"
            src="/images/hero-desktop.webp"
            alt="Duga valovita kosa s toplim balayage pramenovima"
            width="1584"
            height="990"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="lux-hero-overlay" />
        <div className="lux-hero-grid" />
        <div className="lux-hero-copy">
          <p className="lux-eyebrow">Ekstenzije · Balayage · Bridal — Solin</p>
          <h1>
            Vaša kosa.
            <em>Vaš potpis.</em>
          </h1>
          <p>
            Personalizirano. Precizno. Ekskluzivno. Hair design koji ne mijenja samo
            izgled — već način na koji se osjećate.
          </p>
          <div className="lux-hero-actions">
            <a className="champagne-button" href="/rezervacija">
              Rezerviraj termin
              <ArrowIcon />
            </a>
            <div className="hero-secondary-links">
              <a className="ghost-link" href="#rezultati">Pogledaj rezultate</a>
              <Link className="ghost-link" href="/cjenik">Pogledaj cjenik</Link>
            </div>
          </div>
        </div>
        <div className="hero-signature">
          <img
            src="/brand/marinela-crest-on-dark.svg"
            alt=""
            width="224"
            height="212"
          />
          <p>Hair artistry<br />by Marinela</p>
        </div>
        <a
          className="hero-instagram"
          href="https://www.instagram.com/marinelahairdesign/"
          target="_blank"
          rel="noreferrer"
        >
          <InstagramIcon />
          @marinelahairdesign
        </a>
      </section>

      <section className="feature-rail" aria-label="Izdvojene usluge">
        {featureLinks.filter((feature) => !("serviceId" in feature) || activeServiceIds.has(feature.serviceId)).map((feature) => (
          <Link href={feature.href} key={feature.title}>
            <FeatureIcon name={feature.icon} />
            <strong>{feature.title}</strong>
            <span>{feature.subtitle}</span>
          </Link>
        ))}
      </section>

      <section className="atelier-intro" id="atelier">
        <div className="section-index">01 / ATELIER</div>
        <div>
          <p className="lux-eyebrow gold-text">Marinela Hair Design</p>
          <h2>Više od frizure.<br />Osobni potpis u kosi.</h2>
        </div>
        <p className="intro-copy">
          Marinela Hair Design je premium frizerski salon u Solinu specijaliziran za
          ekstenzije, balayage, bojanje i svečane frizure. Svaki termin započinje
          pažljivom procjenom i jasnim planom.
        </p>
      </section>

      <section className="signature-stories">
        {signatureStories.filter((story) => activeServiceIds.has(story.serviceId)).map((story) => (
          <article className={`signature-story ${story.position}`} key={story.number}>
            <div className="story-image">
              <picture>
                <source
                  srcSet={story.image}
                  type={story.image.endsWith(".webp") ? "image/webp" : "image/jpeg"}
                />
                <img
                  src={story.fallback}
                  alt={story.alt}
                  width="1120"
                  height="1400"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <span>{story.number}</span>
            </div>
            <div className="story-copy">
              <p className="lux-eyebrow gold-text">{story.label}</p>
              <h3>{story.title}</h3>
              <p>{story.copy}</p>
              <Link href={bookingHref(story.serviceId)}>
                Rezerviraj uslugu
                <ArrowIcon />
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="service-menu" id="usluge">
        <div className="service-menu-heading">
          <div>
            <p className="lux-eyebrow gold-text">{services.length} stručnih usluga</p>
            <h2>Od konzultacije<br />do transformacije.</h2>
          </div>
          <p>
            Cijena se definira prema dužini, gustoći i željenom rezultatu. Za velike
            promjene preporučujemo kratku konzultaciju prije termina.
          </p>
        </div>
        <div className="service-list">
          {services.map((service, index) => (
            <Link href={bookingHref(service.id)} className="service-row" key={service.id}>
              <span className="service-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>{service.category}</small>
                <strong>{service.name}</strong>
              </div>
              <span>{service.durationLabel}</span>
              <span>{service.price}</span>
              <span>{service.staffIds.length > 1 ? "Marinela / Mia" : service.staffIds[0] === "mia" ? "Mia" : "Marinela"}</span>
              <ArrowIcon />
            </Link>
          ))}
        </div>
      </section>

      <section className="results-section" id="rezultati">
        <div className="section-index">02 / REZULTATI</div>
        <div className="results-heading">
          <p className="lux-eyebrow gold-text">Stvarni radovi salona</p>
          <h2>Rezultat koji govori prije vas.</h2>
          <p>
            Autentični detalji ekstenzija, boje i tehnike — bez filtera koji skrivaju
            kvalitetu rada.
          </p>
        </div>
        <div className="results-grid">
          <figure className="result-large">
            <img src="/images/extensions-before-after.jpeg" alt="Ekstenzije prije i poslije" width="1024" height="1024" loading="lazy" decoding="async" />
            <figcaption><span>Extensions</span><strong>Prije / poslije</strong></figcaption>
          </figure>
          <div className="result-detail-pair">
            <figure className="result-balayage">
              <img src="/images/balayage-result.jpg" alt="Plavi balayage rezultat" width="788" height="984" loading="lazy" decoding="async" />
              <figcaption><span>Colour</span><strong>Dimensional balayage</strong></figcaption>
            </figure>
            <figure className="result-detail">
              <img src="/images/micro-bond-detail.jpeg" alt="Detalj precizne micro-bond ugradnje ekstenzija" width="750" height="1000" loading="lazy" decoding="async" />
              <figcaption><span>Craft</span><strong>Micro-bond preciznost</strong></figcaption>
            </figure>
          </div>
          <figure className="result-wide">
            <img src="/images/bridal-looks.webp" alt="Dvije elegantne svečane frizure" width="950" height="655" loading="lazy" decoding="async" />
            <figcaption><span>Occasion</span><strong>Bridal styling</strong></figcaption>
          </figure>
        </div>
        <a
          className="instagram-cta"
          href="https://www.instagram.com/marinelahairdesign/"
          target="_blank"
          rel="noreferrer"
        >
          <InstagramIcon />
          Pogledajte još radova na Instagramu
          <ArrowIcon />
        </a>
      </section>

      <section className="team-story" id="o-nama">
        <div className="team-visual">
          <img
            src="/images/salon-story-premium.webp"
            alt="Duga sjajna smeđa kosa oblikovana u meke valove"
            width="1120"
            height="1400"
            loading="lazy"
            decoding="async"
          />
          <div className="team-monogram" aria-hidden="true">
            <img
              src="/brand/marinela-crest-on-dark.svg"
              alt=""
              width="224"
              height="212"
            />
          </div>
        </div>
        <div className="team-content">
          <p className="lux-eyebrow gold-text">O salonu</p>
          <h2>Kontinuirana edukacija. Mirna ruka. Beskompromisan rezultat.</h2>
          <p>
            Marinela Hair Design godinama gradi povjerenje kroz ozbiljnu, pažljivu i
            profesionalnu uslugu. Posebno smo prepoznati po ekstenzijama i balayage
            tehnici, uz atmosferu u kojoj je cijeli termin posvećen vama.
          </p>
          <div className="team-cards">
            {team.map((member) => (
              <article key={member.id}>
                <span>{member.initials}</span>
                <div>
                  <h3>{member.name}</h3>
                  <small>{member.role}</small>
                  <p>{member.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-section" id="kontakt">
        <div className="contact-image">
          <img src="/images/salon-exterior.webp" alt="Ulaz u frizerski salon Marinela Hair Design u Solinu" width="2200" height="1687" loading="lazy" decoding="async" />
          <a
            href="https://www.google.com/maps/search/?api=1&query=43.5357714,16.4888454"
            target="_blank"
            rel="noreferrer"
          >
            Otvori upute
            <ArrowIcon />
          </a>
        </div>
        <div className="contact-content">
          <p className="lux-eyebrow gold-text">Posjetite nas</p>
          <h2>U srcu Solina.<br />Vrijeme rezervirano za vas.</h2>
          <div className="contact-columns">
            <div>
              <h3>Kontakt</h3>
              <a href="tel:+38521276637">021 276 637</a>
              <a href="tel:+385955565738">095 556 5738</a>
              <a href="mailto:marinela.grancic@gmail.com">marinela.grancic@gmail.com</a>
              <p>Ulica kralja Zvonimira 14b<br />21210 Solin, Hrvatska</p>
            </div>
            <div>
              <h3>Radno vrijeme</h3>
              <dl className="hours-list">
                {openingHours.map(([day, hours]) => (
                  <div key={day}><dt>{day}</dt><dd>{hours}</dd></div>
                ))}
              </dl>
            </div>
          </div>
          <div className="contact-actions">
            <a className="champagne-button" href="tel:+385955565738">Nazovite salon</a>
            <a
              className="ghost-link"
              href="https://www.instagram.com/marinelahairdesign/"
              target="_blank"
              rel="noreferrer"
            >
              Instagram
            </a>
          </div>
        </div>
      </section>

      </main>

      <footer className="lux-footer">
        <a className="footer-monogram" href="#top" aria-label="Povratak na vrh">
          <img
            src="/brand/marinela-crest-on-dark.svg"
            alt=""
            width="224"
            height="212"
          />
        </a>
        <div className="footer-socials">
          <a href="https://www.instagram.com/marinelahairdesign/" target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramIcon /></a>
          <a href="https://www.facebook.com/marinela.grancic/" target="_blank" rel="noreferrer" aria-label="Facebook"><FacebookIcon /></a>
        </div>
        <nav>
          <a href="#o-nama">O nama</a>
          <a href="#usluge">Usluge</a>
          <Link href="/cjenik">Cjenik</Link>
          <Link href="/rezervacija">Rezervacije</Link>
          <a href="#kontakt">Kontakt</a>
          <Link href="/prijava">Prijava za tim</Link>
        </nav>
        <FooterMeta />
      </footer>

      <a className="mobile-booking-bar" href="/rezervacija" aria-label="Rezerviraj termin">
        Rezerviraj termin
        <ArrowIcon />
      </a>
      </div>
    </>
  );
}
