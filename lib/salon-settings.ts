import { env } from "cloudflare:workers";
import {
  openingHours as fallbackOpeningHours,
  services as fallbackServices,
  type Service,
} from "../app/salon-data";

export type OpeningHourSetting = {
  dayOfWeek: number;
  dayLabel: string;
  openTime: string;
  closeTime: string;
  closed: boolean;
};

export type SalonService = Service & {
  active: boolean;
  sortOrder: number;
};

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_label: string;
  category: string;
  description: string;
  image: string | null;
  sort_order: number;
  active: number;
};

type AssignmentRow = {
  service_id: string;
  employee_id: "marinela" | "mia";
};

type OpeningHourRow = {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  closed: number;
};

const dayLabels = [
  "Nedjelja",
  "Ponedjeljak",
  "Utorak",
  "Srijeda",
  "Četvrtak",
  "Petak",
  "Subota",
] as const;

const categories = new Set<Service["category"]>(["Ekstenzije", "Boja", "Styling", "Njega"]);

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export async function loadServices(options: { includeInactive?: boolean; strict?: boolean } = {}): Promise<SalonService[]> {
  try {
    const [serviceResult, assignmentResult] = await Promise.all([
      env.DB.prepare(
        "SELECT id,name,duration_minutes,buffer_minutes,price_label,category,description,image,sort_order,active FROM service_settings ORDER BY sort_order ASC,name ASC",
      ).all<ServiceRow>(),
      env.DB.prepare(
        "SELECT service_id,employee_id FROM employee_services WHERE active = 1 ORDER BY employee_id ASC",
      ).all<AssignmentRow>(),
    ]);
    const rows = serviceResult.results ?? [];
    if (!rows.length) {
      if (options.strict) throw new Error("service_catalog_unavailable");
      return fallbackServices.map((service, index) => ({ ...service, active: true, sortOrder: index * 10 }));
    }
    const assignments = assignmentResult.results ?? [];
    return rows
      .filter((row) => options.includeInactive || Boolean(row.active))
      .map((row) => {
        const fallback = fallbackServices.find((service) => service.id === row.id);
        const category = categories.has(row.category as Service["category"])
          ? row.category as Service["category"]
          : fallback?.category ?? "Styling";
        const staffIds = assignments
          .filter((assignment) => assignment.service_id === row.id)
          .map((assignment) => assignment.employee_id);
        return {
          id: row.id,
          name: row.name,
          duration: row.duration_minutes,
          durationLabel: durationLabel(row.duration_minutes),
          price: row.price_label,
          category,
          description: row.description || fallback?.description || "Profesionalna usluga prilagođena vašoj kosi.",
          image: row.image || fallback?.image,
          buffer: row.buffer_minutes,
          staffIds: staffIds.length ? staffIds : options.strict ? [] : fallback?.staffIds ?? [],
          active: Boolean(row.active),
          sortOrder: row.sort_order,
        } satisfies SalonService;
      });
  } catch {
    if (options.strict) throw new Error("service_catalog_unavailable");
    return fallbackServices.map((service, index) => ({ ...service, active: true, sortOrder: index * 10 }));
  }
}

export async function loadOpeningHours(options: { strict?: boolean } = {}): Promise<OpeningHourSetting[]> {
  try {
    const result = await env.DB.prepare(
      "SELECT day_of_week,open_time,close_time,closed FROM opening_hours ORDER BY CASE day_of_week WHEN 0 THEN 7 ELSE day_of_week END ASC",
    ).all<OpeningHourRow>();
    const rows = result.results ?? [];
    if (rows.length === 7) {
      return rows.map((row) => ({
        dayOfWeek: row.day_of_week,
        dayLabel: dayLabels[row.day_of_week] ?? `Dan ${row.day_of_week}`,
        openTime: row.open_time ?? "09:00",
        closeTime: row.close_time ?? "17:00",
        closed: Boolean(row.closed),
      }));
    }
    if (options.strict) throw new Error("opening_hours_unavailable");
  } catch {
    if (options.strict) throw new Error("opening_hours_unavailable");
    // A fresh deployment can briefly render before its first migration is applied.
  }

  const fallbackByDay = new Map(fallbackOpeningHours.map(([day, value]) => [day, value]));
  return [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
    const dayLabel = dayLabels[dayOfWeek];
    const value = fallbackByDay.get(dayLabel) ?? "Zatvoreno";
    const closed = value === "Zatvoreno";
    const [openTime = "09:00", closeTime = "17:00"] = closed
      ? []
      : value.split(" – ");
    return { dayOfWeek, dayLabel, openTime, closeTime, closed };
  });
}

export function displayOpeningHours(hours: OpeningHourSetting[]) {
  return hours.map((entry) => [
    entry.dayLabel,
    entry.closed ? "Zatvoreno" : `${entry.openTime} – ${entry.closeTime}`,
  ] as const);
}
