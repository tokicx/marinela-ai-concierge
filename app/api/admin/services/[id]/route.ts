import { env } from "cloudflare:workers";
import {
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
  prepareAdminAudit,
} from "../../../../../lib/admin-auth";
import { readJsonBody } from "../../../../../lib/request-security";

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
  active?: unknown;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanFullPayload(payload: ServicePayload) {
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

async function authorized(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) return null;
  if (!hasValidSameOrigin(request)) return null;
  return user;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authorized(request);
  if (!user) return Response.json({ error: "Nemate ovlast za uređivanje usluga." }, { status: 403 });
  const { id } = await params;
  const existing = await env.DB.prepare(
    "SELECT id,name,active FROM service_settings WHERE id = ? LIMIT 1",
  ).bind(id).first<{ id: string; name: string; active: number }>();
  if (!existing) return Response.json({ error: "Usluga nije pronađena." }, { status: 404 });

  const body = await readJsonBody<ServicePayload>(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const raw = body.value;
  if (raw?.active === true && raw.name === undefined) {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE service_settings SET active = 1, updated_at = ? WHERE id = ?").bind(now, id),
      prepareAdminAudit({ actorEmail: user.email, action: "service_restored", targetType: "service", targetId: id }),
    ]);
    return Response.json({ ok: true });
  }

  const payload = cleanFullPayload(raw);
  if (!payload) {
    return Response.json({ error: "Provjerite naziv, kategoriju, trajanje, cijenu, opis i zaposlenike." }, { status: 400 });
  }
  const duplicate = await env.DB.prepare(
    "SELECT id FROM service_settings WHERE lower(name) = lower(?) AND id != ? LIMIT 1",
  ).bind(payload.name, id).first<{ id: string }>();
  if (duplicate) return Response.json({ error: "Druga usluga već koristi taj naziv." }, { status: 409 });

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE service_settings SET name = ?,duration_minutes = ?,buffer_minutes = ?,price_label = ?,category = ?,description = ?,active = 1,updated_at = ? WHERE id = ?",
    ).bind(
      payload.name,
      payload.durationMinutes,
      payload.bufferMinutes,
      payload.priceLabel,
      payload.category,
      payload.description,
      now,
      id,
    ),
    env.DB.prepare("DELETE FROM employee_services WHERE service_id = ?").bind(id),
    ...payload.staffIds.map((employeeId) => env.DB.prepare(
      "INSERT INTO employee_services (employee_id,service_id,active) VALUES (?,?,1)",
    ).bind(employeeId, id)),
    prepareAdminAudit({
      actorEmail: user.email,
      action: "service_updated",
      targetType: "service",
      targetId: id,
      details: JSON.stringify({ previousName: existing.name, name: payload.name, staffIds: payload.staffIds }),
    }),
  ]);
  return Response.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authorized(request);
  if (!user) return Response.json({ error: "Nemate ovlast za uklanjanje usluga." }, { status: 403 });
  const { id } = await params;
  const existing = await env.DB.prepare(
    "SELECT id,name,active FROM service_settings WHERE id = ? LIMIT 1",
  ).bind(id).first<{ id: string; name: string; active: number }>();
  if (!existing) return Response.json({ error: "Usluga nije pronađena." }, { status: 404 });
  if (!existing.active) return Response.json({ ok: true });
  const now = new Date().toISOString();
  const auditId = crypto.randomUUID();
  const details = JSON.stringify({ name: existing.name });
  const [removed] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE service_settings SET active = 0,updated_at = ? WHERE id = ? AND active = 1 AND (SELECT COUNT(*) FROM service_settings WHERE active = 1) > 1",
    ).bind(now, id),
    env.DB.prepare(
      `INSERT INTO admin_audit_log (id,actor_email,action,target_type,target_id,details,created_at)
       SELECT ?,lower(?),'service_removed','service',?,?,?
       FROM service_settings WHERE id = ? AND active = 0 AND updated_at = ?`,
    ).bind(auditId, user.email, id, details, now, id, now),
  ]);
  if ((removed.meta.changes ?? 0) !== 1) {
    return Response.json({ error: "Najmanje jedna usluga mora ostati aktivna za online rezervacije." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
