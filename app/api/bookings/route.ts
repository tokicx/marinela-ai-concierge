import { env } from "cloudflare:workers";
import { team } from "../../salon-data";
import { availableTimes } from "../../../lib/availability";
import { deliverBookingNotification } from "../../../lib/booking-notifications";
import {
  createGoogleBooking,
  deleteGoogleBooking,
} from "../../../lib/google-calendar";
import { consumeRateLimit, requestClientIp } from "../../../lib/rate-limit";
import { readJsonBody } from "../../../lib/request-security";
import { loadServices } from "../../../lib/salon-settings";
import { turnstileSetup, verifyTurnstileToken } from "../../../lib/turnstile";
import {
  addLocalMinutes,
  isDateWithinBookingWindow,
  isIsoDate,
  isTime,
  utcSlotKeys,
  zonedLocalToUtc,
} from "../../../lib/time";

export const dynamic = "force-dynamic";

type BookingPayload = {
  serviceId?: unknown;
  staffId?: unknown;
  date?: unknown;
  time?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  note?: unknown;
  consent?: unknown;
  turnstileToken?: unknown;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength)
    : "";
}

function dateLabel(dateLocal: string) {
  return `${dateLocal.split("-").reverse().join(".")}.`;
}

async function bookingRequestFingerprint(input: {
  serviceId: string;
  requestedStaff: string;
  date: string;
  time: string;
  firstName: string;
  lastName: string;
  email: string;
  normalizedPhone: string;
  note: string;
}) {
  const encoded = new TextEncoder().encode(JSON.stringify([
    input.serviceId,
    input.requestedStaff,
    input.date,
    input.time,
    input.firstName,
    input.lastName,
    input.email,
    input.normalizedPhone,
    input.note,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function existingIdempotentBooking(idempotencyKey: string) {
  try {
    return await env.DB.prepare(
      "SELECT id,status,request_fingerprint,service_id,employee_id,date_local,start_time_local,starts_at,ends_at,first_name,last_name,email,phone,note,created_at,updated_at,deleted_at,calendar_sequence FROM bookings WHERE idempotency_key = ? LIMIT 1",
    )
      .bind(idempotencyKey)
      .first<{
        id: string;
        status: string;
        request_fingerprint: string | null;
        service_id: string;
        employee_id: "marinela" | "mia";
        date_local: string;
        start_time_local: string;
        starts_at: string;
        ends_at: string;
        first_name: string;
        last_name: string;
        email: string;
        phone: string;
        note: string | null;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
        calendar_sequence: number;
      }>();
  } catch {
    return null;
  }
}

type ExistingBooking = NonNullable<Awaited<ReturnType<typeof existingIdempotentBooking>>>;

function sameBookingRequest(
  booking: ExistingBooking,
  input: {
    serviceId: string;
    requestedStaff: string;
    date: string;
    time: string;
    firstName: string;
    lastName: string;
    email: string;
    normalizedPhone: string;
    note: string;
    requestFingerprint: string;
  },
) {
  if (booking.request_fingerprint) {
    return booking.request_fingerprint === input.requestFingerprint;
  }
  return (
    booking.service_id === input.serviceId &&
    (input.requestedStaff === "first" || booking.employee_id === input.requestedStaff) &&
    booking.date_local === input.date &&
    booking.start_time_local === input.time &&
    booking.first_name === input.firstName &&
    booking.last_name === input.lastName &&
    booking.email.toLowerCase() === input.email &&
    booking.phone.replace(/\D/g, "") === input.normalizedPhone &&
    (booking.note ?? "") === input.note
  );
}

function existingBookingResponse(booking: ExistingBooking) {
  if (booking.deleted_at || booking.status === "cancelled") {
    return Response.json(
      { error: "Prethodna rezervacija s ovim sigurnosnim ključem više nije aktivna. Započnite novu rezervaciju." },
      { status: 409 },
    );
  }
  if (booking.status === "confirmed") {
    return Response.json({
      bookingId: booking.id,
      confirmed: true,
      message: "Vaš termin je već potvrđen.",
    });
  }
  if (booking.status === "needs_attention") {
    return Response.json(
      {
        code: "BOOKING_NEEDS_ATTENTION",
        confirmed: false,
        error: "Ishod prethodnog pokušaja zahtijeva provjeru salona. Nemojte slati novu rezervaciju za isti termin.",
      },
      { status: 409 },
    );
  }
  return Response.json(
    {
      code: "BOOKING_PROCESSING",
      confirmed: false,
      error: "Prethodni pokušaj još se sigurno obrađuje. Pričekajte trenutak i pokušajte ponovno istim obrascem.",
    },
    { status: 425, headers: { "Retry-After": "3" } },
  );
}

async function repairConfirmedBookingNotifications(
  booking: ExistingBooking,
) {
  if (booking.status !== "confirmed") return;
  const services = await loadServices({ includeInactive: true }).catch(() => []);
  const service = services.find((item) => item.id === booking.service_id);
  const staff = team.find((member) => member.id === booking.employee_id);
  if (!service || !staff) return;
  const now = new Date().toISOString();
  const details = {
    bookingId: booking.id,
    email: booking.email,
    firstName: booking.first_name,
    serviceName: service.name,
    staffName: staff.name,
    dateLabel: dateLabel(booking.date_local),
    time: booking.start_time_local,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    calendarSequence: Math.max(0, booking.calendar_sequence || 0),
  };
  const payloadSnapshot = JSON.stringify(details);
  const jobs = [
    env.DB.prepare(
      `INSERT OR IGNORE INTO notification_jobs
        (id,booking_id,type,due_at,status,attempts,provider_id,last_error,sent_at,created_at,updated_at,payload_snapshot)
       SELECT ?,id,'confirmation',?,'pending',0,NULL,NULL,NULL,?,?,?
       FROM bookings
       WHERE id = ? AND status = 'confirmed' AND deleted_at IS NULL
         AND operation_token IS NULL AND updated_at = ? AND starts_at = ?`,
    ).bind(
      crypto.randomUUID(),
      booking.created_at,
      now,
      now,
      payloadSnapshot,
      booking.id,
      booking.updated_at,
      booking.starts_at,
    ),
  ];
  const reminderAt = new Date(Date.parse(booking.starts_at) - 24 * 60 * 60 * 1000);
  if (reminderAt.getTime() > Date.now()) {
    jobs.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO notification_jobs
          (id,booking_id,type,due_at,status,attempts,provider_id,last_error,sent_at,created_at,updated_at,payload_snapshot)
         SELECT ?,id,'reminder',?,'pending',0,NULL,NULL,NULL,?,?,?
         FROM bookings
         WHERE id = ? AND status = 'confirmed' AND deleted_at IS NULL
           AND operation_token IS NULL AND updated_at = ? AND starts_at = ?`,
      ).bind(
        crypto.randomUUID(),
        reminderAt.toISOString(),
        now,
        now,
        payloadSnapshot,
        booking.id,
        booking.updated_at,
        booking.starts_at,
      ),
    );
  }
  await env.DB.batch(jobs).catch(() => undefined);
}

async function rollbackPendingBooking(bookingId: string, operationToken: string) {
  const results = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM slot_claims
       WHERE booking_id = ?
         AND EXISTS (
           SELECT 1 FROM bookings
           WHERE id = ? AND status = 'pending_calendar' AND operation_token = ?
         )`,
    ).bind(bookingId, bookingId, operationToken),
    env.DB.prepare(
      "DELETE FROM bookings WHERE id = ? AND status = 'pending_calendar' AND operation_token = ?",
    ).bind(bookingId, operationToken),
  ]).catch(() => null);
  return (results?.[1]?.meta.changes ?? 0) === 1;
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    fetchSite === "cross-site"
  ) {
    return Response.json({ error: "Neispravan izvor zahtjeva." }, { status: 403 });
  }

  const clientIp = requestClientIp(request);
  const ipAllowed = await consumeRateLimit({
    scope: "booking_ip",
    identifier: clientIp,
    limit: 20,
    windowSeconds: 60 * 60,
    failureMode: "deny",
  });
  if (!ipAllowed) {
    return Response.json(
      { error: "Previše pokušaja rezervacije. Pričekajte prije ponovnog pokušaja ili nazovite salon." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const idempotencyKey = clean(request.headers.get("Idempotency-Key"), 120);
  if (idempotencyKey.length < 8) {
    return Response.json({ error: "Nedostaje sigurnosni ključ rezervacije." }, { status: 400 });
  }

  const parsedBody = await readJsonBody<BookingPayload>(request, 12_288);
  if (!parsedBody.ok) {
    return Response.json({ error: parsedBody.error }, { status: parsedBody.status });
  }
  const payload = parsedBody.value;

  const serviceId = clean(payload.serviceId, 80);
  const requestedStaff = clean(payload.staffId, 20);
  const date = clean(payload.date, 10);
  const time = clean(payload.time, 5);
  const firstName = clean(payload.firstName, 80);
  const lastName = clean(payload.lastName, 80);
  const email = clean(payload.email, 160).toLowerCase();
  const phone = clean(payload.phone, 40);
  const note = clean(payload.note, 1000);
  const turnstileToken = clean(payload.turnstileToken, 2_048);
  const normalizedPhone = phone.replace(/\D/g, "");
  const services = await loadServices({ strict: true }).catch(() => null);
  if (!services) {
    return Response.json({ error: "Katalog usluga trenutačno nije dostupan." }, { status: 503 });
  }
  const service = services.find((item) => item.id === serviceId);

  if (
    !service ||
    !isIsoDate(date) ||
    !isTime(time) ||
    !["marinela", "mia", "first"].includes(requestedStaff) ||
    !firstName ||
    !lastName ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    normalizedPhone.length < 8 ||
    payload.consent !== true
  ) {
    return Response.json(
      { error: "Provjerite uslugu, termin, kontaktne podatke i privolu." },
      { status: 400 },
    );
  }

  const requestFingerprint = await bookingRequestFingerprint({
    serviceId,
    requestedStaff,
    date,
    time,
    firstName,
    lastName,
    email,
    normalizedPhone,
    note,
  });

  const duplicate = await existingIdempotentBooking(idempotencyKey);
  if (duplicate) {
    if (!sameBookingRequest(duplicate, {
      serviceId,
      requestedStaff,
      date,
      time,
      firstName,
      lastName,
      email,
      normalizedPhone,
      note,
      requestFingerprint,
    })) {
      return Response.json(
        { error: "Sigurnosni ključ rezervacije već je iskorišten za drugi zahtjev." },
        { status: 409 },
      );
    }
    await repairConfirmedBookingNotifications(duplicate);
    return existingBookingResponse(duplicate);
  }

  const turnstile = turnstileSetup();
  if (turnstile.partial || (turnstile.required && !turnstile.configured)) {
    return Response.json(
      { error: "Sigurnosna provjera rezervacije trenutačno nije dostupna." },
      { status: 503 },
    );
  }
  if (
    turnstile.configured &&
    !(await verifyTurnstileToken(turnstileToken, clientIp))
  ) {
    return Response.json(
      { error: "Sigurnosna provjera nije uspjela. Osvježite obrazac i pokušajte ponovno." },
      { status: 403 },
    );
  }

  const [emailAllowed, phoneAllowed] = await Promise.all([
    consumeRateLimit({
      scope: "booking_email",
      identifier: email,
      limit: 6,
      windowSeconds: 60 * 60,
      failureMode: "deny",
    }),
    consumeRateLimit({
      scope: "booking_phone",
      identifier: normalizedPhone,
      limit: 6,
      windowSeconds: 60 * 60,
      failureMode: "deny",
    }),
  ]);
  if (!emailAllowed || !phoneAllowed) {
    return Response.json(
      { error: "Previše pokušaja rezervacije. Pričekajte prije ponovnog pokušaja ili nazovite salon." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const startsAt = zonedLocalToUtc(date, time);
  const now = new Date();
  if (startsAt <= now || !isDateWithinBookingWindow(date, now)) {
    return Response.json({ error: "Odabrani datum nije unutar raspoloživog razdoblja." }, { status: 400 });
  }

  const availability = await availableTimes(
    service,
    requestedStaff as "marinela" | "mia" | "first",
    date,
  ).catch(() => null);
  const resolvedStaff =
    availability?.employeeByTime[time] ??
    (requestedStaff === "first" ? undefined : requestedStaff);
  if (
    !availability ||
    !availability.times.includes(time) ||
    !resolvedStaff ||
    !service.staffIds.includes(resolvedStaff as "marinela" | "mia")
  ) {
    return Response.json(
      { code: "SLOT_UNAVAILABLE", error: "Termin je upravo zauzet. Odaberite drugo vrijeme." },
      { status: 409 },
    );
  }

  const employeeId = resolvedStaff as "marinela" | "mia";
  const endLocal = addLocalMinutes(time, service.duration);
  const endsAt = zonedLocalToUtc(date, endLocal);
  const blockedUntil = zonedLocalToUtc(
    date,
    addLocalMinutes(time, service.duration + service.buffer),
  );
  const bookingId = crypto.randomUUID();
  const operationToken = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const claimExpiry = blockedUntil.toISOString();
  const claimKeys = utcSlotKeys(startsAt, service.duration, service.buffer);

  try {
    const statements = [
      env.DB.prepare(
        `DELETE FROM slot_claims
         WHERE expires_at IS NOT NULL AND expires_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM bookings existing
             WHERE existing.id = slot_claims.booking_id
               AND existing.deleted_at IS NULL
               AND existing.status IN ('pending_calendar','pending_confirmation','confirmed','needs_attention')
               AND COALESCE(existing.blocked_until, existing.ends_at) > ?
           )`,
      ).bind(createdAt, createdAt),
      env.DB.prepare(
        `INSERT INTO bookings (
           id,idempotency_key,request_fingerprint,service_id,employee_id,date_local,start_time_local,end_time_local,
           starts_at,ends_at,blocked_until,status,first_name,last_name,email,phone,note,
           operation_token,operation_action,operation_started_at,created_at,updated_at
         )
         SELECT ?,?,?,?,?,?,?,?,?,?,?,'pending_calendar',?,?,?,?,?,?,'create',?,?,?
         WHERE NOT EXISTS (
           SELECT 1 FROM bookings existing
           WHERE existing.employee_id = ?
             AND existing.deleted_at IS NULL
             AND existing.status IN ('pending_calendar','pending_confirmation','confirmed','needs_attention')
             AND existing.starts_at < ?
             AND COALESCE(existing.blocked_until, existing.ends_at) > ?
         )`,
      ).bind(
        bookingId,
        idempotencyKey,
        requestFingerprint,
        service.id,
        employeeId,
        date,
        time,
        endLocal,
        startsAt.toISOString(),
        endsAt.toISOString(),
        blockedUntil.toISOString(),
        firstName,
        lastName,
        email,
        phone,
        note || null,
        operationToken,
        createdAt,
        createdAt,
        createdAt,
        employeeId,
        blockedUntil.toISOString(),
        startsAt.toISOString(),
      ),
      ...claimKeys.map((slotKey) =>
        env.DB.prepare(
          `INSERT INTO slot_claims (employee_id,slot_key,booking_id,expires_at)
           SELECT ?,?,?,?
           WHERE EXISTS (
             SELECT 1 FROM bookings
             WHERE id = ? AND operation_token = ? AND status = 'pending_calendar' AND deleted_at IS NULL
           )`,
        ).bind(employeeId, slotKey, bookingId, claimExpiry, bookingId, operationToken),
      ),
    ];
    const results = await env.DB.batch(statements);
    if ((results[1]?.meta.changes ?? 0) !== 1) {
      throw new Error("booking_slot_conflict");
    }
  } catch {
    const existing = await existingIdempotentBooking(idempotencyKey);
    if (existing) {
      if (sameBookingRequest(existing, {
        serviceId,
        requestedStaff,
        date,
        time,
        firstName,
        lastName,
        email,
        normalizedPhone,
        note,
        requestFingerprint,
      })) {
        await repairConfirmedBookingNotifications(existing);
        return existingBookingResponse(existing);
      }
      return Response.json(
        { error: "Sigurnosni ključ rezervacije već je iskorišten za drugi zahtjev." },
        { status: 409 },
      );
    }
    return Response.json(
      { code: "SLOT_UNAVAILABLE", error: "Termin je upravo zauzet. Odaberite drugo vrijeme." },
      { status: 409 },
    );
  }

  const staff = team.find((member) => member.id === employeeId)!;
  let googleEvent: { id: string; etag: string | null; connectionId: string } | null = null;
  let uncertainGoogleEvent: { id: string; connectionId: string } | null = null;
  try {
    const calendarWrite = await createGoogleBooking({
      employeeId,
      bookingId,
      serviceName: service.name,
      clientName: `${firstName} ${lastName}`,
      clientEmail: email,
      staffName: staff.name,
      startsAt,
      endsAt,
    });
    if (calendarWrite && "uncertain" in calendarWrite) {
      uncertainGoogleEvent = calendarWrite;
    } else {
      googleEvent = calendarWrite;
    }
  } catch {
    googleEvent = null;
  }

  if (uncertainGoogleEvent) {
    await env.DB.prepare(
      `UPDATE bookings
       SET status = 'needs_attention', google_event_id = ?, google_etag = NULL,
           google_connection_id = ?, updated_at = ?
       WHERE id = ? AND status = 'pending_calendar' AND operation_token = ?`,
    )
      .bind(
        uncertainGoogleEvent.id,
        uncertainGoogleEvent.connectionId,
        new Date().toISOString(),
        bookingId,
        operationToken,
      )
      .run()
      .catch(() => undefined);
    return Response.json(
      { error: "Google kalendar još potvrđuje ishod. Termin ostaje blokiran za sigurnu provjeru salona." },
      { status: 502 },
    );
  }

  if (!googleEvent) {
    const rolledBack = await rollbackPendingBooking(bookingId, operationToken);
    if (!rolledBack) {
      await env.DB.prepare(
        `UPDATE bookings
         SET status = 'needs_attention', updated_at = ?
         WHERE id = ? AND status = 'pending_calendar' AND operation_token = ?`,
      )
        .bind(new Date().toISOString(), bookingId, operationToken)
        .run()
        .catch(() => undefined);
      return Response.json(
        { error: "Termin je privremeno blokiran zbog prekida sinkronizacije. Salon će provjeriti stanje; nemojte ponovno slati isti zahtjev." },
        { status: 502 },
      );
    }
    return Response.json(
      { error: "Google kalendar trenutačno nije potvrdio upis. Rezervacija nije stvorena i možete pokušati ponovno." },
      { status: 503 },
    );
  }

  const status = "confirmed";
  const reminderAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  const reminderDueAt = reminderAt > now ? reminderAt.toISOString() : null;
  const notificationDetails = {
    bookingId,
    email,
    firstName,
    serviceName: service.name,
    staffName: staff.name,
    dateLabel: dateLabel(date),
    time,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    calendarSequence: 0,
  };
  const payloadSnapshot = JSON.stringify(notificationDetails);
  const finalizedAt = new Date().toISOString();
  let finalization;
  let finalizationFailed = false;
  try {
    const statements = [
      env.DB.prepare(
        `UPDATE bookings
         SET status = ?, google_event_id = ?, google_etag = ?, google_connection_id = ?,
             updated_at = ?
         WHERE id = ? AND status = 'pending_calendar' AND deleted_at IS NULL AND operation_token = ?
           AND (
             ? IS NULL
             OR EXISTS (
               SELECT 1 FROM google_calendar_connections connection
               WHERE connection.connection_id = ? AND connection.employee_id = ?
             )
           )`,
      ).bind(
        status,
        googleEvent?.id ?? null,
        googleEvent?.etag ?? null,
        googleEvent?.connectionId ?? null,
        finalizedAt,
        bookingId,
        operationToken,
        googleEvent?.connectionId ?? null,
        googleEvent?.connectionId ?? null,
        employeeId,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO notification_jobs
          (id,booking_id,type,due_at,status,attempts,provider_id,last_error,sent_at,created_at,updated_at,payload_snapshot)
         SELECT ?,id,'confirmation',?,'pending',0,NULL,NULL,NULL,?,?,?
         FROM bookings WHERE id = ? AND status = 'confirmed' AND operation_token = ?`,
      ).bind(crypto.randomUUID(), createdAt, finalizedAt, finalizedAt, payloadSnapshot, bookingId, operationToken),
      ...(reminderDueAt
        ? [env.DB.prepare(
            `INSERT OR IGNORE INTO notification_jobs
              (id,booking_id,type,due_at,status,attempts,provider_id,last_error,sent_at,created_at,updated_at,payload_snapshot)
             SELECT ?,id,'reminder',?,'pending',0,NULL,NULL,NULL,?,?,?
             FROM bookings WHERE id = ? AND status = 'confirmed' AND operation_token = ?`,
          ).bind(crypto.randomUUID(), reminderDueAt, finalizedAt, finalizedAt, payloadSnapshot, bookingId, operationToken)]
        : []),
    ];
    [finalization] = await env.DB.batch(statements);
  } catch {
    finalizationFailed = true;
  }

  let finalizationCommitted = (finalization?.meta.changes ?? 0) === 1;
  if (!finalizationCommitted) {
    const current = await env.DB.prepare(
      `SELECT status,updated_at,deleted_at,google_event_id,google_etag,google_connection_id,
              operation_token,operation_action
       FROM bookings WHERE id = ? LIMIT 1`,
    )
      .bind(bookingId)
      .first<{
        status: string;
        updated_at: string;
        deleted_at: string | null;
        google_event_id: string | null;
        google_etag: string | null;
        google_connection_id: string | null;
        operation_token: string | null;
        operation_action: string | null;
      }>()
      .catch(() => null);
    finalizationCommitted = Boolean(
      current &&
      current.status === status &&
      current.updated_at === finalizedAt &&
      current.deleted_at === null &&
      current.google_event_id === googleEvent.id &&
      current.google_etag === googleEvent.etag &&
      current.google_connection_id === googleEvent.connectionId &&
      current.operation_token === operationToken &&
      current.operation_action === "create"
    );
  }

  if (!finalizationCommitted && finalizationFailed) {
    if (googleEvent) {
      await env.DB.prepare(
        `UPDATE bookings
         SET status = 'needs_attention', google_event_id = ?, google_etag = ?,
             google_connection_id = ?, updated_at = ?
         WHERE id = ? AND status = 'pending_calendar' AND operation_token = ?`,
      )
        .bind(
          googleEvent.id,
          googleEvent.etag,
          googleEvent.connectionId,
          new Date().toISOString(),
          bookingId,
          operationToken,
        )
        .run()
        .catch(() => undefined);
    }
    return Response.json(
      { error: "Rezervacija ostaje blokirana za sigurnu provjeru salona. Molimo nemojte slati novi zahtjev za isti termin." },
      { status: 502 },
    );
  }

  if (!finalizationCommitted) {
    if (googleEvent) {
      const compensation = await deleteGoogleBooking(
        employeeId,
        googleEvent.id,
        googleEvent.connectionId,
      )
        .catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }));
      if (!compensation.ok) {
        await env.DB.prepare(
          `UPDATE bookings
           SET status = 'needs_attention', google_event_id = ?, google_etag = ?, google_connection_id = ?,
               operation_token = NULL, operation_action = NULL, operation_started_at = NULL, updated_at = ?
           WHERE id = ? AND status = 'pending_calendar' AND operation_token = ?`,
        )
          .bind(
            googleEvent.id,
            googleEvent.etag,
            googleEvent.connectionId,
            new Date().toISOString(),
            bookingId,
            operationToken,
          )
          .run();
        return Response.json(
          { error: "Termin zahtijeva ručnu provjeru kalendara. Salon je obaviješten i termin ostaje blokiran." },
          { status: 502 },
        );
      }
      const rolledBack = await rollbackPendingBooking(bookingId, operationToken);
      return Response.json(
        {
          ...(rolledBack ? { code: "SLOT_UNAVAILABLE" } : {}),
          error: rolledBack
            ? "Rezervaciju nije moguće dovršiti jer je stanje termina promijenjeno. Odaberite drugi termin."
            : "Termin zahtijeva ručnu provjeru jer završno stanje nije moguće sigurno potvrditi.",
        },
        { status: rolledBack ? 409 : 502 },
      );
    } else {
      return Response.json(
        {
          code: "SLOT_UNAVAILABLE",
          error: "Rezervaciju nije moguće dovršiti jer je stanje termina promijenjeno. Odaberite drugi termin.",
        },
        { status: 409 },
      );
    }
  }
  const emailDelivery = await deliverBookingNotification({
    details: notificationDetails,
    type: "confirmation",
    dueAt: createdAt,
    bookingOperationToken: operationToken,
  }).catch(() => ({ accepted: false, configured: true, state: "pending" as const }));

  if (reminderDueAt) {
    await deliverBookingNotification({
      details: notificationDetails,
      type: "reminder",
      dueAt: reminderDueAt,
      scheduledAt: reminderDueAt,
      bookingOperationToken: operationToken,
    }).catch(() => undefined);
  }

  await env.DB.prepare(
    `UPDATE bookings
     SET operation_token = NULL, operation_action = NULL, operation_started_at = NULL
     WHERE id = ? AND operation_token = ? AND operation_action = 'create'`,
  )
    .bind(bookingId, operationToken)
    .run()
    .catch(() => undefined);

  return Response.json(
    {
      bookingId,
      confirmed: true,
      emailAccepted: emailDelivery.accepted,
      calendarSynced: true,
      calendarInviteSent: true,
      message: emailDelivery.accepted
        ? "Termin je odmah potvrđen i upisan u kalendar. Potvrda je poslana na vaš e-mail."
        : "Termin je odmah potvrđen i upisan u kalendar. Google Calendar pozivnica poslana je na vaš e-mail.",
    },
    { status: 201 },
  );
}
