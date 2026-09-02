import { env } from "cloudflare:workers";
import {
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
  writeAdminAudit,
} from "../../../../../lib/admin-auth";
import {
  finalizeGoogleCalendarCleanup,
} from "../../../../../lib/google-calendar";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) {
    return Response.json({ error: "Nemate ovlast za uklanjanje korisnika." }, { status: 403 });
  }
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan izvor zahtjeva." }, { status: 403 });
  }

  const { id } = await params;
  const target = await env.DB.prepare(
    "SELECT id,email,role,employee_id,active,updated_at FROM salon_users WHERE id = ? LIMIT 1",
  )
    .bind(id)
    .first<{
      id: string;
      email: string;
      role: string;
      employee_id: "marinela" | "mia" | null;
      active: number;
      updated_at: string;
    }>();

  if (!target) return Response.json({ error: "Korisnik nije pronađen." }, { status: 404 });
  if (target.id === user.id) {
    return Response.json({ error: "Ne možete ukloniti vlastiti račun." }, { status: 409 });
  }
  if (target.role === "owner") {
    return Response.json({ error: "Vlasnički račun nije moguće ukloniti." }, { status: 409 });
  }
  if (!target.active) {
    return Response.json({ ok: true, alreadyRemoved: true });
  }

  const now = new Date().toISOString();
  const cleanupId = crypto.randomUUID();
  const mutationSucceeded =
    "EXISTS (SELECT 1 FROM salon_users WHERE id = ? AND active = 0 AND removed_at = ? AND updated_at = ?)";

  const statements = target.employee_id
    ? [
        env.DB.prepare(
          `UPDATE salon_users
           SET active = 0, employee_id = NULL, removed_at = ?, updated_at = ?
           WHERE id = ? AND active = 1 AND role = ? AND employee_id IS ?
             AND lower(email) = ? AND updated_at = ?
             AND EXISTS (
               SELECT 1 FROM salon_users actor
               WHERE actor.id = ? AND lower(actor.email) = ? AND actor.active = 1
                 AND actor.role IN ('owner','admin')
             )`,
        ).bind(
          now,
          now,
          target.id,
          target.role,
          target.employee_id,
          target.email.toLowerCase(),
          target.updated_at,
          user.id,
          user.email.toLowerCase(),
        ),
        env.DB.prepare(
          `INSERT OR IGNORE INTO google_calendar_cleanup_connections (
             id,employee_id,calendar_id,google_account_email,refresh_token_encrypted,
             connected_by_email,connected_at,source_updated_at,retired_at,retired_by_email,reason
           )
           SELECT COALESCE(connection.connection_id, ?),connection.employee_id,connection.calendar_id,
                  connection.google_account_email,connection.refresh_token_encrypted,
                  connection.connected_by_email,connection.connected_at,connection.updated_at,?,?, 'user_removed'
           FROM google_calendar_connections connection
           WHERE connection.employee_id = ? AND ${mutationSucceeded}`,
        ).bind(cleanupId, now, user.email, target.employee_id, target.id, now, now),
        env.DB.prepare(
          `DELETE FROM google_calendar_connections
           WHERE employee_id = ? AND ${mutationSucceeded}
             AND EXISTS (
               SELECT 1 FROM google_calendar_cleanup_connections cleanup
               WHERE cleanup.employee_id = google_calendar_connections.employee_id
                 AND cleanup.refresh_token_encrypted = google_calendar_connections.refresh_token_encrypted
             )`,
        ).bind(target.employee_id, target.id, now, now),
        env.DB.prepare(
          `DELETE FROM calendar_oauth_states
           WHERE lower(user_email) = ? AND ${mutationSucceeded}`,
        ).bind(target.email.toLowerCase(), target.id, now, now),
        env.DB.prepare(
          `DELETE FROM calendar_oauth_states
           WHERE employee_id = ? AND ${mutationSucceeded}`,
        ).bind(target.employee_id, target.id, now, now),
      ]
    : [
        env.DB.prepare(
          `UPDATE salon_users
           SET active = 0, employee_id = NULL, removed_at = ?, updated_at = ?
           WHERE id = ? AND active = 1 AND role = ? AND employee_id IS NULL
             AND lower(email) = ? AND updated_at = ?
             AND EXISTS (
               SELECT 1 FROM salon_users actor
               WHERE actor.id = ? AND lower(actor.email) = ? AND actor.active = 1
                 AND actor.role IN ('owner','admin')
             )`,
        ).bind(
          now,
          now,
          target.id,
          target.role,
          target.email.toLowerCase(),
          target.updated_at,
          user.id,
          user.email.toLowerCase(),
        ),
        env.DB.prepare(
          `DELETE FROM calendar_oauth_states
           WHERE lower(user_email) = ? AND ${mutationSucceeded}`,
        ).bind(target.email.toLowerCase(), target.id, now, now),
      ];

  const results = await env.DB.batch(statements);
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    return Response.json(
      { error: "Korisnički račun promijenjen je tijekom zahtjeva. Osvježite stranicu i pokušajte ponovno." },
      { status: 409 },
    );
  }
  const calendarArchived = target.employee_id ? (results[1]?.meta.changes ?? 0) : 0;
  const calendarDeleteChanges = target.employee_id ? (results[2]?.meta.changes ?? 0) : 0;
  const cleanup = target.employee_id
    ? await finalizeGoogleCalendarCleanup(target.employee_id).catch(() => ({ removed: 0, revoked: 0 }))
    : { removed: 0, revoked: 0 };
  await writeAdminAudit({
    actorEmail: user.email,
    action: "user_access_removed",
    targetType: "salon_user",
    targetId: target.id,
    details: JSON.stringify({
      email: target.email,
      calendarDisconnected: Boolean(target.employee_id),
      calendarArchived,
      calendarDeleteChanges,
      cleanupRemoved: cleanup.removed,
      cleanupRevoked: cleanup.revoked,
    }),
  }).catch(() => undefined);

  return Response.json({ ok: true });
}
