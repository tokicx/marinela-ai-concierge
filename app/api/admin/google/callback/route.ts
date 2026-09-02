import { env } from "cloudflare:workers";
import { canAccessEmployee, getCurrentSalonUser, writeAdminAudit } from "../../../../../lib/admin-auth";
import {
  exchangeGoogleCode,
  oauthEncryptionKey,
  readGoogleAccount,
} from "../../../../../lib/google-oauth";
import { encryptSecret, sha256Base64Url } from "../../../../../lib/oauth-crypto";
import {
  finalizeGoogleCalendarCleanup,
  prepareStoredGoogleCalendarRevocation,
} from "../../../../../lib/google-calendar";
import { CANONICAL_SITE_ORIGIN } from "../../../../../lib/site";

export const dynamic = "force-dynamic";

type StateRow = {
  employee_id: "marinela" | "mia";
  user_email: string;
  code_verifier: string;
};

function redirectToIntegrations(
  request: Request,
  status: "connected" | "error",
  employeeId?: string,
  reason?: "account_assigned" | "authorization_changed",
) {
  const url = new URL("/admin/integracije", CANONICAL_SITE_ORIGIN);
  url.searchParams.set("status", status);
  if (employeeId) url.searchParams.set("employeeId", employeeId);
  if (reason) url.searchParams.set("reason", reason);
  return Response.redirect(url, 302);
}

export async function GET(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user) return Response.json({ error: "Prijava je obavezna." }, { status: 401 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (
    !code ||
    !state ||
    code.length > 4_096 ||
    state.length > 512 ||
    url.searchParams.get("error")
  ) return redirectToIntegrations(request, "error");

  try {
    const stateHash = await sha256Base64Url(state);
    const now = new Date().toISOString();
    const stateRow = await env.DB.prepare(
      `DELETE FROM calendar_oauth_states
       WHERE state_hash = ? AND expires_at > ? AND lower(user_email) = ?
       RETURNING employee_id,user_email,code_verifier`,
    )
      .bind(stateHash, now, user.email.toLowerCase())
      .first<StateRow>();
    if (
      !stateRow ||
      stateRow.user_email.toLowerCase() !== user.email.toLowerCase() ||
      !canAccessEmployee(user, stateRow.employee_id)
    ) {
      return redirectToIntegrations(request, "error");
    }

    const tokens = await exchangeGoogleCode(code, stateRow.code_verifier);
    const account = await readGoogleAccount(tokens.accessToken);
    const assignedAccount = await env.DB.prepare(
      `SELECT employee_id FROM google_calendar_connections
       WHERE lower(google_account_email) = ? AND employee_id != ?
       UNION ALL
       SELECT employee_id FROM google_calendar_cleanup_connections
       WHERE lower(google_account_email) = ? AND employee_id != ?
       LIMIT 1`,
    )
      .bind(
        account.accountEmail,
        stateRow.employee_id,
        account.accountEmail,
        stateRow.employee_id,
      )
      .first<{ employee_id: string }>();
    if (assignedAccount) {
      return redirectToIntegrations(
        request,
        "error",
        stateRow.employee_id,
        "account_assigned",
      );
    }
    const encryptionKey = oauthEncryptionKey();
    if (!encryptionKey) return redirectToIntegrations(request, "error");
    const previousConnection = await prepareStoredGoogleCalendarRevocation(stateRow.employee_id);
    if (
      !previousConnection.snapshotAvailable ||
      (
        previousConnection.hadConnection &&
        (
          !previousConnection.accountEmail ||
          !previousConnection.calendarId ||
          !previousConnection.refreshTokenEncrypted ||
          !previousConnection.connectedByEmail ||
          !previousConnection.connectedAt ||
          !previousConnection.updatedAt
        )
      )
    ) {
      return redirectToIntegrations(
        request,
        "error",
        stateRow.employee_id,
        "authorization_changed",
      );
    }
    const replacingCalendar = Boolean(
      previousConnection.hadConnection &&
      (
        previousConnection.accountEmail?.toLowerCase() !== account.accountEmail.toLowerCase() ||
        previousConnection.calendarId !== account.calendarId
      ),
    );
    const encryptedRefreshToken = await encryptSecret(tokens.refreshToken, encryptionKey);
    const connectedAt = new Date().toISOString();
    const revocationStaleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const connectionId = replacingCalendar || !previousConnection.hadConnection
      ? crypto.randomUUID()
      : previousConnection.connectionId ?? crypto.randomUUID();
    const cleanupId = previousConnection.connectionId ?? crypto.randomUUID();
    const replacementArchiveGuard = replacingCalendar
      ? `AND EXISTS (
           SELECT 1 FROM google_calendar_cleanup_connections archived
           WHERE archived.id = ?
             AND archived.employee_id = connection.employee_id
             AND archived.refresh_token_encrypted = connection.refresh_token_encrypted
         )`
      : "";
    const updateStatement = previousConnection.hadConnection
      ? env.DB.prepare(
          `UPDATE google_calendar_connections AS connection
           SET connection_id = ?, calendar_id = ?, google_account_email = ?,
               refresh_token_encrypted = ?, connected_by_email = ?, connected_at = ?, updated_at = ?
           WHERE connection.employee_id = ?
             AND connection.calendar_id = ?
             AND lower(connection.google_account_email) = ?
             AND connection.refresh_token_encrypted = ?
             AND connection.connected_at = ?
             AND connection.updated_at = ?
             AND EXISTS (
               SELECT 1 FROM salon_users salon_user
               WHERE lower(salon_user.email) = ? AND salon_user.active = 1
                 AND (salon_user.role IN ('owner','admin') OR salon_user.employee_id = connection.employee_id)
             )
             AND NOT EXISTS (
               SELECT 1 FROM google_calendar_connections other
               WHERE lower(other.google_account_email) = ?
                 AND other.employee_id != connection.employee_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM google_calendar_cleanup_connections retired
               WHERE lower(retired.google_account_email) = ?
                 AND retired.employee_id != connection.employee_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM google_calendar_cleanup_connections revoking
               WHERE lower(revoking.google_account_email) = ?
                 AND revoking.revocation_token IS NOT NULL
                 AND revoking.revocation_started_at >= ?
             )
             ${replacementArchiveGuard}`,
        ).bind(
          connectionId,
          account.calendarId,
          account.accountEmail,
          encryptedRefreshToken,
          user.email,
          connectedAt,
          connectedAt,
          stateRow.employee_id,
          previousConnection.calendarId,
          previousConnection.accountEmail?.toLowerCase(),
          previousConnection.refreshTokenEncrypted,
          previousConnection.connectedAt,
          previousConnection.updatedAt,
          stateRow.user_email.toLowerCase(),
          account.accountEmail,
          account.accountEmail,
          account.accountEmail,
          revocationStaleBefore,
          ...(replacingCalendar ? [cleanupId] : []),
        )
      : null;

    let persistenceChanges = 0;
    let archivedChanges = 0;
    if (updateStatement && replacingCalendar) {
      const results = await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO google_calendar_cleanup_connections (
             id,employee_id,calendar_id,google_account_email,refresh_token_encrypted,
             connected_by_email,connected_at,source_updated_at,retired_at,retired_by_email,reason
           )
           SELECT ?,?,?,?,?,?,?,?,?,?,'calendar_replaced'
           WHERE EXISTS (
             SELECT 1 FROM google_calendar_connections connection
             WHERE connection.employee_id = ?
               AND connection.calendar_id = ?
               AND lower(connection.google_account_email) = ?
               AND connection.refresh_token_encrypted = ?
               AND connection.connected_at = ?
               AND connection.updated_at = ?
               AND EXISTS (
                 SELECT 1 FROM salon_users salon_user
                 WHERE lower(salon_user.email) = ? AND salon_user.active = 1
                   AND (salon_user.role IN ('owner','admin') OR salon_user.employee_id = connection.employee_id)
               )
               AND NOT EXISTS (
                 SELECT 1 FROM google_calendar_connections other
                 WHERE lower(other.google_account_email) = ?
                   AND other.employee_id != connection.employee_id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM google_calendar_cleanup_connections retired
                 WHERE lower(retired.google_account_email) = ?
                   AND retired.employee_id != connection.employee_id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM google_calendar_cleanup_connections revoking
                 WHERE lower(revoking.google_account_email) = ?
                   AND revoking.revocation_token IS NOT NULL
                   AND revoking.revocation_started_at >= ?
               )
           )`,
        ).bind(
          cleanupId,
          stateRow.employee_id,
          previousConnection.calendarId,
          previousConnection.accountEmail?.toLowerCase(),
          previousConnection.refreshTokenEncrypted,
          previousConnection.connectedByEmail,
          previousConnection.connectedAt,
          previousConnection.updatedAt,
          connectedAt,
          user.email,
          stateRow.employee_id,
          previousConnection.calendarId,
          previousConnection.accountEmail?.toLowerCase(),
          previousConnection.refreshTokenEncrypted,
          previousConnection.connectedAt,
          previousConnection.updatedAt,
          stateRow.user_email.toLowerCase(),
          account.accountEmail,
          account.accountEmail,
          account.accountEmail,
          revocationStaleBefore,
        ),
        updateStatement,
      ]);
      archivedChanges = results[0]?.meta.changes ?? 0;
      persistenceChanges = results[1]?.meta.changes ?? 0;
    } else if (updateStatement) {
      const persistence = await updateStatement.run();
      persistenceChanges = persistence.meta.changes ?? 0;
    } else {
      const persistence = await env.DB.prepare(
        `INSERT INTO google_calendar_connections (
           employee_id,connection_id,calendar_id,google_account_email,refresh_token_encrypted,
           connected_by_email,connected_at,updated_at
         )
         SELECT ?,?,?,?,?,?,?,?
         WHERE EXISTS (
           SELECT 1 FROM salon_users salon_user
           WHERE lower(salon_user.email) = ? AND salon_user.active = 1
             AND (salon_user.role IN ('owner','admin') OR salon_user.employee_id = ?)
         )
           AND NOT EXISTS (
             SELECT 1 FROM google_calendar_connections existing
             WHERE existing.employee_id = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM google_calendar_connections assigned
             WHERE lower(assigned.google_account_email) = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM google_calendar_cleanup_connections retired
             WHERE lower(retired.google_account_email) = ? AND retired.employee_id != ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM google_calendar_cleanup_connections revoking
             WHERE lower(revoking.google_account_email) = ?
               AND revoking.revocation_token IS NOT NULL
               AND revoking.revocation_started_at >= ?
           )`,
      )
        .bind(
          stateRow.employee_id,
          connectionId,
          account.calendarId,
          account.accountEmail,
          encryptedRefreshToken,
          user.email,
          connectedAt,
          connectedAt,
          stateRow.user_email.toLowerCase(),
          stateRow.employee_id,
          stateRow.employee_id,
          account.accountEmail,
          account.accountEmail,
          stateRow.employee_id,
          account.accountEmail,
          revocationStaleBefore,
        )
        .run();
      persistenceChanges = persistence.meta.changes ?? 0;
    }

    if (persistenceChanges !== 1) {
      const accountAssignedAfterRace = await env.DB.prepare(
        `SELECT employee_id FROM google_calendar_connections
         WHERE lower(google_account_email) = ? AND employee_id != ?
         UNION ALL
         SELECT employee_id FROM google_calendar_cleanup_connections
         WHERE lower(google_account_email) = ? AND employee_id != ?
         LIMIT 1`,
      )
        .bind(
          account.accountEmail,
          stateRow.employee_id,
          account.accountEmail,
          stateRow.employee_id,
        )
        .first<{ employee_id: string }>()
        .catch(() => null);
      if (accountAssignedAfterRace) {
        return redirectToIntegrations(
          request,
          "error",
          stateRow.employee_id,
          "account_assigned",
        );
      }
      return redirectToIntegrations(
        request,
        "error",
        stateRow.employee_id,
        "authorization_changed",
      );
    }
    const cleanup = await finalizeGoogleCalendarCleanup(stateRow.employee_id)
      .catch(() => ({ removed: 0, revoked: 0 }));
    await writeAdminAudit({
      actorEmail: user.email,
      action: "google_calendar_connected",
      targetType: "employee",
      targetId: stateRow.employee_id,
      details: JSON.stringify({
        googleAccountEmail: account.accountEmail,
        connectionId,
        previousConnectionArchived: archivedChanges,
        cleanupRemoved: cleanup.removed,
        cleanupRevoked: cleanup.revoked,
      }),
    }).catch(() => undefined);
    return redirectToIntegrations(request, "connected", stateRow.employee_id);
  } catch {
    return redirectToIntegrations(request, "error");
  }
}
