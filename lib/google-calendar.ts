import { env } from "cloudflare:workers";
import { SALON_TIME_ZONE } from "./time";
import { oauthEncryptionKey } from "./google-oauth";
import { decryptSecret } from "./oauth-crypto";

type StaffId = "marinela" | "mia";
type RuntimeEnv = Record<string, string | undefined>;

type BusyPeriod = {
  start: string;
  end: string;
};

type StoredCalendarRow = {
  connection_id: string | null;
  calendar_id: string;
  google_account_email: string;
  refresh_token_encrypted: string;
  connected_by_email: string;
  connected_at: string;
  updated_at: string;
};

type CalendarConfig = {
  connectionId: string | null;
  calendarId: string;
  accountEmail: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
};

type CalendarAccess = {
  token: string;
  calendarId: string;
  connectionId: string | null;
  accountEmail: string;
};

type GoogleBookingInput = {
  employeeId: StaffId;
  bookingId: string;
  serviceName: string;
  clientName: string;
  clientEmail: string;
  staffName: string;
  startsAt: Date;
  endsAt: Date;
};

type CleanupCalendarRow = StoredCalendarRow & {
  id: string;
  employee_id: StaffId;
  retired_at: string;
};

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

async function storedCalendarConfig(employeeId: StaffId) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  const runtime = runtimeEnv();
  if (!database) return { state: "missing" as const };
  let row: StoredCalendarRow | null;
  try {
    row = await database.prepare(
      "SELECT connection_id,calendar_id,google_account_email,refresh_token_encrypted,connected_by_email,connected_at,updated_at FROM google_calendar_connections WHERE employee_id = ? LIMIT 1",
    )
      .bind(employeeId)
      .first<StoredCalendarRow>();
  } catch {
    return { state: "invalid" as const, snapshotAvailable: false as const };
  }
  if (!row) return { state: "missing" as const };

  const snapshot = {
    accountEmail: row.google_account_email,
    connectionId: row.connection_id,
    calendarId: row.calendar_id,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    connectedByEmail: row.connected_by_email,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    snapshotAvailable: true as const,
  };
  if (!row.connection_id) {
    return { state: "invalid" as const, ...snapshot };
  }
  const encryptionKey = oauthEncryptionKey();
  if (!encryptionKey || !runtime.GOOGLE_CLIENT_ID || !runtime.GOOGLE_CLIENT_SECRET) {
    return { state: "invalid" as const, ...snapshot };
  }
  try {
    const refreshToken = await decryptSecret(row.refresh_token_encrypted, encryptionKey);
    return {
      state: "ready" as const,
      ...snapshot,
      config: {
        connectionId: row.connection_id,
        calendarId: row.calendar_id,
        accountEmail: row.google_account_email,
        refreshToken,
        clientId: runtime.GOOGLE_CLIENT_ID,
        clientSecret: runtime.GOOGLE_CLIENT_SECRET,
      },
    };
  } catch {
    return { state: "invalid" as const, ...snapshot };
  }
}

async function calendarConfig(employeeId: StaffId) {
  const stored = await storedCalendarConfig(employeeId);
  if (stored.state === "ready") return stored.config;
  if (stored.state === "invalid") {
    throw new Error("Stored Google Calendar connection is invalid");
  }
  return null;
}

export async function prepareStoredGoogleCalendarRevocation(employeeId: StaffId) {
  const stored = await storedCalendarConfig(employeeId);
  if (stored.state === "missing") {
    return {
      refreshToken: null,
      accountEmail: null,
      connectionId: null,
      calendarId: null,
      hadConnection: false,
      decryptable: true,
      sharedGrant: false,
      refreshTokenEncrypted: null,
      connectedByEmail: null,
      connectedAt: null,
      updatedAt: null,
      snapshotAvailable: true,
    };
  }
  const accountEmail = stored.state === "ready"
    ? stored.config.accountEmail
    : "accountEmail" in stored ? stored.accountEmail : null;
  const calendarId = stored.state === "ready"
    ? stored.config.calendarId
    : "calendarId" in stored ? stored.calendarId : null;
  const connectionId = stored.state === "ready"
    ? stored.config.connectionId
    : "connectionId" in stored ? stored.connectionId : null;
  let sharedGrant = true;
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (database && accountEmail) {
    try {
      const shared = await database.prepare(
        "SELECT employee_id FROM google_calendar_connections WHERE lower(google_account_email) = ? AND employee_id != ? LIMIT 1",
      )
        .bind(accountEmail.toLowerCase(), employeeId)
        .first<{ employee_id: string }>();
      sharedGrant = Boolean(shared);
    } catch {
      sharedGrant = true;
    }
  }
  if (stored.state !== "ready") {
    return {
      refreshToken: null,
      accountEmail,
      connectionId,
      calendarId,
      hadConnection: true,
      decryptable: false,
      sharedGrant,
      refreshTokenEncrypted: "refreshTokenEncrypted" in stored
        ? stored.refreshTokenEncrypted
        : null,
      connectedByEmail: "connectedByEmail" in stored ? stored.connectedByEmail : null,
      connectedAt: "connectedAt" in stored ? stored.connectedAt : null,
      updatedAt: "updatedAt" in stored ? stored.updatedAt : null,
      snapshotAvailable: stored.snapshotAvailable,
    };
  }
  return {
    refreshToken: stored.config.refreshToken,
    accountEmail,
    connectionId,
    calendarId,
    hadConnection: true,
    decryptable: true,
    sharedGrant,
    refreshTokenEncrypted: stored.refreshTokenEncrypted,
    connectedByEmail: stored.connectedByEmail,
    connectedAt: stored.connectedAt,
    updatedAt: stored.updatedAt,
    snapshotAvailable: true,
  };
}

export async function futureCalendarBookingDependencies(employeeId: StaffId) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return null;
  try {
    const row = await database.prepare(
      "SELECT COUNT(*) AS count FROM bookings WHERE employee_id = ? AND deleted_at IS NULL AND status != 'cancelled' AND starts_at >= ? AND (google_event_id IS NOT NULL OR status IN ('pending_calendar','pending_confirmation','needs_attention'))",
    )
      .bind(employeeId, new Date().toISOString())
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    return null;
  }
}

export async function googleAccountHasStoredConnection(accountEmail: string) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database || !accountEmail) return null;
  try {
    const row = await database.prepare(
      `SELECT employee_id FROM google_calendar_connections
       WHERE lower(google_account_email) = ?
       UNION ALL
       SELECT employee_id FROM google_calendar_cleanup_connections
       WHERE lower(google_account_email) = ?
       LIMIT 1`,
    )
      .bind(accountEmail.toLowerCase(), accountEmail.toLowerCase())
      .first<{ employee_id: string }>();
    return Boolean(row);
  } catch {
    return null;
  }
}

export async function revokeGoogleRefreshToken(refreshToken: string | null) {
  if (!refreshToken) return false;
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  return Boolean(response?.ok || response?.status === 400);
}

async function accessToken(employeeId: StaffId) {
  const config = await calendarConfig(employeeId);
  if (!config) return null;

  return accessTokenForConfig(config);
}

async function accessTokenForConnection(employeeId: StaffId, connectionId: string) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  const runtime = runtimeEnv();
  const encryptionKey = oauthEncryptionKey();
  if (
    !database ||
    !encryptionKey ||
    !runtime.GOOGLE_CLIENT_ID ||
    !runtime.GOOGLE_CLIENT_SECRET
  ) return null;

  const row = await database.prepare(
    `SELECT connection_id,calendar_id,google_account_email,refresh_token_encrypted,connected_by_email,connected_at,updated_at
     FROM google_calendar_connections WHERE employee_id = ? AND connection_id = ?
     UNION ALL
     SELECT id AS connection_id,calendar_id,google_account_email,refresh_token_encrypted,connected_by_email,connected_at,source_updated_at AS updated_at
     FROM google_calendar_cleanup_connections WHERE employee_id = ? AND id = ?
     LIMIT 1`,
  )
    .bind(employeeId, connectionId, employeeId, connectionId)
    .first<StoredCalendarRow>();
  if (!row?.connection_id) return null;
  const refreshToken = await decryptSecret(row.refresh_token_encrypted, encryptionKey);
  return accessTokenForConfig({
    connectionId: row.connection_id,
    calendarId: row.calendar_id,
    accountEmail: row.google_account_email,
    refreshToken,
    clientId: runtime.GOOGLE_CLIENT_ID,
    clientSecret: runtime.GOOGLE_CLIENT_SECRET,
  });
}

async function accessTokenForConfig(config: CalendarConfig): Promise<CalendarAccess> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Google OAuth refresh failed (${response.status})`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Google OAuth response did not include an access token");
  return {
    token: payload.access_token,
    calendarId: config.calendarId,
    connectionId: config.connectionId,
    accountEmail: config.accountEmail,
  };
}

export async function readGoogleBusy(
  employeeId: StaffId,
  startsAt: Date,
  endsAt: Date,
): Promise<BusyPeriod[] | null> {
  const auth = await accessToken(employeeId);
  if (!auth) return null;

  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: startsAt.toISOString(),
      timeMax: endsAt.toISOString(),
      timeZone: SALON_TIME_ZONE,
      items: [{ id: auth.calendarId }],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Google FreeBusy failed (${response.status})`);
  const payload = (await response.json()) as {
    calendars?: Record<string, { busy?: BusyPeriod[]; errors?: unknown[] }>;
  };
  const calendar = payload.calendars?.[auth.calendarId];
  if (calendar?.errors?.length) throw new Error("Google Calendar returned an availability error");
  return calendar?.busy ?? [];
}

async function readGoogleEventBusy(
  auth: CalendarAccess,
  startsAt: Date,
  endsAt: Date,
  excludedEventId: string | null,
) {
  const busy: BusyPeriod[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      timeMin: startsAt.toISOString(),
      timeMax: endsAt.toISOString(),
      singleEvents: "true",
      showDeleted: "false",
      maxResults: "2500",
      timeZone: SALON_TIME_ZONE,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events?${params}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Google events read failed (${response.status})`);
    const payload = await response.json() as {
      items?: Array<{
        id?: string;
        status?: string;
        transparency?: string;
        start?: { date?: string; dateTime?: string };
        end?: { date?: string; dateTime?: string };
      }>;
      nextPageToken?: string;
    };
    for (const item of payload.items ?? []) {
      if (
        (excludedEventId !== null && item.id === excludedEventId) ||
        item.status === "cancelled" ||
        item.transparency === "transparent"
      ) continue;
      const start = item.start?.dateTime ?? item.start?.date;
      const end = item.end?.dateTime ?? item.end?.date;
      if (start && end && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end))) {
        busy.push({ start, end });
      }
    }
    pageToken = payload.nextPageToken;
    if (!pageToken) return busy;
  }
  throw new Error("Google events pagination exceeded the safety limit");
}

export async function readGoogleBusyExcludingEvent(
  employeeId: StaffId,
  startsAt: Date,
  endsAt: Date,
  eventId: string,
  connectionId: string,
): Promise<BusyPeriod[] | null> {
  const exactAuth = await accessTokenForConnection(employeeId, connectionId);
  if (!exactAuth) return null;

  const activeAuth = await accessToken(employeeId);
  if (!activeAuth || activeAuth.connectionId === exactAuth.connectionId) {
    return readGoogleEventBusy(exactAuth, startsAt, endsAt, eventId);
  }

  const sameCalendar =
    activeAuth.accountEmail.toLowerCase() === exactAuth.accountEmail.toLowerCase() &&
    activeAuth.calendarId === exactAuth.calendarId;
  if (sameCalendar) {
    return readGoogleEventBusy(activeAuth, startsAt, endsAt, eventId);
  }

  const [exactBusy, activeBusy] = await Promise.all([
    readGoogleEventBusy(exactAuth, startsAt, endsAt, eventId),
    readGoogleEventBusy(activeAuth, startsAt, endsAt, null),
  ]);
  return [...exactBusy, ...activeBusy];
}

export function googleEventIdForBooking(bookingId: string) {
  return `mh${bookingId.replaceAll("-", "").toLowerCase()}`;
}

function googleBookingEventDetails(input: GoogleBookingInput) {
  return {
    summary: `Marinela Hair Design · ${input.serviceName} · ${input.clientName}`,
    description: [
      `Usluga: ${input.serviceName}`,
      `Stručnjak: ${input.staffName}`,
      `Rezervacija: #${input.bookingId.slice(0, 8)}`,
      "Salon: 095 556 5738",
    ].join("\n"),
    start: { dateTime: input.startsAt.toISOString(), timeZone: SALON_TIME_ZONE },
    end: { dateTime: input.endsAt.toISOString(), timeZone: SALON_TIME_ZONE },
    location: "Ulica kralja Zvonimira 14b, Solin",
    attendees: [{ email: input.clientEmail, displayName: input.clientName }],
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: false,
    transparency: "opaque",
    visibility: "private",
    extendedProperties: {
      private: {
        salonBookingId: input.bookingId,
        employeeId: input.employeeId,
        syncVersion: "1",
      },
    },
  };
}

export async function createGoogleBooking(input: GoogleBookingInput) {
  const auth = await accessToken(input.employeeId);
  if (!auth) return null;
  if (!auth.connectionId) {
    throw new Error("Google Calendar connection must be reconnected before creating events");
  }
  const eventId = googleEventIdForBooking(input.bookingId);
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events`;
  const insertEndpoint = `${endpoint}?sendUpdates=all`;
  const eventDetails = googleBookingEventDetails(input);
  const event = { id: eventId, ...eventDetails };

  let response: Response;
  try {
    response = await fetch(insertEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { uncertain: true as const, id: eventId, connectionId: auth.connectionId };
  }

  if (response.status === 409) {
    const existingResponse = await fetch(`${endpoint}/${eventId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!existingResponse) {
      return { uncertain: true as const, id: eventId, connectionId: auth.connectionId };
    }
    if (!existingResponse.ok) {
      return { uncertain: true as const, id: eventId, connectionId: auth.connectionId };
    }
    const existing = await existingResponse.json().catch(() => null) as {
      id: string;
      etag?: string;
      attendees?: Array<{ email?: string }>;
    } | null;
    if (!existing?.id) {
      return { uncertain: true as const, id: eventId, connectionId: auth.connectionId };
    }
    const attendeeExists = existing.attendees?.some(
      (attendee) => attendee.email?.toLowerCase() === input.clientEmail.toLowerCase(),
    );
    if (attendeeExists) {
      return {
        id: existing.id,
        etag: existing.etag ?? null,
        connectionId: auth.connectionId,
      };
    }
    const patched = await fetch(`${endpoint}/${eventId}?sendUpdates=all`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventDetails),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!patched?.ok) {
      return { uncertain: true as const, id: eventId, connectionId: auth.connectionId };
    }
    response = patched;
  }
  if (!response.ok) {
    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      return { uncertain: true as const, id: eventId, connectionId: auth.connectionId };
    }
    throw new Error(`Google event write failed (${response.status})`);
  }
  const payload = await response.json().catch(() => null) as { id?: string; etag?: string } | null;
  return {
    id: payload?.id ?? eventId,
    etag: payload?.etag ?? null,
    connectionId: auth.connectionId,
  };
}

export async function updateGoogleBooking(
  input: GoogleBookingInput & {
    eventId: string;
    connectionId: string;
  },
) {
  const auth = await accessTokenForConnection(input.employeeId, input.connectionId);
  if (!auth) return null;
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(input.eventId)}?sendUpdates=all`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(googleBookingEventDetails(input)),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return {
      uncertain: true as const,
      id: input.eventId,
      connectionId: input.connectionId,
    };
  }
  if (
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500
  ) {
    return {
      uncertain: true as const,
      id: input.eventId,
      connectionId: input.connectionId,
    };
  }
  if (!response.ok) {
    throw new Error(`Google event update failed (${response.status})`);
  }
  const payload = await response.json().catch(() => null) as {
    id?: string;
    etag?: string;
  } | null;
  return {
    id: payload?.id ?? input.eventId,
    etag: payload?.etag ?? null,
    connectionId: input.connectionId,
  };
}

export async function deleteGoogleBooking(
  employeeId: StaffId,
  eventId: string,
  connectionId?: string | null,
) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  const runtime = runtimeEnv();
  const encryptionKey = oauthEncryptionKey();
  if (
    !database ||
    !encryptionKey ||
    !runtime.GOOGLE_CLIENT_ID ||
    !runtime.GOOGLE_CLIENT_SECRET
  ) {
    return { ok: false, eventDeleted: false, connectionsChecked: 0 };
  }

  let rows: StoredCalendarRow[];
  try {
    const result = await database.prepare(
      `SELECT connection_id,calendar_id,google_account_email,refresh_token_encrypted,connected_by_email,connected_at,updated_at
       FROM google_calendar_connections WHERE employee_id = ?
       UNION ALL
       SELECT id AS connection_id,calendar_id,google_account_email,refresh_token_encrypted,connected_by_email,connected_at,source_updated_at AS updated_at
       FROM google_calendar_cleanup_connections WHERE employee_id = ?`,
    )
      .bind(employeeId, employeeId)
      .all<StoredCalendarRow>();
    rows = result.results;
  } catch {
    return { ok: false, eventDeleted: false, connectionsChecked: 0 };
  }
  if (!rows.length) {
    return { ok: false, eventDeleted: false, connectionsChecked: 0 };
  }

  const exactConnection = connectionId
    ? rows.find((row) => row.connection_id === connectionId)
    : null;
  if (connectionId && !exactConnection) {
    return { ok: false, eventDeleted: false, connectionsChecked: 0 };
  }

  const exactTargetKey = exactConnection
    ? `${exactConnection.google_account_email.toLowerCase()}\u0000${exactConnection.calendar_id}`
    : null;
  const targets = new Map<string, StoredCalendarRow[]>();
  for (const row of rows) {
    const key = `${row.google_account_email.toLowerCase()}\u0000${row.calendar_id}`;
    if (exactTargetKey && key !== exactTargetKey) continue;
    targets.set(key, [...(targets.get(key) ?? []), row]);
  }

  let allTargetsVerified = true;
  let eventDeleted = false;
  for (const credentials of targets.values()) {
    let targetVerified = false;
    for (const row of credentials) {
      try {
        const refreshToken = await decryptSecret(row.refresh_token_encrypted, encryptionKey);
        const auth = await accessTokenForConfig({
          connectionId: row.connection_id,
          calendarId: row.calendar_id,
          accountEmail: row.google_account_email,
          refreshToken,
          clientId: runtime.GOOGLE_CLIENT_ID,
          clientSecret: runtime.GOOGLE_CLIENT_SECRET,
        });
        const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
        const response = await fetch(endpoint, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${auth.token}` },
          signal: AbortSignal.timeout(8_000),
        });
        if (response.ok) {
          targetVerified = true;
          eventDeleted = true;
          break;
        }
        if (response.status === 404 || response.status === 410) {
          targetVerified = true;
          break;
        }
      } catch {
        // Try another credential for the same account/calendar target.
      }
    }
    if (!targetVerified) allTargetsVerified = false;
  }

  return {
    ok: allTargetsVerified,
    eventDeleted,
    connectionsChecked: targets.size,
  };
}

export async function hasGoogleCalendarConnection(employeeId: StaffId) {
  const stored = await storedCalendarConfig(employeeId);
  return stored.state === "ready" || stored.state === "invalid";
}

export async function hasAnyGoogleCalendarConnection(employeeId: StaffId) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return true;
  try {
    const row = await database.prepare(
      `SELECT employee_id FROM google_calendar_connections WHERE employee_id = ?
       UNION ALL
       SELECT employee_id FROM google_calendar_cleanup_connections WHERE employee_id = ?
       LIMIT 1`,
    )
      .bind(employeeId, employeeId)
      .first<{ employee_id: string }>();
    return Boolean(row);
  } catch {
    return true;
  }
}

export async function finalizeGoogleCalendarCleanup(employeeId: StaffId) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return { removed: 0, revoked: 0 };

  let rows: CleanupCalendarRow[];
  try {
    const result = await database.prepare(
      `SELECT id,id AS connection_id,employee_id,calendar_id,google_account_email,refresh_token_encrypted,connected_by_email,
              connected_at,source_updated_at AS updated_at,retired_at
       FROM google_calendar_cleanup_connections
       WHERE employee_id = ? ORDER BY retired_at`,
    )
      .bind(employeeId)
      .all<CleanupCalendarRow>();
    rows = result.results;
  } catch {
    return { removed: 0, revoked: 0 };
  }
  if (!rows.length) return { removed: 0, revoked: 0 };

  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const dependencyGuard = `NOT EXISTS (
    SELECT 1 FROM bookings booking
    WHERE booking.employee_id = cleanup.employee_id
      AND booking.deleted_at IS NULL
      AND booking.status != 'cancelled'
      AND COALESCE(booking.blocked_until, booking.ends_at) >= ?
      AND (
        booking.google_connection_id = cleanup.id
        OR (
          booking.google_connection_id IS NULL
          AND booking.created_at <= cleanup.retired_at
          AND (
            booking.google_event_id IS NOT NULL
            OR booking.status IN ('pending_calendar','pending_confirmation','needs_attention')
          )
        )
      )
  )`;
  const encryptionKey = oauthEncryptionKey();
  let removed = 0;
  let revoked = 0;
  for (const row of rows) {
    const sharedRemoval = await database.prepare(
      `DELETE FROM google_calendar_cleanup_connections AS cleanup
       WHERE cleanup.id = ? AND cleanup.refresh_token_encrypted = ?
         AND (cleanup.revocation_token IS NULL OR cleanup.revocation_started_at < ?)
         AND ${dependencyGuard}
         AND (
           EXISTS (
             SELECT 1 FROM google_calendar_connections active
             WHERE lower(active.google_account_email) = lower(cleanup.google_account_email)
           )
           OR EXISTS (
             SELECT 1 FROM google_calendar_cleanup_connections other
             WHERE lower(other.google_account_email) = lower(cleanup.google_account_email)
               AND other.id != cleanup.id
           )
         )`,
    )
      .bind(row.id, row.refresh_token_encrypted, staleBefore, now)
      .run()
      .catch(() => null);
    if ((sharedRemoval?.meta.changes ?? 0) === 1) {
      removed += 1;
      continue;
    }

    const revocationToken = crypto.randomUUID();
    const claim = await database.prepare(
      `UPDATE google_calendar_cleanup_connections AS cleanup
       SET revocation_token = ?, revocation_started_at = ?
       WHERE cleanup.id = ? AND cleanup.refresh_token_encrypted = ?
         AND (cleanup.revocation_token IS NULL OR cleanup.revocation_started_at < ?)
         AND ${dependencyGuard}
         AND NOT EXISTS (
           SELECT 1 FROM google_calendar_connections active
           WHERE lower(active.google_account_email) = lower(cleanup.google_account_email)
         )
         AND NOT EXISTS (
           SELECT 1 FROM google_calendar_cleanup_connections other
           WHERE lower(other.google_account_email) = lower(cleanup.google_account_email)
             AND other.id != cleanup.id
         )`,
    )
      .bind(revocationToken, now, row.id, row.refresh_token_encrypted, staleBefore, now)
      .run()
      .catch(() => null);
    if ((claim?.meta.changes ?? 0) !== 1) continue;

    let providerRevoked = false;
    if (encryptionKey) {
      try {
        const refreshToken = await decryptSecret(row.refresh_token_encrypted, encryptionKey);
        providerRevoked = await revokeGoogleRefreshToken(refreshToken);
      } catch {
        providerRevoked = false;
      }
    }
    if (providerRevoked) {
      const deletion = await database.prepare(
        "DELETE FROM google_calendar_cleanup_connections WHERE id = ? AND revocation_token = ?",
      )
        .bind(row.id, revocationToken)
        .run()
        .catch(() => null);
      if ((deletion?.meta.changes ?? 0) === 1) {
        removed += 1;
        revoked += 1;
      }
    } else {
      await database.prepare(
        "UPDATE google_calendar_cleanup_connections SET revocation_token = NULL,revocation_started_at = NULL WHERE id = ? AND revocation_token = ?",
      )
        .bind(row.id, revocationToken)
        .run()
        .catch(() => undefined);
    }
  }
  return { removed, revoked };
}

export async function getGoogleCalendarConnectionStatus(employeeId: StaffId) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (database) {
    try {
      const row = await database.prepare(
        "SELECT google_account_email,calendar_id,connected_at FROM google_calendar_connections WHERE employee_id = ? LIMIT 1",
      )
        .bind(employeeId)
        .first<{ google_account_email: string; calendar_id: string; connected_at: string }>();
      if (row) {
        const stored = await storedCalendarConfig(employeeId);
        const healthy = stored.state === "ready";
        return {
          connected: healthy,
          accountEmail: row.google_account_email,
          calendarId: row.calendar_id,
          connectedAt: row.connected_at,
          source: healthy ? "oauth" as const : "invalid" as const,
          cleanupPending: await cleanupConnectionCount(employeeId),
        };
      }
    } catch {
      // Treat unreadable connection state as disconnected in the status UI.
    }
  }
  return {
    connected: false,
    accountEmail: null,
    calendarId: null,
    connectedAt: null,
    source: "none" as const,
    cleanupPending: await cleanupConnectionCount(employeeId),
  };
}

async function cleanupConnectionCount(employeeId: StaffId) {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return 0;
  try {
    const row = await database.prepare(
      "SELECT COUNT(*) AS count FROM google_calendar_cleanup_connections WHERE employee_id = ?",
    )
      .bind(employeeId)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}
