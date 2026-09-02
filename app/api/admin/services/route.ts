import { env } from "cloudflare:workers";
import {
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
  prepareAdminAudit,
} from "../../../../lib/admin-auth";
import { readJsonBody } from "../../../../lib/request-security";

export const dynamic = "force-dynamic";

const categories = ["Ekstenzije", "Boja", "Styling", "Njega"] as const;

type ServicePayload = {
  name?: unknown;
  durationMinutes?: unknown;
  bufferMinutes?: unknown;
  priceLabel?: unknown;
  category?: unknown;
  description?: unknown;
  staffIds?: unknown;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanPayload(payload: ServicePayload) {
  const name = clean(payload.name, 90);
  const durationMinutes = Number(payload.durationMinutes);
  const bufferMinutes = Number(payload.bufferMinutes);
  const priceLabel = clean(payload.priceLabel, 60);
  const category = clean(payload.category, 30);
  const description = clean(payload.description, 420);
  const staffIds = Array.isArray(payload.staffIds)
    ? Array.from(new Set(payload.staffIds.filter((value): value is "marinela" | "mia" => value === "marinela" || value === "mia")))
    : [];
  if (
    !name || !priceLabel || !description ||
    !categories.includes(category as (typeof categories)[number]) ||
    !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || durationMinutes % 15 !== 0 ||
    !Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 180 || bufferMinutes % 15 !== 0 ||
    staffIds.length === 0
  ) return null;
  return { name, durationMinutes, bufferMinutes, priceLabel, category, description, staffIds };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54) || "usluga";
}

export async function POST(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) {
    return Response.json({ error: "Nemate ovlast za dodavanje usluga." }, { status: 403 });
  }
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan zahtjev." }, { status: 403 });
  }

  const body = await readJsonBody<ServicePayload>(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const payload = cleanPayload(body.value);
  if (!payload) {
    return Response.json({ error: "Provjerite naziv, kategoriju, trajanje, cijenu, opis i zaposlenike." }, { status: 400 });
  }

  const duplicate = await env.DB.prepare(
    "SELECT id FROM service_settings WHERE lower(name) = lower(?) LIMIT 1",
  ).bind(payload.name).first<{ id: string }>();
  if (duplicate) {
    return Response.json({ error: "Usluga s tim nazivom već postoji. Uredite postojeću stavku." }, { status: 409 });
  }

  const order = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), -10) + 10 AS next_order FROM service_settings",
  ).first<{ next_order: number }>();
  const id = `${slugify(payload.name)}-${crypto.randomUUID().slice(0, 6)}`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO service_settings (id,name,duration_minutes,buffer_minutes,price_label,category,description,image,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NULL,?,1,?,?)",
    ).bind(
      id,
      payload.name,
      payload.durationMinutes,
      payload.bufferMinutes,
      payload.priceLabel,
      payload.category,
      payload.description,
      order?.next_order ?? 0,
      now,
      now,
    ),
    ...payload.staffIds.map((employeeId) => env.DB.prepare(
      "INSERT INTO employee_services (employee_id,service_id,active) VALUES (?,?,1)",
    ).bind(employeeId, id)),
    prepareAdminAudit({
      actorEmail: user.email,
      action: "service_created",
      targetType: "service",
      targetId: id,
      details: JSON.stringify({ name: payload.name, staffIds: payload.staffIds }),
    }),
  ]);
  return Response.json({ ok: true, serviceId: id }, { status: 201 });
}
