import { team } from "../../../salon-data";
import { loadPriceList } from "../../../../lib/price-list";
import { consumeRateLimit, requestClientIp } from "../../../../lib/rate-limit";
import {
  displayOpeningHours,
  loadOpeningHours,
  loadServices,
} from "../../../../lib/salon-settings";
import {
  SALON_ADDRESS,
  SALON_EMAIL,
  SALON_NAME,
  SALON_PHONE,
} from "../../../../lib/site";

export const dynamic = "force-dynamic";

function publicText(value: string | undefined, maxLength: number) {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function GET(request: Request) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    fetchSite === "cross-site"
  ) {
    return Response.json({ error: "Neispravan izvor zahtjeva." }, { status: 403 });
  }

  const allowed = await consumeRateLimit({
    scope: "concierge_catalog_ip",
    identifier: requestClientIp(request),
    limit: 90,
    windowSeconds: 10 * 60,
    failureMode: "deny",
  });
  if (!allowed) {
    return Response.json(
      { error: "Previše upita. Pokušajte ponovno za nekoliko minuta." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  let catalog;
  try {
    catalog = await Promise.all([
      loadServices({ strict: true }),
      loadOpeningHours({ strict: true }),
      loadPriceList(),
    ]);
  } catch {
    return Response.json(
      { error: "Aktualni podaci salona trenutačno nisu dostupni." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const [services, openingHours, priceList] = catalog;

  const priceItems = priceList.flatMap((section) =>
    section.tables.flatMap((table) =>
      table.items.map((item) => ({
        id: publicText(item.id, 120),
        section: publicText(section.title, 120),
        table: publicText(table.title || section.title, 120),
        name: publicText(item.name, 160),
        note: publicText(item.note, 240) || null,
        prices: table.columns
          .map((label, index) => ({
            label: publicText(label, 80),
            value: publicText(item.cells[index]?.value, 40),
            note: publicText(item.cells[index]?.note, 80) || null,
          }))
          .filter((price) => Boolean(price.value)),
      })),
    ),
  );

  return Response.json(
    {
      salon: {
        name: SALON_NAME,
        address: SALON_ADDRESS,
        phone: SALON_PHONE,
        email: SALON_EMAIL,
        paymentMethod: "Gotovina",
        currency: "EUR",
        locale: "hr-HR",
      },
      staff: team.map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        specialties: publicText(member.bio, 240),
      })),
      openingHours: displayOpeningHours(openingHours).map(([day, hours]) => ({ day, hours })),
      services: services.map((service) => ({
        id: publicText(service.id, 80),
        name: publicText(service.name, 160),
        category: service.category,
        description: publicText(service.description, 320),
        durationMinutes: service.duration,
        durationLabel: service.durationLabel,
        priceLabel: publicText(service.price, 80),
        staffIds: service.staffIds,
      })),
      priceItems,
      rules: {
        bookingConfirmationRequired: true,
        liveAvailabilityRequired: true,
        medicalAdvice: false,
        sensitiveQuestions:
          "Alergije, reakcije, trudnoća i oštećenja vlasišta zahtijevaju izravnu procjenu djelatnice salona.",
      },
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
