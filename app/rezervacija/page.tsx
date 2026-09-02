import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import BookingExperience from "../booking-experience";
import SiteHeader from "../site-header";
import { availableTimes } from "../../lib/availability";
import { consumeRateLimit } from "../../lib/rate-limit";
import { loadOpeningHours, loadServices, type SalonService } from "../../lib/salon-settings";
import { publicAssetUrl, SALON_NAME, SOCIAL_IMAGE_ALT } from "../../lib/site";
import { turnstileSetup } from "../../lib/turnstile";
import {
  bookingWindowEndDate,
  isDateWithinBookingWindow,
  isIsoDate,
  isTime,
  salonDateString,
} from "../../lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rezervacija termina u Solinu",
  description:
    "Odaberite uslugu, Marinelu ili Miju, datum i raspoloživo vrijeme za svoj termin u Marinela Hair Design salonu u Solinu.",
  alternates: { canonical: "/rezervacija" },
  openGraph: {
    title: "Rezervacija termina | Marinela Hair Design",
    description: "Odaberite uslugu, stručnjaka, datum i raspoloživo vrijeme u našem salonu u Solinu.",
    url: "/rezervacija",
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
    title: "Rezervacija termina | Marinela Hair Design",
    description: "Odaberite uslugu, stručnjaka, datum i raspoloživo vrijeme u našem salonu u Solinu.",
    images: [publicAssetUrl("/og.png")],
  },
};

type BookingPageProps = {
  searchParams: Promise<{
    usluga?: string | string[];
    djelatnik?: string | string[];
    datum?: string | string[];
    vrijeme?: string | string[];
    izvor?: string | string[];
  }>;
};

function firstParameter(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookingPage({ searchParams }: BookingPageProps) {
  const params = await searchParams;
  const requestedService = firstParameter(params.usluga);
  const requestedStaff = firstParameter(params.djelatnik);
  const requestedDate = firstParameter(params.datum);
  const requestedTime = firstParameter(params.vrijeme);
  const requestedSource = firstParameter(params.izvor);
  const [services, openingHours] = await Promise.all([loadServices(), loadOpeningHours()]);
  const turnstile = turnstileSetup();
  const now = new Date();
  const bookingWindowStart = salonDateString(now);
  const bookingWindowEnd = bookingWindowEndDate(now);
  const hasOpenDay = openingHours.some((entry) => !entry.closed);
  const requestedServiceRecord = services.find((service) => service.id === requestedService);
  const initialServiceId = requestedServiceRecord?.id ?? services[0]?.id;
  const initialService = services.find((service) => service.id === initialServiceId);
  let verifiedService: SalonService | null = null;
  if (
    requestedSource === "webmcp" &&
    requestedService &&
    requestedService.length <= 80
  ) {
    const requestHeaders = await headers();
    const preparationAllowed = await consumeRateLimit({
      scope: "webmcp_prepare_ip",
      identifier: requestHeaders.get("cf-connecting-ip"),
      limit: 30,
      windowSeconds: 10 * 60,
      failureMode: "deny",
    });
    if (preparationAllowed) {
      const verifiedServices = await loadServices({ strict: true }).catch(() => null);
      verifiedService = verifiedServices?.find((service) => service.id === requestedService) ?? null;
    }
  }
  let preparedBooking: null | {
    staffId: "marinela" | "mia";
    date: string;
    time: string;
  } = null;

  if (
    requestedSource === "webmcp" &&
    requestedServiceRecord &&
    initialService &&
    verifiedService &&
    requestedDate &&
    requestedTime &&
    isIsoDate(requestedDate) &&
    isTime(requestedTime) &&
    isDateWithinBookingWindow(requestedDate, now) &&
    ["marinela", "mia", "first"].includes(requestedStaff ?? "")
  ) {
    const staffChoice = requestedStaff as "marinela" | "mia" | "first";
    if (staffChoice === "first" || verifiedService.staffIds.includes(staffChoice)) {
      const availability = await availableTimes(verifiedService, staffChoice, requestedDate).catch(() => null);
      const resolvedStaff = availability?.employeeByTime[requestedTime] ??
        (staffChoice === "first" ? undefined : staffChoice);
      if (
        availability?.checked !== false &&
        availability?.times.includes(requestedTime) &&
        resolvedStaff &&
        verifiedService.staffIds.includes(resolvedStaff)
      ) {
        preparedBooking = {
          staffId: resolvedStaff,
          date: requestedDate,
          time: requestedTime,
        };
      }
    }
  }

  return (
    <div className="lux-site booking-route">
      <SiteHeader bookingActive />

      <main id="main-content" tabIndex={-1}>
      <section className="booking-route-intro" aria-labelledby="booking-page-title">
        <div className="section-index">01 / REZERVACIJA</div>
        <div>
          <p className="lux-eyebrow">Online rezervacije</p>
          <h1 id="booking-page-title">Odaberite svoj termin.</h1>
        </div>
        <div className="booking-route-note">
          <p>
            Odaberite uslugu, stručnjaka, datum i vrijeme. Nakon završne provjere
            raspoloživosti termin je odmah potvrđen.
          </p>
          <div>
            <span>Marinela Grančić</span>
            <span>Mia Jakelić</span>
          </div>
        </div>
      </section>

      <section className="booking-route-stage" aria-labelledby="booking-flow-title">
        <h2 id="booking-flow-title" className="visually-hidden">
          Odabir usluge, stručnjaka, datuma i vremena
        </h2>
        {!turnstile.configured || turnstile.partial ? (
          <div className="booking-unavailable" role="status">
            <img
              className="booking-unavailable-logo"
              src="/brand/marinela-signature-on-light.svg"
              alt="Marinela Hair Design"
              width="564"
              height="340"
            />
            <p className="booking-overline">Rezervacija termina</p>
            <h2>Dogovorimo vaš termin.</h2>
            <p>
              Online rezervacije trenutačno nisu dostupne. Za najbržu potvrdu
              termina nazovite salon — rado ćemo vam pomoći s odabirom usluge i vremena.
            </p>
            <a className="gold-button" href="tel:+385955565738">
              Nazovite 095 556 5738
            </a>
            <small>Ponedjeljak – petak · prema aktualnom rasporedu salona</small>
          </div>
        ) : !services.length || !hasOpenDay ? (
          <div className="booking-unavailable" role="status">
            <p className="booking-overline">Online rezervacije</p>
            <h2>Trenutačno nema otvorenih termina.</h2>
            <p>Za dogovor termina nazovite salon. Raspored ćemo ponovno otvoriti čim budu dostupni novi termini.</p>
            <a className="gold-button" href="tel:+385955565738">Nazovite 095 556 5738</a>
          </div>
        ) : (
          <BookingExperience
            key={`${initialServiceId}-${preparedBooking?.date ?? "manual"}-${preparedBooking?.time ?? ""}`}
            initialServiceId={initialServiceId}
            initialStaffId={preparedBooking?.staffId}
            initialDate={preparedBooking?.date}
            initialTime={preparedBooking?.time}
            agentPrepared={Boolean(preparedBooking)}
            services={services}
            openingHours={openingHours}
            bookingWindowStart={bookingWindowStart}
            bookingWindowEnd={bookingWindowEnd}
            turnstileSiteKey={turnstile.siteKey ?? undefined}
          />
        )}
      </section>

      </main>

      <footer className="booking-route-footer">
        <Link href="/">← Povratak na početnu</Link>
        <nav aria-label="Podnožje">
          <Link href="/prijava">Prijava za tim</Link>
          <Link href="/privatnost">Privatnost</Link>
          <Link href="/uvjeti-koristenja">Uvjeti korištenja</Link>
        </nav>
        <a href="tel:+385955565738">095 556 5738</a>
      </footer>
    </div>
  );
}
