import { env } from "cloudflare:workers";
import {
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
  writeAdminAudit,
} from "../../../../lib/admin-auth";
import {
  finalizeGoogleCalendarCleanup,
} from "../../../../lib/google-calendar";
import { readJsonBody } from "../../../../lib/request-security";

export const dynamic = "force-dynamic";

type UserPayload = {
  email?: unknown;
  displayName?: unknown;
  role?: unknown;
  employeeId?: unknown;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) {
    return Response.json({ error: "Nemate ovlast za upravljanje korisnicima." }, { status: 403 });
  }
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan zahtjev." }, { status: 403 });
  }

  const body = await readJsonBody<UserPayload>(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const payload = body.value;

  const email = clean(payload.email, 160).toLowerCase();
  const displayName = clean(payload.displayName, 100);
  const role = clean(payload.role, 20);
  const requestedEmployeeId = clean(payload.employeeId, 20) || null;
  const employeeId = role === "admin" ? null : requestedEmployeeId;

  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    !displayName ||
    !["admin", "staff"].includes(role) ||
    (requestedEmployeeId !== null && !["marinela", "mia"].includes(requestedEmployeeId)) ||
    (role === "staff" && employeeId === null)
  ) {
    return Response.json({ error: "Provjerite ime, e-mail, ulogu i zaposlenika." }, { status: 400 });
  }

  if (employeeId) {
    const assigned = await env.DB.prepare(
      "SELECT id FROM salon_users WHERE employee_id = ? AND email != ? AND active = 1 LIMIT 1",
    )
      .bind(employeeId, email)
      .first<{ id: string }>();
    if (assigned) {
      return Response.json({ error: "Odabrani zaposlenik već ima aktivan korisnički račun." }, { status: 409 });
    }
  }

  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    "SELECT id,role,employee_id,active,updated_at FROM salon_users WHERE email = ? LIMIT 1",
  )
    .bind(email)
    .first<{
      id: string;
      role: string;
      employee_id: "marinela" | "mia" | null;
      active: number;
      updated_at: string;
    }>();

  let userId: string;
  let previousCalendarDisconnect: {
    localDisconnected: boolean;
    archived: number;
    deleteChanges: number;
    cleanupRemoved: number;
    cleanupRevoked: number;
  } | null = null;
  if (existing) {
    if (existing.role === "owner") {
      return Response.json({ error: "Vlasnički račun nije moguće mijenjati ovim putem." }, { status: 409 });
    }
    userId = existing.id;
    const disconnectPreviousCalendar = Boolean(
      existing.employee_id && existing.employee_id !== employeeId,
    );
    if (disconnectPreviousCalendar && existing.employee_id) {
      const cleanupId = crypto.randomUUID();
      const mutationSucceeded =
        "EXISTS (SELECT 1 FROM salon_users WHERE id = ? AND active = 1 AND employee_id IS ? AND updated_at = ?)";
      const results = await env.DB.batch([
        env.DB.prepare(
          `UPDATE salon_users
           SET display_name = ?, role = ?, employee_id = ?, active = 1, removed_at = NULL, updated_at = ?
           WHERE id = ? AND active = ? AND role = ? AND employee_id IS ? AND updated_at = ?
             AND EXISTS (
               SELECT 1 FROM salon_users actor
               WHERE lower(actor.email) = ? AND actor.active = 1
                 AND actor.role IN ('owner','admin')
             )`,
        ).bind(
          displayName,
          role,
          employeeId,
          now,
          userId,
          existing.active,
          existing.role,
          existing.employee_id,
          existing.updated_at,
          user.email.toLowerCase(),
        ),
        env.DB.prepare(
          `INSERT OR IGNORE INTO google_calendar_cleanup_connections (
             id,employee_id,calendar_id,google_account_email,refresh_token_encrypted,
             connected_by_email,connected_at,source_updated_at,retired_at,retired_by_email,reason
           )
           SELECT COALESCE(connection.connection_id, ?),connection.employee_id,connection.calendar_id,
                  connection.google_account_email,connection.refresh_token_encrypted,
                  connection.connected_by_email,connection.connected_at,connection.updated_at,?,?, 'user_reassigned'
           FROM google_calendar_connections connection
           WHERE connection.employee_id = ? AND ${mutationSucceeded}`,
        ).bind(
          cleanupId,
          now,
          user.email,
          existing.employee_id,
          userId,
          employeeId,
          now,
        ),
        env.DB.prepare(
          `DELETE FROM google_calendar_connections
           WHERE employee_id = ? AND ${mutationSucceeded}
             AND EXISTS (
               SELECT 1 FROM google_calendar_cleanup_connections cleanup
               WHERE cleanup.employee_id = google_calendar_connections.employee_id
                 AND cleanup.refresh_token_encrypted = google_calendar_connections.refresh_token_encrypted
             )`,
        ).bind(existing.employee_id, userId, employeeId, now),
        env.DB.prepare(
          `DELETE FROM calendar_oauth_states
           WHERE employee_id = ? AND ${mutationSucceeded}`,
        ).bind(existing.employee_id, userId, employeeId, now),
        env.DB.prepare(
          `DELETE FROM calendar_oauth_states
           WHERE lower(user_email) = ? AND ${mutationSucceeded}`,
        ).bind(email, userId, employeeId, now),
      ]).catch(() => []);
      if ((results[0]?.meta.changes ?? 0) !== 1) {
        return Response.json(
          { error: "Korisnički račun promijenjen je tijekom zahtjeva. Osvježite stranicu i pokušajte ponovno." },
          { status: 409 },
        );
      }
      const cleanup = await finalizeGoogleCalendarCleanup(existing.employee_id)
        .catch(() => ({ removed: 0, revoked: 0 }));
      previousCalendarDisconnect = {
        localDisconnected: true,
        archived: results[1]?.meta.changes ?? 0,
        deleteChanges: results[2]?.meta.changes ?? 0,
        cleanupRemoved: cleanup.removed,
        cleanupRevoked: cleanup.revoked,
      };
    } else {
      const updateSucceeded =
        "EXISTS (SELECT 1 FROM salon_users WHERE id = ? AND active = 1 AND role = ? AND employee_id IS ? AND updated_at = ?)";
      const results = await env.DB.batch([
        env.DB.prepare(
          `UPDATE salon_users
           SET display_name = ?, role = ?, employee_id = ?, active = 1, removed_at = NULL, updated_at = ?
           WHERE id = ? AND active = ? AND role = ? AND employee_id IS ? AND updated_at = ?
             AND EXISTS (
               SELECT 1 FROM salon_users actor
               WHERE lower(actor.email) = ? AND actor.active = 1
                 AND actor.role IN ('owner','admin')
             )`,
        ).bind(
          displayName,
          role,
          employeeId,
          now,
          userId,
          existing.active,
          existing.role,
          existing.employee_id,
          existing.updated_at,
          user.email.toLowerCase(),
        ),
        env.DB.prepare(
          `DELETE FROM calendar_oauth_states
           WHERE lower(user_email) = ? AND ${updateSucceeded}`,
        ).bind(email, userId, role, employeeId, now),
      ]).catch(() => []);
      if ((results[0]?.meta.changes ?? 0) !== 1) {
        return Response.json(
          { error: "Korisnički račun ili vaše ovlasti promijenjeni su tijekom zahtjeva. Osvježite stranicu i pokušajte ponovno." },
          { status: 409 },
        );
      }
    }
  } else {
    userId = crypto.randomUUID();
    const created = await env.DB.prepare(
      `INSERT INTO salon_users (id,email,display_name,role,employee_id,active,created_by_email,created_at,updated_at,removed_at)
       SELECT ?,?,?,?,?,1,?,?,?,NULL
       WHERE EXISTS (
         SELECT 1 FROM salon_users actor
         WHERE lower(actor.email) = ? AND actor.active = 1
           AND actor.role IN ('owner','admin')
       )
         AND NOT EXISTS (SELECT 1 FROM salon_users existing WHERE lower(existing.email) = ?)
       RETURNING id`,
    )
      .bind(
        userId,
        email,
        displayName,
        role,
        employeeId,
        user.email,
        now,
        now,
        user.email.toLowerCase(),
        email,
      )
      .first<{ id: string }>()
      .catch(() => null);
    if (!created) {
      return Response.json(
        { error: "Korisnički račun ili vaše ovlasti promijenjeni su tijekom zahtjeva. Osvježite stranicu i pokušajte ponovno." },
        { status: 409 },
      );
    }
  }

  await writeAdminAudit({
    actorEmail: user.email,
    action: existing ? "user_reactivated_or_updated" : "user_created",
    targetType: "salon_user",
    targetId: userId,
    details: JSON.stringify({
      email,
      role,
      employeeId,
      previousCalendarDisconnected: previousCalendarDisconnect?.localDisconnected ?? false,
      previousCalendarArchived: previousCalendarDisconnect?.archived ?? 0,
      previousCalendarDeleteChanges: previousCalendarDisconnect?.deleteChanges ?? 0,
      previousCleanupRemoved: previousCalendarDisconnect?.cleanupRemoved ?? 0,
      previousCleanupRevoked: previousCalendarDisconnect?.cleanupRevoked ?? 0,
    }),
  }).catch(() => undefined);

  return Response.json({ ok: true, userId }, { status: existing ? 200 : 201 });
}
