"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type ToolExecutionOptions = { signal?: AbortSignal };
type SiteTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    options: ToolExecutionOptions,
  ) => unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: SiteTool,
        options?: { signal?: AbortSignal },
      ) => Promise<void>;
    };
  }
}

type PublicCatalog = {
  salon: {
    name: string;
    address: Record<string, string>;
    phone: string;
    email: string;
    paymentMethod: string;
    currency: string;
    locale: string;
  };
  staff: Array<{
    id: "marinela" | "mia";
    name: string;
    role: string;
    specialties: string;
  }>;
  openingHours: Array<{ day: string; hours: string }>;
  services: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    durationMinutes: number;
    durationLabel: string;
    priceLabel: string;
    staffIds: Array<"marinela" | "mia">;
  }>;
  priceItems: Array<{
    id: string;
    section: string;
    table: string;
    name: string;
    note: string | null;
    prices: Array<{ label: string; value: string; note: string | null }>;
  }>;
  rules: {
    bookingConfirmationRequired: boolean;
    liveAvailabilityRequired: boolean;
    medicalAdvice: boolean;
    sensitiveQuestions: string;
  };
  generatedAt: string;
};

type Availability = {
  times?: string[];
  employeeByTime?: Record<string, "marinela" | "mia">;
  checked?: boolean;
};

const publicToolPaths = new Set(["/", "/cjenik", "/rezervacija", "/concierge"]);
const categories = ["all", "Ekstenzije", "Boja", "Styling", "Njega"] as const;
const priceSections = [
  "all",
  "Bojanja",
  "Šišanja",
  "Oblikovanje kose",
  "Pramenovi i dekoloracije",
  "Ugradnja ekstenzija",
] as const;
const staffIds = ["marinela", "mia", "first"] as const;

function textInput(input: Record<string, unknown>, key: string, maxLength: number) {
  const value = input[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function hasSafeShape(input: unknown, allowedKeys: readonly string[]): input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const prototype = Object.getPrototypeOf(input);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.keys(input).every((key) => allowedKeys.includes(key))
  );
}

function validOptionalText(input: Record<string, unknown>, key: string, maxLength: number) {
  const value = input[key];
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

function validRequiredText(input: Record<string, unknown>, key: string, maxLength: number) {
  const value = input[key];
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function integerInput(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = input[key];
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("hr");
}

function matchesQuery(value: string, query: string) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(value);
  return tokens.every((token) => haystack.includes(token));
}

function takeWithinCharacterBudget<T>(items: T[], maxCharacters: number) {
  const selected: T[] = [];
  for (const item of items) {
    if (JSON.stringify([...selected, item]).length > maxCharacters) break;
    selected.push(item);
  }
  return selected;
}

async function readCatalog(signal?: AbortSignal): Promise<PublicCatalog> {
  const response = await fetch("/api/concierge/catalog", {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("catalog_unavailable");
  return response.json() as Promise<PublicCatalog>;
}

function unavailable(message: string) {
  return {
    status: "verification_failed",
    bookingCreated: false,
    message,
  };
}

export default function WebMcpSiteTools() {
  const pathname = usePathname();

  useEffect(() => {
    if (!publicToolPaths.has(pathname) || !document.modelContext?.registerTool) return;

    const registration = new AbortController();
    let cachedCatalog: { value: PublicCatalog; expiresAt: number } | null = null;

    async function currentCatalog(signal?: AbortSignal) {
      if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) return cachedCatalog.value;
      const value = await readCatalog(signal);
      if (!registration.signal.aborted) {
        cachedCatalog = { value, expiresAt: Date.now() + 30_000 };
      }
      return value;
    }

    async function register() {
      await document.modelContext!.registerTool({
        name: "get_salon_information",
        title: "Get Marinela Hair Design information",
        description:
          "Returns current public salon information, staff, opening hours, payment method and the boundary for sensitive hair or scalp advice. This tool never returns customer or administrator data.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input, options) => {
          if (!publicToolPaths.has(window.location.pathname)) {
            return unavailable("Salon tools are not available on this page.");
          }
          if (!hasSafeShape(input, []) || Object.keys(input).length > 0) {
            return unavailable("This tool does not accept input fields.");
          }
          try {
            const catalog = await currentCatalog(options.signal);
            return {
              status: "ok",
              salon: catalog.salon,
              staff: catalog.staff.map((member) => ({
                ...member,
                specialties: member.specialties.slice(0, 100),
              })),
              openingHours: catalog.openingHours,
              adviceBoundary: catalog.rules,
              timeZone: "Europe/Zagreb",
            };
          } catch {
            return unavailable("Public salon information cannot be verified right now.");
          }
        },
      }, { signal: registration.signal });

      await document.modelContext!.registerTool({
        name: "find_bookable_services",
        title: "Find bookable salon services",
        description:
          "Searches the salon's current active and bookable service catalog. Use these IDs for availability and booking preparation. Do not invent or infer a service that is absent from the result.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              maxLength: 80,
              description: "Optional natural-language search such as balayage, extensions or consultation.",
            },
            category: {
              type: "string",
              enum: categories,
              description: "Optional exact service category filter.",
            },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input, options) => {
          if (!publicToolPaths.has(window.location.pathname)) {
            return unavailable("Salon tools are not available on this page.");
          }
          if (
            !hasSafeShape(input, ["query", "category"]) ||
            !validOptionalText(input, "query", 80) ||
            !validOptionalText(input, "category", 30)
          ) {
            return unavailable("The service search input is invalid.");
          }
          const query = textInput(input, "query", 80);
          const requestedCategory = textInput(input, "category", 30);
          if (
            requestedCategory &&
            !categories.includes(requestedCategory as (typeof categories)[number])
          ) {
            return unavailable("The service category is invalid.");
          }
          const category = requestedCategory || "all";
          try {
            const catalog = await currentCatalog(options.signal);
            const matches = catalog.services.filter((service) => {
              const categoryMatches = category === "all" || service.category === category;
              const queryMatches = !query || matchesQuery(
                [service.name, service.category, service.description, service.priceLabel].join(" "),
                query,
              );
              return categoryMatches && queryMatches;
            });
            const compactMatches = matches.map((service) => ({
              id: service.id,
              name: service.name,
              category: service.category,
              description: service.description.slice(0, 140),
              durationMinutes: service.durationMinutes,
              durationLabel: service.durationLabel,
              priceLabel: service.priceLabel,
              staffIds: service.staffIds,
            }));
            const services = takeWithinCharacterBudget(compactMatches, 1_050);
            return {
              status: "ok",
              source: "live_salon_catalog",
              totalMatches: matches.length,
              returnedCount: services.length,
              truncated: services.length < matches.length,
              services,
              note: "Refine the query if results are truncated. Detailed price rows are available through search_price_list.",
            };
          } catch {
            return unavailable("The live service catalog cannot be verified right now.");
          }
        },
      }, { signal: registration.signal });

      await document.modelContext!.registerTool({
        name: "search_price_list",
        title: "Search the live salon price list",
        description:
          "Searches current public dashboard-managed price-list rows. Results are exact informational price rows and are not automatically equivalent to bookable service IDs.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              maxLength: 80,
              description: "Optional service or treatment name.",
            },
            section: {
              type: "string",
              enum: priceSections,
              description: "Optional exact public price-list section.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 6,
              description: "Maximum number of matching rows to return.",
            },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input, options) => {
          if (!publicToolPaths.has(window.location.pathname)) {
            return unavailable("Salon tools are not available on this page.");
          }
          if (
            !hasSafeShape(input, ["query", "section", "limit"]) ||
            !validOptionalText(input, "query", 80) ||
            !validOptionalText(input, "section", 80) ||
            (input.limit !== undefined &&
              (typeof input.limit !== "number" ||
                !Number.isInteger(input.limit) ||
                input.limit < 1 ||
                input.limit > 6))
          ) {
            return unavailable("The price-list search input is invalid.");
          }
          const query = textInput(input, "query", 80);
          const section = textInput(input, "section", 80) || "all";
          if (!priceSections.includes(section as (typeof priceSections)[number])) {
            return unavailable("The price-list section is invalid.");
          }
          const limit = integerInput(input, "limit", 5, 1, 6);
          try {
            const catalog = await currentCatalog(options.signal);
            const allMatches = catalog.priceItems
              .filter((item) => {
                const sectionMatches = section === "all" || item.section === section;
                const queryMatches = !query || matchesQuery(
                  [item.section, item.table, item.name, item.note ?? ""].join(" "),
                  query,
                );
                return sectionMatches && queryMatches;
              });
            const limitedMatches = allMatches.slice(0, limit).map((item) => ({
              section: item.section,
              table: item.table,
              name: item.name,
              note: item.note?.slice(0, 120) ?? null,
              prices: item.prices.map((price) => ({
                label: price.label.slice(0, 40),
                value: price.value,
                note: price.note?.slice(0, 40) ?? null,
              })),
            }));
            const matches = takeWithinCharacterBudget(limitedMatches, 1_050);
            return {
              status: "ok",
              source: "live_public_price_list",
              paymentMethod: catalog.salon.paymentMethod,
              currency: catalog.salon.currency,
              totalMatches: allMatches.length,
              returnedCount: matches.length,
              truncated: matches.length < allMatches.length,
              items: matches,
              note:
                "Use find_bookable_services before checking availability. A price-list row is not automatically a bookable service.",
            };
          } catch {
            return unavailable("The live price list cannot be verified right now.");
          }
        },
      }, { signal: registration.signal });

      await document.modelContext!.registerTool({
        name: "check_appointment_availability",
        title: "Check live appointment availability",
        description:
          "Checks current salon availability for one bookable service, one staff choice and up to seven ISO dates. A verification failure is never reported as a fully booked day.",
        inputSchema: {
          type: "object",
          properties: {
            serviceId: {
              type: "string",
              pattern: "^[a-z0-9-]{1,80}$",
              description: "Exact service ID returned by find_bookable_services.",
            },
            staffId: {
              type: "string",
              enum: staffIds,
              description: "marinela, mia, or first for the first available qualified stylist.",
            },
            dates: {
              type: "array",
              minItems: 1,
              maxItems: 7,
              uniqueItems: true,
              items: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              description: "One to seven dates in YYYY-MM-DD format within the booking window.",
            },
          },
          required: ["serviceId", "staffId", "dates"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (input, options) => {
          if (!publicToolPaths.has(window.location.pathname)) {
            return unavailable("Salon tools are not available on this page.");
          }
          if (
            !hasSafeShape(input, ["serviceId", "staffId", "dates"]) ||
            !validRequiredText(input, "serviceId", 80) ||
            !validRequiredText(input, "staffId", 20)
          ) {
            return unavailable("The service, staff choice or dates are invalid.");
          }
          const serviceId = textInput(input, "serviceId", 80);
          const staffId = textInput(input, "staffId", 20);
          const rawDates = input.dates;
          if (!Array.isArray(rawDates) || rawDates.length < 1 || rawDates.length > 7) {
            return unavailable("The service, staff choice or dates are invalid.");
          }
          const dates = Array.from(new Set(rawDates))
            .filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
            .slice(0, 7);
          if (
            !/^[a-z0-9-]{1,80}$/.test(serviceId) ||
            !staffIds.includes(staffId as (typeof staffIds)[number]) ||
            !dates.length ||
            dates.length !== rawDates.length
          ) {
            return unavailable("The service, staff choice or dates are invalid.");
          }
          const params = new URLSearchParams({
            serviceId,
            staffId,
            dates: dates.join(","),
          });
          try {
            const response = await fetch(`/api/availability?${params.toString()}`, {
              cache: "no-store",
              headers: { Accept: "application/json" },
              signal: options.signal,
            });
            if (!response.ok) {
              return unavailable("Availability cannot be verified right now. No appointment was created.");
            }
            const payload = await response.json() as { dates?: Record<string, Availability> };
            const availability = dates.map((date) => {
              const result = payload.dates?.[date];
              if (!result || result.checked === false) {
                return { date, status: "verification_failed", slots: [] };
              }
              const allSlots = (result.times ?? []).map((time) => ({
                time,
                staffId: result.employeeByTime?.[time] ?? (staffId === "first" ? null : staffId),
              }));
              const slots = allSlots.slice(0, 3);
              return {
                date,
                status: allSlots.length ? "available" : "full",
                slots,
                additionalSlotCount: Math.max(0, allSlots.length - slots.length),
              };
            });
            return {
              status: "ok",
              serviceId,
              requestedStaffId: staffId,
              bookingCreated: false,
              availability,
            };
          } catch {
            return unavailable("Availability cannot be verified right now. No appointment was created.");
          }
        },
      }, { signal: registration.signal });

      await document.modelContext!.registerTool({
        name: "prepare_booking_for_confirmation",
        title: "Prepare booking — does not confirm an appointment",
        description:
          "Rechecks a selected live slot and opens the visible booking form with the non-personal choices filled in. It never creates, reserves or confirms an appointment. The user must personally enter contact details, acknowledge the privacy notice, complete the security check and click Potvrdi rezervaciju.",
        inputSchema: {
          type: "object",
          properties: {
            serviceId: {
              type: "string",
              pattern: "^[a-z0-9-]{1,80}$",
              description: "Exact service ID returned by find_bookable_services.",
            },
            staffId: {
              type: "string",
              enum: staffIds,
              description: "Exact stylist ID, or first for the first available qualified stylist.",
            },
            date: {
              type: "string",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              description: "Selected date in YYYY-MM-DD format.",
            },
            time: {
              type: "string",
              pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
              description: "Selected local salon time in HH:mm format.",
            },
          },
          required: ["serviceId", "staffId", "date", "time"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input, options) => {
          if (!publicToolPaths.has(window.location.pathname)) {
            return unavailable("Salon tools are not available on this page.");
          }
          if (
            !hasSafeShape(input, ["serviceId", "staffId", "date", "time"]) ||
            !validRequiredText(input, "serviceId", 80) ||
            !validRequiredText(input, "staffId", 20) ||
            !validRequiredText(input, "date", 10) ||
            !validRequiredText(input, "time", 5)
          ) {
            return unavailable("The service, staff choice, date or time is invalid.");
          }
          const serviceId = textInput(input, "serviceId", 80);
          const staffId = textInput(input, "staffId", 20);
          const date = textInput(input, "date", 10);
          const time = textInput(input, "time", 5);
          if (
            !/^[a-z0-9-]{1,80}$/.test(serviceId) ||
            !staffIds.includes(staffId as (typeof staffIds)[number]) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
          ) {
            return unavailable("The service, staff choice, date or time is invalid.");
          }
          const params = new URLSearchParams({ serviceId, staffId, date });
          try {
            const response = await fetch(`/api/availability?${params.toString()}`, {
              cache: "no-store",
              headers: { Accept: "application/json" },
              signal: options.signal,
            });
            if (!response.ok) {
              return unavailable("The selected slot cannot be verified. No appointment was created.");
            }
            const availability = await response.json() as Availability;
            if (availability.checked === false || !(availability.times ?? []).includes(time)) {
              return {
                status: "slot_unavailable",
                bookingCreated: false,
                message: "The selected slot is no longer available or could not be verified.",
              };
            }
            const resolvedStaffId = availability.employeeByTime?.[time] ?? staffId;
            if (!staffIds.slice(0, 2).includes(resolvedStaffId as "marinela" | "mia")) {
              return unavailable("The stylist for this slot cannot be verified. No appointment was created.");
            }
            const reviewUrl = new URL("/rezervacija", window.location.origin);
            reviewUrl.searchParams.set("usluga", serviceId);
            reviewUrl.searchParams.set("djelatnik", resolvedStaffId);
            reviewUrl.searchParams.set("datum", date);
            reviewUrl.searchParams.set("vrijeme", time);
            reviewUrl.searchParams.set("izvor", "webmcp");
            const navigation = window.setTimeout(() => {
              if (
                !options.signal?.aborted &&
                !registration.signal.aborted &&
                publicToolPaths.has(window.location.pathname)
              ) {
                window.location.assign(reviewUrl.toString());
              }
            }, 700);
            const cancelNavigation = () => window.clearTimeout(navigation);
            options.signal?.addEventListener("abort", cancelNavigation, { once: true });
            registration.signal.addEventListener("abort", cancelNavigation, { once: true });
            return {
              status: "awaiting_human_confirmation",
              bookingCreated: false,
              serviceId,
              staffId: resolvedStaffId,
              date,
              time,
              visibleReviewOpening: true,
              userActionRequired:
                "Review the visible summary, enter contact details, acknowledge the privacy notice, complete the security check and click Potvrdi rezervaciju.",
            };
          } catch {
            return unavailable("The selected slot cannot be verified. No appointment was created.");
          }
        },
      }, { signal: registration.signal });

      document.documentElement.dataset.marinelaWebmcp = "ready";
      window.dispatchEvent(new CustomEvent("marinela:webmcp-ready"));
    }

    register().catch(() => {
      registration.abort();
      if (publicToolPaths.has(window.location.pathname)) {
        document.documentElement.dataset.marinelaWebmcp = "error";
        window.dispatchEvent(new CustomEvent("marinela:webmcp-error"));
      }
    });
    return () => {
      cachedCatalog = null;
      delete document.documentElement.dataset.marinelaWebmcp;
      registration.abort();
    };
  }, [pathname]);

  return null;
}
