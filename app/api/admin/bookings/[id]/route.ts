import { env } from "cloudflare:workers";
import { team } from "../../../../salon-data";
import { availableTimes } from "../../../../../lib/availability";
import {
  canAccessEmployee,
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
  writeAdminAudit,
} from "../../../../../lib/admin-auth";
import {
  cancelBookingReminders,
  deliverBookingNotification,
  type BookingNotificationDetails,
} from "../../../../../lib/booking-notifications";
import {
  createGoogleBooking,
  deleteGoogleBooking,
  finalizeGoogleCalendarCleanup,
  googleEventIdForBooking,
  hasAnyGoogleCalendarConnection,
  hasGoogleCalendarConnection,
  updateGoogleBooking,
} from "../../../../../lib/google-calendar";
import { readJsonBody } from "../../../../../lib/request-security";
import { loadServices } from "../../../../../lib/salon-settings";
import {
  addLocalMinutes,
  isDateWithinBookingWindow,
  isTime,
  utcSlotKeys,
  zonedLocalToUtc,
} from "../../../../../lib/time";

export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  service_id: string;
  employee_id: "marinela" | "mia";
  date_local: string;
  start_time_local: string;
  starts_at: string;
  ends_at: string;
  blocked_until: string | null;
  status: string;
  first_name: string;
  last_name: string;
  email: string;
  google_event_id: string | null;
  google_etag: string | null;
  google_connection_id: string | null;
  created_at: string;
  updated_at: string;
  operation_action: string | null;
  operation_started_at: string | null;
  calendar_sequence: number;
};

type BookingAction = "confirm" | "reschedule" | "cancel" | "delete";

const bookingFields =
  "id,service_id,employee_id,date_local,start_time_local,starts_at,ends_at,blocked_until,status,first_name,last_name,email,google_event_id,google_etag,google_connection_id,created_at,updated_at,operation_action,operation_started_at,calendar_sequence";

function dateLabel(dateLocal: string) {
  return `${dateLocal.split("-").reverse().join(".")}.`;
}

function prepareNotificationJob(input: {
  bookingId: string;
  operationToken: string;
  type: "confirmation" | "reminder" | "reschedule" | "cancellation";
  dueAt: string;
  createdAt: string;
  bookingStatus: "confirmed" | "cancelled";
  expectedUpdatedAt: string;
  expectedStartsAt?: string;
  details: BookingNotificationDetails;
}) {
  const jobId = crypto.randomUUID();
  return env.DB.prepare(
    `INSERT OR IGNORE INTO notification_jobs
      (id,booking_id,type,due_at,status,attempts,provider_id,last_error,sent_at,created_at,updated_at,delivery_key,payload_snapshot)
     SELECT ?,id,?,?,'pending',0,NULL,NULL,NULL,?,?,?,?
     FROM bookings
     WHERE id = ? AND operation_token = ? AND status = ? AND updated_at = ?
       AND (? IS NULL OR starts_at = ?)`,
  ).bind(
    jobId,
    input.type,
    input.dueAt,
    input.createdAt,
    input.createdAt,
    input.type === "reschedule" ? jobId : null,
    JSON.stringify(input.details),
    input.bookingId,
    input.operationToken,
    input.bookingStatus,
    input.expectedUpdatedAt,
    input.expectedStartsAt ?? null,
    input.expectedStartsAt ?? null,
  );
}

async function claimBookingOperation(booking: BookingRow, action: BookingAction) {
  const token = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE bookings
     SET operation_token = ?,operation_action = ?,operation_started_at = ?
     WHERE id = ? AND updated_at = ? AND deleted_at IS NULL
       AND (operation_token IS NULL OR operation_started_at IS NULL OR operation_started_at < ?)
       AND NOT EXISTS (
         SELECT 1 FROM notification_jobs job
         WHERE job.booking_id = bookings.id AND job.status = 'sending' AND job.updated_at >= ?
       )
     RETURNING id`,
  )
    .bind(token, action, startedAt, booking.id, booking.updated_at, staleBefore, staleBefore)
    .first<{ id: string }>();
  return claimed ? token : null;
}

async function releaseBookingOperation(bookingId: string, token: string) {
  await env.DB.prepare(
    "UPDATE bookings SET operation_token = NULL,operation_action = NULL,operation_started_at = NULL WHERE id = ? AND operation_token = ?",
  ).bind(bookingId, token).run();
}

async function markBookingNeedsAttention(bookingId: string, token: string) {
  await env.DB.prepare(
    "UPDATE bookings SET status = 'needs_attention', updated_at = ? WHERE id = ? AND operation_token = ? AND deleted_at IS NULL AND status != 'cancelled'",
  )
    .bind(new Date().toISOString(), bookingId, token)
    .run();
}

function calendarCreationIsFresh(booking: BookingRow) {
  if (booking.operation_action !== "create") return false;
  const startedAt = Date.parse(booking.operation_started_at ?? "");
  return Number.isFinite(startedAt) && startedAt >= Date.now() - 10 * 60 * 1000;
}

async function releaseRescheduleClaims(
  bookingId: string,
  operationToken: string,
  slotKeys: string[],
) {
  if (!slotKeys.length) return;
  await env.DB.prepare(
    `DELETE FROM slot_claims
     WHERE booking_id = ? AND slot_key IN (${slotKeys.map(() => "?").join(",")})
       AND EXISTS (
         SELECT 1 FROM bookings WHERE id = ? AND operation_token = ?
       )`,
  )
    .bind(bookingId, ...slotKeys, bookingId, operationToken)
    .run();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSalonUser();
  if (!user) return Response.json({ error: "Prijava je obavezna." }, { status: 401 });
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan zahtjev." }, { status: 403 });
  }
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!isDateWithinBookingWindow(date)) {
    return Response.json({ error: "Odaberite datum unutar sljedećih 30 dana." }, { status: 400 });
  }
  const { id } = await params;
  const booking = await env.DB.prepare(
    `SELECT ${bookingFields} FROM bookings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(id).first<BookingRow>();
  if (!booking) return Response.json({ error: "Termin nije pronađen." }, { status: 404 });
  if (!canAccessEmployee(user, booking.employee_id)) {
    return Response.json({ error: "Nemate pristup ovom terminu." }, { status: 403 });
  }
  if (booking.status !== "confirmed") {
    return Response.json({ error: "Samo potvrđenom terminu moguće je promijeniti vrijeme." }, { status: 409 });
  }
  const services = await loadServices({ includeInactive: true });
  const service = services.find((item) => item.id === booking.service_id);
  if (!service) return Response.json({ error: "Usluga termina nije dostupna." }, { status: 409 });
  const availability = await availableTimes(
    service,
    booking.employee_id,
    date,
    {
      excludeBookingId: booking.id,
      ...(booking.google_event_id && booking.google_connection_id
        ? {
            excludeGoogleEvent: {
              eventId: booking.google_event_id,
              connectionId: booking.google_connection_id,
            },
          }
        : {}),
    },
  ).catch(() => null);
  if (!availability?.checked) {
    return Response.json({ error: "Termine trenutačno nije moguće pouzdano provjeriti." }, { status: 503 });
  }
  return Response.json(availability, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSalonUser();
  if (!user) return Response.json({ error: "Prijava je obavezna." }, { status: 401 });
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan zahtjev." }, { status: 403 });
  }

  const parsedBody = await readJsonBody<{ action?: unknown }>(request, 2_048);
  if (!parsedBody.ok) {
    return Response.json({ error: parsedBody.error }, { status: parsedBody.status });
  }
  const action = typeof parsedBody.value.action === "string" ? parsedBody.value.action : "";
  if (action !== "confirm" && action !== "cancel") {
    return Response.json({ error: "Nepoznata radnja." }, { status: 400 });
  }

  const { id } = await params;
  const booking = await env.DB.prepare(
    `SELECT ${bookingFields} FROM bookings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(id)
    .first<BookingRow>();
  if (!booking) return Response.json({ error: "Termin nije pronađen." }, { status: 404 });
  if (!canAccessEmployee(user, booking.employee_id)) {
    return Response.json({ error: "Nemate pristup ovom terminu." }, { status: 403 });
  }
  if (calendarCreationIsFresh(booking)) {
    return Response.json(
      { error: "Rezervacija se još sinkronizira s kalendarom. Pričekajte trenutak i osvježite pregled." },
      { status: 409 },
    );
  }
  if (action === "confirm" && booking.status === "confirmed") {
    return Response.json({ ok: true, status: "confirmed", alreadyCompleted: true });
  }
  if (action === "cancel" && booking.status === "cancelled") {
    return Response.json({ ok: true, status: "cancelled", alreadyCompleted: true });
  }
  if (action === "confirm" && booking.status === "cancelled") {
    return Response.json({ error: "Otkazani termin nije moguće potvrditi." }, { status: 409 });
  }

  const services = await loadServices({ includeInactive: true });
  const service = services.find((item) => item.id === booking.service_id);
  const staff = team.find((member) => member.id === booking.employee_id);
  if (!service || !staff) {
    return Response.json({ error: "Podaci termina nisu potpuni." }, { status: 409 });
  }
  const operationToken = await claimBookingOperation(booking, action);
  if (!operationToken) {
    return Response.json(
      { error: "Druga radnja nad ovim terminom već je u tijeku. Osvježite pregled i pokušajte ponovno." },
      { status: 409 },
    );
  }
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
  };
  const recoveringUncertainCreate = booking.operation_action === "create";
  let retainUncertainCreateOperation = false;
  let cancellationCleanupCompleted = false;

  try {
    if (action === "confirm") {
      let googleEvent: { id: string; etag: string | null; connectionId: string } | null = null;
      const calendarConnected = await hasGoogleCalendarConnection(booking.employee_id);
      let priorCalendarVerified = false;
      let uncertainConnectionIsActive = false;
      if (
        recoveringUncertainCreate &&
        booking.google_event_id &&
        booking.google_connection_id
      ) {
        uncertainConnectionIsActive = await env.DB.prepare(
          "SELECT employee_id FROM google_calendar_connections WHERE employee_id = ? AND connection_id = ? LIMIT 1",
        )
          .bind(booking.employee_id, booking.google_connection_id)
          .first<{ employee_id: string }>()
          .then(Boolean)
          .catch(() => false);
        if (!uncertainConnectionIsActive) {
          const cleanup = await deleteGoogleBooking(
            booking.employee_id,
            booking.google_event_id,
            booking.google_connection_id,
          ).catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }));
          if (!cleanup.ok) {
            await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
            return Response.json(
              { error: "Neizvjestan kalendarski događaj nije moguće sigurno očistiti. Ponovno povežite odgovarajući račun i pokušajte ponovno." },
              { status: 502 },
            );
          }
          priorCalendarVerified = true;
        }
      }
      if (booking.google_event_id && !recoveringUncertainCreate) {
        const cleanup = await deleteGoogleBooking(
          booking.employee_id,
          booking.google_event_id,
          booking.google_connection_id,
        )
          .catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }));
        if (!cleanup.ok) {
          await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
          return Response.json(
            { error: "Prethodni kalendarski događaj nije moguće sigurno provjeriti i obnoviti. Ponovno povežite odgovarajući račun i pokušajte ponovno." },
            { status: 502 },
          );
        }
        priorCalendarVerified = true;
      }
      if (!googleEvent) {
        const anyCalendarConnection = await hasAnyGoogleCalendarConnection(booking.employee_id);
        if (
          anyCalendarConnection &&
          !priorCalendarVerified &&
          !uncertainConnectionIsActive
        ) {
          const cleanup = await deleteGoogleBooking(
            booking.employee_id,
            googleEventIdForBooking(booking.id),
          ).catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }));
          if (!cleanup.ok) {
            await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
            return Response.json(
              { error: "Postojeći kalendarski događaj nije moguće sigurno provjeriti. Ponovno povežite odgovarajući račun i pokušajte ponovno." },
              { status: 502 },
            );
          }
        }
        const calendarWrite = await createGoogleBooking({
          employeeId: booking.employee_id,
          bookingId: booking.id,
          serviceName: service.name,
          clientName: `${booking.first_name} ${booking.last_name}`,
          clientEmail: booking.email,
          staffName: staff.name,
          startsAt: new Date(booking.starts_at),
          endsAt: new Date(booking.ends_at),
        }).catch(() => null);
        if (calendarWrite && "uncertain" in calendarWrite) {
          const uncertainAt = new Date().toISOString();
          retainUncertainCreateOperation = true;
          await env.DB.prepare(
            `UPDATE bookings
             SET status = 'needs_attention', google_event_id = ?, google_etag = NULL,
                 google_connection_id = ?, operation_action = 'create',
                 operation_started_at = ?, updated_at = ?
             WHERE id = ? AND operation_token = ? AND deleted_at IS NULL`,
          )
            .bind(
              calendarWrite.id,
              calendarWrite.connectionId,
              uncertainAt,
              uncertainAt,
              booking.id,
              operationToken,
            )
            .run();
          return Response.json(
            { error: "Google kalendar još potvrđuje ishod. Termin ostaje blokiran za sigurnu provjeru." },
            { status: 502 },
          );
        }
        googleEvent = calendarWrite;
      }
      if (calendarConnected && !googleEvent) {
        await writeAdminAudit({
          actorEmail: user.email,
          action: "booking_confirmation_failed",
          targetType: "booking",
          targetId: booking.id,
          details: JSON.stringify({ employeeId: booking.employee_id, reason: "google_calendar_write_failed" }),
        });
        return Response.json(
          { error: "Termin nije potvrđen jer ga nije moguće upisati u povezani Google kalendar. Pokušajte ponovno." },
          { status: 502 },
        );
      }

      const now = new Date().toISOString();
      const calendarSequence = booking.calendar_sequence + 1;
      const reminderAt = new Date(new Date(booking.starts_at).getTime() - 24 * 60 * 60 * 1000);
      const reminderDueAt = reminderAt.getTime() > Date.now() ? reminderAt.toISOString() : null;
      const claimStartsAt = new Date(booking.starts_at);
      const storedBlockedUntil = new Date(booking.blocked_until ?? "");
      const storedClaimMinutes = Math.ceil(
        (storedBlockedUntil.getTime() - claimStartsAt.getTime()) / 60_000,
      );
      const currentClaimKeys = utcSlotKeys(
        claimStartsAt,
        Number.isFinite(storedClaimMinutes) && storedClaimMinutes > 0
          ? storedClaimMinutes
          : service.duration + service.buffer,
        0,
      );
      const currentClaimPlaceholders = currentClaimKeys.map(() => "?").join(",");
      let result: { meta: { changes?: number } } | null = null;
      try {
        [result] = await env.DB.batch([
          env.DB.prepare(
        `UPDATE bookings
         SET status = 'confirmed', google_event_id = ?, google_etag = ?, google_connection_id = ?,
             calendar_sequence = calendar_sequence + 1, updated_at = ?
         WHERE id = ? AND operation_token = ?
           AND (
             ? IS NULL
             OR EXISTS (
               SELECT 1 FROM google_calendar_connections connection
               WHERE connection.connection_id = ? AND connection.employee_id = bookings.employee_id
             )
           )`,
        ).bind(
        googleEvent?.id ?? null,
        googleEvent?.etag ?? null,
        googleEvent?.connectionId ?? null,
        now,
        booking.id,
        operationToken,
        googleEvent?.connectionId ?? null,
          googleEvent?.connectionId ?? null,
        ),
        prepareNotificationJob({
          bookingId: booking.id,
          operationToken,
          type: "confirmation",
          dueAt: booking.created_at,
          createdAt: now,
          bookingStatus: "confirmed",
          expectedUpdatedAt: now,
          expectedStartsAt: booking.starts_at,
          details: { ...details, calendarSequence },
        }),
        ...(reminderDueAt ? [prepareNotificationJob({
          bookingId: booking.id,
          operationToken,
          type: "reminder",
          dueAt: reminderDueAt,
          createdAt: now,
          bookingStatus: "confirmed",
          expectedUpdatedAt: now,
          expectedStartsAt: booking.starts_at,
          details: { ...details, calendarSequence },
        })] : []),
        env.DB.prepare(
          `DELETE FROM slot_claims
           WHERE booking_id = ? AND slot_key NOT IN (${currentClaimPlaceholders})
             AND EXISTS (
               SELECT 1 FROM bookings
               WHERE id = ? AND operation_token = ? AND status = 'confirmed'
                 AND updated_at = ? AND starts_at = ?
             )`,
        ).bind(
          booking.id,
          ...currentClaimKeys,
          booking.id,
          operationToken,
          now,
          booking.starts_at,
        ),
        ]);
      } catch {
        const observed = await env.DB.prepare(
          `SELECT ${bookingFields} FROM bookings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        )
          .bind(booking.id)
          .first<BookingRow>()
          .then((row) => ({ checked: true as const, row }))
          .catch(() => ({ checked: false as const, row: null }));
        const expectedCommit = Boolean(
          observed.checked &&
          observed.row?.status === "confirmed" &&
          observed.row.updated_at === now &&
          observed.row.google_event_id === (googleEvent?.id ?? null) &&
          observed.row.google_connection_id === (googleEvent?.connectionId ?? null),
        );
        if (expectedCommit) {
          result = { meta: { changes: 1 } };
        } else if (observed.checked) {
          const compensation = googleEvent
            ? await deleteGoogleBooking(
                booking.employee_id,
                googleEvent.id,
                googleEvent.connectionId,
              ).catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }))
            : { ok: true };
          if (compensation.ok) {
            return Response.json(
              { error: "Potvrda nije spremljena. Nije stvorena nepotpuna rezervacija; pokušajte ponovno." },
              { status: 503 },
            );
          }
        }

        const uncertainAt = new Date().toISOString();
        retainUncertainCreateOperation = true;
        await env.DB.prepare(
          `UPDATE bookings
           SET status = 'needs_attention', google_event_id = ?, google_etag = ?,
               google_connection_id = ?, operation_action = 'create',
               operation_started_at = ?, updated_at = ?
           WHERE id = ? AND operation_token = ? AND deleted_at IS NULL`,
        )
          .bind(
            googleEvent?.id ?? null,
            googleEvent?.etag ?? null,
            googleEvent?.connectionId ?? null,
            uncertainAt,
            uncertainAt,
            booking.id,
            operationToken,
          )
          .run()
          .catch(() => undefined);
        await writeAdminAudit({
          actorEmail: user.email,
          action: "booking_confirmation_failed",
          targetType: "booking",
          targetId: booking.id,
          details: JSON.stringify({ employeeId: booking.employee_id, reason: "database_finalize_uncertain" }),
        }).catch(() => undefined);
        return Response.json(
          { error: "Ishod potvrde zahtijeva sigurnu provjeru. Termin ostaje blokiran i neće se ponuditi drugom klijentu." },
          { status: 502 },
        );
      }
      if ((result.meta.changes ?? 0) !== 1) {
        if (googleEvent) {
          const compensation = await deleteGoogleBooking(
            booking.employee_id,
            googleEvent.id,
            googleEvent.connectionId,
          )
            .catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }));
          if (!compensation.ok) {
            await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
            return Response.json(
              { error: "Potvrda je zaustavljena jer kalendarski događaj nije moguće sigurno poništiti." },
              { status: 502 },
            );
          }
        }
        return Response.json(
          { error: "Stanje termina promijenjeno je tijekom potvrde. Osvježite pregled i pokušajte ponovno." },
          { status: 409 },
        );
      }
      await finalizeGoogleCalendarCleanup(booking.employee_id).catch(() => undefined);

      const confirmation = await deliverBookingNotification({
        details: { ...details, calendarSequence },
        type: "confirmation",
        dueAt: booking.created_at,
        bookingOperationToken: operationToken,
      }).catch(() => ({ accepted: false }));
      let reminderScheduled = false;
      if (reminderDueAt) {
        const reminder = await deliverBookingNotification({
          details: { ...details, calendarSequence },
          type: "reminder",
          dueAt: reminderDueAt,
          scheduledAt: reminderDueAt,
          bookingOperationToken: operationToken,
        }).catch(() => ({ accepted: false }));
        reminderScheduled = reminder.accepted;
      }

      await writeAdminAudit({
        actorEmail: user.email,
        action: "booking_confirmed",
        targetType: "booking",
        targetId: booking.id,
        details: JSON.stringify({
          employeeId: booking.employee_id,
          emailAccepted: confirmation.accepted,
          reminderScheduled,
          googleEvent: Boolean(googleEvent),
        }),
      }).catch(() => undefined);

      return Response.json({
        ok: true,
        status: "confirmed",
        emailAccepted: confirmation.accepted,
        reminderScheduled,
        calendarSynced: Boolean(googleEvent),
        calendarInviteSent: Boolean(googleEvent),
      });
    }

    let eventIdToCancel = booking.google_event_id;
    if (!eventIdToCancel && booking.status !== "cancelled") {
      const calendarConnected = await hasAnyGoogleCalendarConnection(booking.employee_id);
      if (calendarConnected || booking.google_connection_id) {
        eventIdToCancel = googleEventIdForBooking(booking.id);
      }
    }
    let calendarDeletion = { ok: true, eventDeleted: false };
    if (eventIdToCancel) {
      calendarDeletion = await deleteGoogleBooking(
        booking.employee_id,
        eventIdToCancel,
        booking.google_connection_id,
      )
        .catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }));
      if (!calendarDeletion.ok) {
        await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
        await writeAdminAudit({
          actorEmail: user.email,
          action: "booking_cancellation_failed",
          targetType: "booking",
          targetId: booking.id,
          details: JSON.stringify({ employeeId: booking.employee_id, reason: "google_calendar_delete_failed" }),
        }).catch(() => undefined);
        return Response.json(
          { error: "Termin zahtijeva ručnu provjeru jer ga nije moguće ukloniti iz povezanog Google kalendara. Ponovno povežite isti račun i pokušajte ponovno." },
          { status: 502 },
        );
      }
    }
    const calendarCancellationSent = calendarDeletion.eventDeleted;
    const remindersCancelled = await cancelBookingReminders(details).catch(() => false);
    if (!remindersCancelled) {
      await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
      await writeAdminAudit({
        actorEmail: user.email,
        action: "booking_cancellation_failed",
        targetType: "booking",
        targetId: booking.id,
        details: JSON.stringify({ employeeId: booking.employee_id, reason: "email_reminder_cancel_failed" }),
      }).catch(() => undefined);
      return Response.json(
        { error: "Termin zahtijeva provjeru jer zakazani podsjetnik nije moguće sigurno otkazati. Pokušajte ponovno." },
        { status: 502 },
      );
    }
    cancellationCleanupCompleted = true;
    const now = new Date().toISOString();
    const calendarSequence = booking.calendar_sequence + 1;
    let results: Array<{ meta: { changes?: number } }>;
    try {
      results = await env.DB.batch([
        env.DB.prepare(
        "UPDATE bookings SET status = 'cancelled', google_event_id = NULL, google_etag = NULL, google_connection_id = NULL, calendar_sequence = calendar_sequence + 1, updated_at = ? WHERE id = ? AND operation_token = ?",
      ).bind(now, booking.id, operationToken),
      env.DB.prepare(
        `DELETE FROM slot_claims
         WHERE booking_id = ?
           AND EXISTS (
             SELECT 1 FROM bookings
             WHERE id = ? AND status = 'cancelled' AND updated_at = ?
           )`,
      ).bind(booking.id, booking.id, now),
      env.DB.prepare(
        `UPDATE notification_jobs
         SET status = 'cancelled', last_error = 'superseded_by_cancellation', updated_at = ?
         WHERE booking_id = ? AND type IN ('confirmation','reschedule')
           AND status IN ('pending','failed','sending')
           AND EXISTS (
             SELECT 1 FROM bookings
             WHERE id = ? AND status = 'cancelled' AND updated_at = ?
           )`,
      ).bind(now, booking.id, booking.id, now),
        prepareNotificationJob({
        bookingId: booking.id,
        operationToken,
        type: "cancellation",
        dueAt: booking.created_at,
        createdAt: now,
        bookingStatus: "cancelled",
        expectedUpdatedAt: now,
        details: { ...details, calendarSequence },
        }),
      ]);
    } catch {
      const observed = await env.DB.prepare(
        `SELECT ${bookingFields} FROM bookings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      )
        .bind(booking.id)
        .first<BookingRow>()
        .catch(() => null);
      if (observed?.status === "cancelled" && observed.updated_at === now) {
        results = [{ meta: { changes: 1 } }];
      } else {
        throw new Error("booking_cancellation_finalize_uncertain");
      }
    }
    if ((results[0]?.meta.changes ?? 0) !== 1) throw new Error("booking_operation_lost");
    await finalizeGoogleCalendarCleanup(booking.employee_id).catch(() => undefined);
    const cancellation = await deliverBookingNotification({
      details: { ...details, calendarSequence },
      type: "cancellation",
      dueAt: booking.created_at,
      bookingOperationToken: operationToken,
    }).catch(() => ({ accepted: false }));
    await writeAdminAudit({
      actorEmail: user.email,
      action: "booking_cancelled",
      targetType: "booking",
      targetId: booking.id,
      details: JSON.stringify({
        emailAccepted: cancellation.accepted,
        calendarCancellationSent,
      }),
    }).catch(() => undefined);
    return Response.json({
      ok: true,
      status: "cancelled",
      emailAccepted: cancellation.accepted,
      calendarCancellationSent,
    });
  } catch {
    if (cancellationCleanupCompleted) {
      await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
    }
    await writeAdminAudit({
      actorEmail: user.email,
      action: "booking_operation_failed",
      targetType: "booking",
      targetId: booking.id,
      details: JSON.stringify({ action }),
    }).catch(() => undefined);
    return Response.json(
      { error: "Radnju trenutačno nije moguće dovršiti. Pokušajte ponovno." },
      { status: 500 },
    );
  } finally {
    if (!retainUncertainCreateOperation) {
      await releaseBookingOperation(booking.id, operationToken).catch(() => undefined);
    }
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSalonUser();
  if (!user) return Response.json({ error: "Prijava je obavezna." }, { status: 401 });
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan zahtjev." }, { status: 403 });
  }

  const parsedBody = await readJsonBody<{ date?: unknown; time?: unknown }>(request, 2_048);
  if (!parsedBody.ok) {
    return Response.json({ error: parsedBody.error }, { status: parsedBody.status });
  }
  const date = typeof parsedBody.value.date === "string"
    ? parsedBody.value.date.trim()
    : "";
  const time = typeof parsedBody.value.time === "string"
    ? parsedBody.value.time.trim()
    : "";
  if (!isDateWithinBookingWindow(date) || !isTime(time)) {
    return Response.json({ error: "Odaberite valjan novi datum i vrijeme." }, { status: 400 });
  }

  const { id } = await params;
  const booking = await env.DB.prepare(
    `SELECT ${bookingFields} FROM bookings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(id)
    .first<BookingRow>();
  if (!booking) return Response.json({ error: "Termin nije pronađen." }, { status: 404 });
  if (!canAccessEmployee(user, booking.employee_id)) {
    return Response.json({ error: "Nemate pristup ovom terminu." }, { status: 403 });
  }
  if (booking.status !== "confirmed") {
    return Response.json(
      { error: "Moguće je promijeniti samo potvrđen termin. Termin koji zahtijeva provjeru možete otkazati nakon provjere kalendara." },
      { status: 409 },
    );
  }
  if (calendarCreationIsFresh(booking)) {
    return Response.json(
      { error: "Rezervacija se još sinkronizira s kalendarom. Pričekajte trenutak i osvježite pregled." },
      { status: 409 },
    );
  }
  if (booking.date_local === date && booking.start_time_local === time) {
    return Response.json({ ok: true, status: booking.status, alreadyCompleted: true });
  }

  const services = await loadServices({ includeInactive: true });
  const service = services.find((item) => item.id === booking.service_id);
  const staff = team.find((member) => member.id === booking.employee_id);
  if (!service || !staff) {
    return Response.json({ error: "Podaci termina nisu potpuni." }, { status: 409 });
  }
  if (!booking.google_event_id || !booking.google_connection_id) {
    return Response.json(
      { error: "Termin nema potvrđenu vezu s Google kalendarom. Najprije ponovno povežite kalendar ili otkažite termin." },
      { status: 409 },
    );
  }

  const startsAt = zonedLocalToUtc(date, time);
  if (startsAt.getTime() <= Date.now()) {
    return Response.json({ error: "Novi termin mora biti u budućnosti." }, { status: 400 });
  }
  const endTimeLocal = addLocalMinutes(time, service.duration);
  const endsAt = zonedLocalToUtc(date, endTimeLocal);
  const blockedUntil = zonedLocalToUtc(
    date,
    addLocalMinutes(time, service.duration + service.buffer),
  );

  const availability = await availableTimes(
    service,
    booking.employee_id,
    date,
    {
      excludeBookingId: booking.id,
      excludeGoogleEvent: {
        eventId: booking.google_event_id,
        connectionId: booking.google_connection_id,
      },
    },
  ).catch(() => null);
  if (!availability?.times.includes(time)) {
    return Response.json(
      { error: "Novi termin nije slobodan. Odaberite drugo vrijeme." },
      { status: 409 },
    );
  }

  const operationToken = await claimBookingOperation(booking, "reschedule");
  if (!operationToken) {
    return Response.json(
      { error: "Druga radnja nad ovim terminom već je u tijeku. Osvježite pregled i pokušajte ponovno." },
      { status: 409 },
    );
  }

  const newSlotKeys = utcSlotKeys(startsAt, service.duration, service.buffer);
  const ownedClaims = await env.DB.prepare(
    "SELECT slot_key FROM slot_claims WHERE booking_id = ? AND employee_id = ?",
  )
    .bind(booking.id, booking.employee_id)
    .all<{ slot_key: string }>()
    .catch(() => null);
  if (!ownedClaims) {
    await releaseBookingOperation(booking.id, operationToken).catch(() => undefined);
    return Response.json(
      { error: "Zauzeće termina trenutačno nije moguće sigurno provjeriti. Pokušajte ponovno." },
      { status: 503 },
    );
  }
  const ownedSlotKeys = new Set((ownedClaims.results ?? []).map((row) => row.slot_key));
  const newClaimKeys = newSlotKeys.filter((slotKey) => !ownedSlotKeys.has(slotKey));
  const newClaimExpiry = blockedUntil.toISOString();
  const safetyClaimKeys = [...new Set([...ownedSlotKeys, ...newSlotKeys])];
  const storedClaimExpiry = Date.parse(booking.blocked_until ?? booking.ends_at);
  const safetyClaimExpiry = new Date(Math.max(
    Number.isFinite(storedClaimExpiry) ? storedClaimExpiry : 0,
    blockedUntil.getTime(),
  )).toISOString();
  const oldDetails = {
    bookingId: booking.id,
    email: booking.email,
    firstName: booking.first_name,
    serviceName: service.name,
    staffName: staff.name,
    dateLabel: dateLabel(booking.date_local),
    time: booking.start_time_local,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
  };
  const newDetails = {
    ...oldDetails,
    dateLabel: dateLabel(date),
    time,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
  const oldReminderAt = new Date(
    new Date(booking.starts_at).getTime() - 24 * 60 * 60 * 1000,
  );
  const restoreOldReminder = async () => {
    if (oldReminderAt.getTime() <= Date.now()) return;
    await deliverBookingNotification({
      details: {
        ...oldDetails,
        calendarSequence: booking.calendar_sequence,
      },
      type: "reminder",
      dueAt: oldReminderAt.toISOString(),
      scheduledAt: oldReminderAt.toISOString(),
      bookingOperationToken: operationToken,
    }).catch(() => undefined);
  };
  const restoreOldCalendar = async () => {
    const restored = await updateGoogleBooking({
      employeeId: booking.employee_id,
      bookingId: booking.id,
      eventId: booking.google_event_id!,
      connectionId: booking.google_connection_id!,
      serviceName: service.name,
      clientName: `${booking.first_name} ${booking.last_name}`,
      clientEmail: booking.email,
      staffName: staff.name,
      startsAt: new Date(booking.starts_at),
      endsAt: new Date(booking.ends_at),
    }).catch(() => null);
    return Boolean(restored && !("uncertain" in restored));
  };
  const retainBothSlotsForReview = async (reason: string) => {
    if (safetyClaimKeys.length) {
      await env.DB.batch(safetyClaimKeys.map((slotKey) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO slot_claims (employee_id,slot_key,booking_id,expires_at)
           SELECT ?,?,?,?
           WHERE EXISTS (
             SELECT 1 FROM bookings WHERE id = ? AND operation_token = ? AND deleted_at IS NULL
           )`,
        ).bind(
          booking.employee_id,
          slotKey,
          booking.id,
          safetyClaimExpiry,
          booking.id,
          operationToken,
        ),
      )).catch(() => undefined);
    }
    await env.DB.prepare(
      `UPDATE bookings SET status = 'needs_attention', updated_at = ?
       WHERE id = ? AND operation_token = ? AND deleted_at IS NULL`,
    )
      .bind(new Date().toISOString(), booking.id, operationToken)
      .run()
      .catch(() => undefined);
    await writeAdminAudit({
      actorEmail: user.email,
      action: "booking_reschedule_failed",
      targetType: "booking",
      targetId: booking.id,
      details: JSON.stringify({ employeeId: booking.employee_id, reason }),
    }).catch(() => undefined);
  };

  try {
    const claimResults = newClaimKeys.length ? await env.DB.batch(
      newClaimKeys.map((slotKey) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO slot_claims (employee_id,slot_key,booking_id,expires_at)
           SELECT ?,?,?,?
           WHERE EXISTS (
             SELECT 1 FROM bookings
             WHERE id = ? AND operation_token = ? AND deleted_at IS NULL AND status != 'cancelled'
           )
             AND NOT EXISTS (
               SELECT 1 FROM bookings existing
               WHERE existing.id != ? AND existing.employee_id = ?
                 AND existing.deleted_at IS NULL
                 AND existing.status IN ('pending_calendar','pending_confirmation','confirmed','needs_attention')
                 AND existing.starts_at < ?
                 AND COALESCE(existing.blocked_until, existing.ends_at) > ?
             )`,
        ).bind(
          booking.employee_id,
          slotKey,
          booking.id,
          newClaimExpiry,
          booking.id,
          operationToken,
          booking.id,
          booking.employee_id,
          blockedUntil.toISOString(),
          startsAt.toISOString(),
        ),
      ),
    ) : [];
    if (claimResults.some((result) => (result.meta.changes ?? 0) !== 1)) {
      await releaseRescheduleClaims(booking.id, operationToken, newClaimKeys).catch(() => undefined);
      return Response.json(
        { error: "Novi termin je upravo zauzet. Odaberite drugo vrijeme." },
        { status: 409 },
      );
    }

    const calendarWrite = await updateGoogleBooking({
      employeeId: booking.employee_id,
      bookingId: booking.id,
      eventId: booking.google_event_id,
      connectionId: booking.google_connection_id,
      serviceName: service.name,
      clientName: `${booking.first_name} ${booking.last_name}`,
      clientEmail: booking.email,
      staffName: staff.name,
      startsAt,
      endsAt,
    }).catch(() => null);
    if (!calendarWrite) {
      await releaseRescheduleClaims(booking.id, operationToken, newClaimKeys).catch(() => undefined);
      return Response.json(
        { error: "Google kalendar nije prihvatio promjenu. Stari termin ostaje nepromijenjen." },
        { status: 502 },
      );
    }
    if ("uncertain" in calendarWrite) {
      await retainBothSlotsForReview("google_calendar_update_uncertain");
      return Response.json(
        { error: "Google još potvrđuje promjenu. Stari i novi termin privremeno su blokirani radi zaštite od duplikata." },
        { status: 502 },
      );
    }

    const remindersCancelled = await cancelBookingReminders(oldDetails).catch(() => false);
    if (!remindersCancelled) {
      const restored = await restoreOldCalendar();
      await restoreOldReminder();
      if (restored) {
        await releaseRescheduleClaims(booking.id, operationToken, newClaimKeys).catch(() => undefined);
      } else {
        await retainBothSlotsForReview("reminder_cancel_failed_and_calendar_restore_uncertain");
      }
      return Response.json(
        { error: "Promjena je zaustavljena jer stari podsjetnik nije moguće sigurno premjestiti. Stari termin ostaje važeći." },
        { status: 502 },
      );
    }

    const updatedAt = new Date().toISOString();
    const calendarSequence = booking.calendar_sequence + 1;
    const newReminderAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
    const newReminderDueAt = newReminderAt.getTime() > Date.now()
      ? newReminderAt.toISOString()
      : null;
    const placeholders = newSlotKeys.map(() => "?").join(",");
    let finalized;
    try {
      finalized = await env.DB.batch([
        env.DB.prepare(
          `UPDATE bookings
           SET date_local = ?, start_time_local = ?, end_time_local = ?, starts_at = ?, ends_at = ?,
               blocked_until = ?, status = 'confirmed', google_event_id = ?, google_etag = ?,
               google_connection_id = ?, calendar_sequence = calendar_sequence + 1, updated_at = ?
           WHERE id = ? AND operation_token = ? AND deleted_at IS NULL AND status != 'cancelled'
             AND NOT EXISTS (
               SELECT 1 FROM bookings existing
               WHERE existing.id != bookings.id AND existing.employee_id = bookings.employee_id
                 AND existing.deleted_at IS NULL
                 AND existing.status IN ('pending_calendar','pending_confirmation','confirmed','needs_attention')
                 AND existing.starts_at < ?
                 AND COALESCE(existing.blocked_until, existing.ends_at) > ?
             )
             AND (
               SELECT COUNT(*) FROM slot_claims
               WHERE booking_id = ? AND employee_id = ? AND slot_key IN (${placeholders})
             ) = ?`,
        ).bind(
          date,
          time,
          endTimeLocal,
          startsAt.toISOString(),
          endsAt.toISOString(),
          blockedUntil.toISOString(),
          calendarWrite.id,
          calendarWrite.etag,
          calendarWrite.connectionId,
          updatedAt,
          booking.id,
          operationToken,
          blockedUntil.toISOString(),
          startsAt.toISOString(),
          booking.id,
          booking.employee_id,
          ...newSlotKeys,
          newSlotKeys.length,
        ),
        env.DB.prepare(
          `DELETE FROM slot_claims
           WHERE booking_id = ? AND slot_key NOT IN (${placeholders})
             AND EXISTS (
               SELECT 1 FROM bookings WHERE id = ? AND updated_at = ? AND starts_at = ?
             )`,
        ).bind(booking.id, ...newSlotKeys, booking.id, updatedAt, startsAt.toISOString()),
        env.DB.prepare(
          `UPDATE notification_jobs
           SET status = 'cancelled', last_error = 'superseded', updated_at = ?
           WHERE booking_id = ? AND type IN ('confirmation','reschedule')
             AND status IN ('pending','failed','sending')
             AND (type = 'confirmation' OR due_at != ?)
             AND EXISTS (
               SELECT 1 FROM bookings WHERE id = ? AND updated_at = ? AND starts_at = ?
             )`,
        ).bind(
          updatedAt,
          booking.id,
          updatedAt,
          booking.id,
          updatedAt,
          startsAt.toISOString(),
        ),
        prepareNotificationJob({
          bookingId: booking.id,
          operationToken,
          type: "reschedule",
          dueAt: updatedAt,
          createdAt: updatedAt,
          bookingStatus: "confirmed",
          expectedUpdatedAt: updatedAt,
          expectedStartsAt: startsAt.toISOString(),
          details: { ...newDetails, calendarSequence },
        }),
        ...(newReminderDueAt ? [prepareNotificationJob({
          bookingId: booking.id,
          operationToken,
          type: "reminder",
          dueAt: newReminderDueAt,
          createdAt: updatedAt,
          bookingStatus: "confirmed",
          expectedUpdatedAt: updatedAt,
          expectedStartsAt: startsAt.toISOString(),
          details: { ...newDetails, calendarSequence },
        })] : []),
      ]);
    } catch {
      const observed = await env.DB.prepare(
        `SELECT ${bookingFields} FROM bookings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      )
        .bind(booking.id)
        .first<BookingRow>()
        .then((row) => ({ checked: true as const, row }))
        .catch(() => ({ checked: false as const, row: null }));
      const expectedCommit = Boolean(
        observed.checked &&
        observed.row?.status === "confirmed" &&
        observed.row.updated_at === updatedAt &&
        observed.row.starts_at === startsAt.toISOString() &&
        observed.row.google_event_id === calendarWrite.id &&
        observed.row.google_connection_id === calendarWrite.connectionId,
      );
      if (expectedCommit) {
        finalized = [{ meta: { changes: 1 } }];
      } else if (observed.checked) {
        finalized = null;
      } else {
        await retainBothSlotsForReview("database_finalize_uncertain");
        return Response.json(
          { error: "Ishod promjene zahtijeva sigurnu provjeru. Stari i novi termin ostaju zaštićeni od novih rezervacija." },
          { status: 502 },
        );
      }
    }
    if ((finalized?.[0]?.meta.changes ?? 0) !== 1) {
      const restored = await restoreOldCalendar();
      await restoreOldReminder();
      if (restored) {
        await releaseRescheduleClaims(booking.id, operationToken, newClaimKeys).catch(() => undefined);
      } else {
        await retainBothSlotsForReview("database_finalize_failed_and_calendar_restore_uncertain");
      }
      return Response.json(
        { error: "Stanje termina promijenilo se tijekom izmjene. Stari termin ostaje važeći; osvježite pregled." },
        { status: restored ? 409 : 502 },
      );
    }

    const notification = await deliverBookingNotification({
      details: { ...newDetails, calendarSequence },
      type: "reschedule",
      dueAt: updatedAt,
      bookingOperationToken: operationToken,
    }).catch(() => ({ accepted: false }));
    let reminderScheduled = false;
    if (newReminderDueAt) {
      const reminder = await deliverBookingNotification({
        details: { ...newDetails, calendarSequence },
        type: "reminder",
        dueAt: newReminderDueAt,
        scheduledAt: newReminderDueAt,
        bookingOperationToken: operationToken,
      }).catch(() => ({ accepted: false }));
      reminderScheduled = reminder.accepted;
    }
    await writeAdminAudit({
      actorEmail: user.email,
      action: "booking_rescheduled",
      targetType: "booking",
      targetId: booking.id,
      details: JSON.stringify({
        employeeId: booking.employee_id,
        from: { date: booking.date_local, time: booking.start_time_local },
        to: { date, time },
        emailAccepted: notification.accepted,
        reminderScheduled,
      }),
    }).catch(() => undefined);

    return Response.json({
      ok: true,
      status: "confirmed",
      emailAccepted: notification.accepted,
      reminderScheduled,
      calendarSynced: true,
    });
  } catch {
    await releaseRescheduleClaims(booking.id, operationToken, newClaimKeys).catch(() => undefined);
    await writeAdminAudit({
      actorEmail: user.email,
      action: "booking_reschedule_failed",
      targetType: "booking",
      targetId: booking.id,
      details: JSON.stringify({ employeeId: booking.employee_id, reason: "unexpected_error" }),
    }).catch(() => undefined);
    return Response.json(
      { error: "Promjenu termina trenutačno nije moguće dovršiti. Stari termin ostaje važeći." },
      { status: 500 },
    );
  } finally {
    await releaseBookingOperation(booking.id, operationToken).catch(() => undefined);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) {
    return Response.json({ error: "Samo administrator može izbrisati termin." }, { status: 403 });
  }
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan izvor zahtjeva." }, { status: 403 });
  }

  const { id } = await params;
  const booking = await env.DB.prepare(
    `SELECT ${bookingFields} FROM bookings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(id).first<BookingRow>();
  if (!booking) return Response.json({ error: "Termin nije pronađen." }, { status: 404 });
  if (calendarCreationIsFresh(booking)) {
    return Response.json(
      { error: "Rezervacija se još sinkronizira s kalendarom. Pričekajte trenutak i osvježite pregled." },
      { status: 409 },
    );
  }

  const services = await loadServices({ includeInactive: true });
  const service = services.find((item) => item.id === booking.service_id);
  const staff = team.find((member) => member.id === booking.employee_id);
  if (!service || !staff) {
    return Response.json({ error: "Podaci termina nisu potpuni." }, { status: 409 });
  }
  const operationToken = await claimBookingOperation(booking, "delete");
  if (!operationToken) {
    return Response.json(
      { error: "Druga radnja nad ovim terminom već je u tijeku. Osvježite pregled i pokušajte ponovno." },
      { status: 409 },
    );
  }
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
  };

  let deletionCleanupCompleted = false;
  try {
    let eventIdToRemove = booking.google_event_id;
    if (!eventIdToRemove && booking.status !== "cancelled") {
      const calendarConnected = await hasAnyGoogleCalendarConnection(booking.employee_id);
      if (calendarConnected || booking.google_connection_id) {
        eventIdToRemove = googleEventIdForBooking(booking.id);
      }
    }
    let calendarDeletion = { ok: true, eventDeleted: false };
    if (eventIdToRemove) {
      calendarDeletion = await deleteGoogleBooking(
        booking.employee_id,
        eventIdToRemove,
        booking.google_connection_id,
      )
        .catch(() => ({ ok: false, eventDeleted: false, connectionsChecked: 0 }));
      if (!calendarDeletion.ok) {
        await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
        await writeAdminAudit({
          actorEmail: user.email,
          action: "booking_deletion_failed",
          targetType: "booking",
          targetId: booking.id,
          details: JSON.stringify({ employeeId: booking.employee_id, reason: "google_calendar_delete_failed" }),
        }).catch(() => undefined);
        return Response.json(
          { error: "Termin zahtijeva ručnu provjeru jer ga nije moguće ukloniti iz povezanog Google kalendara. Ponovno povežite isti račun i pokušajte ponovno." },
          { status: 502 },
        );
      }
    }
    const calendarRemoved = calendarDeletion.ok;
    const calendarCancellationSent = calendarDeletion.eventDeleted;
    const remindersCancelled = await cancelBookingReminders(details).catch(() => false);
    if (!remindersCancelled) {
      await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
      await writeAdminAudit({
        actorEmail: user.email,
        action: "booking_deletion_failed",
        targetType: "booking",
        targetId: booking.id,
        details: JSON.stringify({ employeeId: booking.employee_id, reason: "email_reminder_cancel_failed" }),
      }).catch(() => undefined);
      return Response.json(
        { error: "Termin zahtijeva provjeru jer zakazani podsjetnik nije moguće sigurno otkazati. Pokušajte ponovno." },
        { status: 502 },
      );
    }
    deletionCleanupCompleted = true;
    const now = new Date().toISOString();
    const calendarSequence = booking.calendar_sequence + 1;
    let results: Array<{ meta: { changes?: number } }>;
    try {
      results = await env.DB.batch([
        env.DB.prepare(
        "UPDATE bookings SET status = 'cancelled',google_event_id = NULL,google_etag = NULL,google_connection_id = NULL,calendar_sequence = calendar_sequence + 1,deleted_at = ?,deleted_by_email = ?,updated_at = ? WHERE id = ? AND operation_token = ?",
      ).bind(now, user.email, now, booking.id, operationToken),
      env.DB.prepare(
        `DELETE FROM slot_claims
         WHERE booking_id = ?
           AND EXISTS (
             SELECT 1 FROM bookings
             WHERE id = ? AND status = 'cancelled' AND deleted_at = ? AND updated_at = ?
           )`,
      ).bind(booking.id, booking.id, now, now),
      env.DB.prepare(
        `UPDATE notification_jobs
         SET status = 'cancelled', last_error = 'superseded_by_deletion', updated_at = ?
         WHERE booking_id = ? AND type IN ('confirmation','reschedule')
           AND status IN ('pending','failed','sending')
           AND EXISTS (
             SELECT 1 FROM bookings
             WHERE id = ? AND status = 'cancelled' AND deleted_at = ? AND updated_at = ?
           )`,
      ).bind(now, booking.id, booking.id, now, now),
        ...(booking.status !== "cancelled" ? [prepareNotificationJob({
        bookingId: booking.id,
        operationToken,
        type: "cancellation",
        dueAt: booking.created_at,
        createdAt: now,
        bookingStatus: "cancelled",
        expectedUpdatedAt: now,
        details: { ...details, calendarSequence },
        })] : []),
      ]);
    } catch {
      const observed = await env.DB.prepare(
        `SELECT ${bookingFields},deleted_at FROM bookings WHERE id = ? LIMIT 1`,
      )
        .bind(booking.id)
        .first<BookingRow & { deleted_at: string | null }>()
        .catch(() => null);
      if (
        observed?.status === "cancelled" &&
        observed.deleted_at === now &&
        observed.updated_at === now
      ) {
        results = [{ meta: { changes: 1 } }];
      } else {
        throw new Error("booking_deletion_finalize_uncertain");
      }
    }
    if ((results[0]?.meta.changes ?? 0) !== 1) throw new Error("booking_operation_lost");
    await finalizeGoogleCalendarCleanup(booking.employee_id).catch(() => undefined);
    let emailAccepted = false;
    if (booking.status !== "cancelled") {
      const cancellation = await deliverBookingNotification({
        details: { ...details, calendarSequence },
        type: "cancellation",
        dueAt: booking.created_at,
        bookingOperationToken: operationToken,
      }).catch(() => ({ accepted: false }));
      emailAccepted = cancellation.accepted;
    }
    await writeAdminAudit({
      actorEmail: user.email,
      action: "booking_deleted",
      targetType: "booking",
      targetId: booking.id,
      details: JSON.stringify({
        previousStatus: booking.status,
        employeeId: booking.employee_id,
        emailAccepted,
        calendarRemoved,
      }),
    }).catch(() => undefined);
    return Response.json({
      ok: true,
      emailAccepted,
      calendarCancellationSent,
      calendarRemoved,
    });
  } catch {
    if (deletionCleanupCompleted) {
      await markBookingNeedsAttention(booking.id, operationToken).catch(() => undefined);
    }
    await writeAdminAudit({
      actorEmail: user.email,
      action: "booking_operation_failed",
      targetType: "booking",
      targetId: booking.id,
      details: JSON.stringify({ action: "delete" }),
    }).catch(() => undefined);
    return Response.json(
      { error: "Brisanje trenutačno nije moguće dovršiti. Pokušajte ponovno." },
      { status: 500 },
    );
  } finally {
    await releaseBookingOperation(booking.id, operationToken).catch(() => undefined);
  }
}
