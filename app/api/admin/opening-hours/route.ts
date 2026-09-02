import { env } from "cloudflare:workers";
import {
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
  prepareAdminAudit,
} from "../../../../lib/admin-auth";
import { readJsonBody } from "../../../../lib/request-security";
import { isTime, localTimeToMinutes } from "../../../../lib/time";

export const dynamic = "force-dynamic";

type HourInput = {
  dayOfWeek?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
  closed?: unknown;
};

export async function PUT(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) {
    return Response.json({ error: "Nemate ovlast za uređivanje radnog vremena." }, { status: 403 });
  }
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan zahtjev." }, { status: 403 });
  }
  const parsedBody = await readJsonBody<{ hours?: unknown }>(request);
  if (!parsedBody.ok) return Response.json({ error: parsedBody.error }, { status: parsedBody.status });
  if (!Array.isArray(parsedBody.value.hours) || parsedBody.value.hours.length !== 7) {
    return Response.json({ error: "Potrebno je poslati svih sedam dana." }, { status: 400 });
  }

  const parsed = parsedBody.value.hours.map((raw) => {
    const item = raw as HourInput;
    return {
      dayOfWeek: Number(item.dayOfWeek),
      openTime: typeof item.openTime === "string" ? item.openTime : "",
      closeTime: typeof item.closeTime === "string" ? item.closeTime : "",
      closed: item.closed === true,
    };
  });
  const days = new Set(parsed.map((entry) => entry.dayOfWeek));
  const invalid = days.size !== 7 || parsed.some((entry) =>
    !Number.isInteger(entry.dayOfWeek) || entry.dayOfWeek < 0 || entry.dayOfWeek > 6 ||
    (!entry.closed && (
      !isTime(entry.openTime) || !isTime(entry.closeTime) ||
      localTimeToMinutes(entry.openTime) >= localTimeToMinutes(entry.closeTime)
    )),
  );
  if (invalid) {
    return Response.json({ error: "Provjerite dane i vrijeme. Završetak mora biti nakon početka rada." }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    ...parsed.map((entry) => env.DB.prepare(
      "INSERT INTO opening_hours (day_of_week,open_time,close_time,closed,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(day_of_week) DO UPDATE SET open_time = excluded.open_time,close_time = excluded.close_time,closed = excluded.closed,updated_at = excluded.updated_at",
    ).bind(
      entry.dayOfWeek,
      entry.closed ? null : entry.openTime,
      entry.closed ? null : entry.closeTime,
      entry.closed ? 1 : 0,
      now,
    )),
    prepareAdminAudit({
      actorEmail: user.email,
      action: "opening_hours_updated",
      targetType: "salon_settings",
      targetId: "weekly-opening-hours",
      details: JSON.stringify(parsed),
    }),
  ]);
  return Response.json({ ok: true });
}
