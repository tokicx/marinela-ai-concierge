import { env } from "cloudflare:workers";
import {
  bookingEmailProviderAccountKey,
  cancelScheduledBookingEmail,
  findBookingReminderProviderIds,
  getBookingEmailProviderStatus,
  sendBookingEmail,
  verifyBookingReminderProvider,
  type BookingEmailType,
} from "./email";

export type BookingNotificationDetails = {
  bookingId: string;
  email: string;
  firstName: string;
  serviceName: string;
  staffName: string;
  dateLabel: string;
  time: string;
  startsAt: string;
  endsAt: string;
  calendarSequence?: number;
};

type NotificationRow = {
  id: string;
  status: string;
  provider_id: string | null;
  attempts: number;
  due_at: string;
  created_at: string;
  provider_account_key: string | null;
  provider_generation: number;
  delivery_key?: string | null;
  payload_snapshot?: string | null;
  last_error?: string | null;
};

export type NotificationDelivery = {
  accepted: boolean;
  configured: boolean;
  state: "sent" | "scheduled" | "pending" | "failed";
};

type OutboxRow = NotificationRow & {
  booking_id: string;
  type: BookingEmailType;
  updated_at: string;
  last_error: string | null;
  email: string;
  first_name: string;
  service_name: string | null;
  staff_name: string | null;
  date_local: string;
  start_time_local: string;
  starts_at: string;
  ends_at: string;
  booking_updated_at: string;
  calendar_sequence: number;
};

type NotificationPersistState = {
  status: string;
  provider_id: string | null;
  provider_generation: number;
};

function parseNotificationSnapshot(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BookingNotificationDetails>;
    const required: Array<keyof BookingNotificationDetails> = [
      "bookingId",
      "email",
      "firstName",
      "serviceName",
      "staffName",
      "dateLabel",
      "time",
      "startsAt",
      "endsAt",
    ];
    if (required.some((key) => typeof parsed[key] !== "string")) return null;
    if (
      parsed.calendarSequence !== undefined &&
      (!Number.isSafeInteger(parsed.calendarSequence) || parsed.calendarSequence < 0)
    ) return null;
    return parsed as BookingNotificationDetails;
  } catch {
    return null;
  }
}

async function readNotificationPersistState(jobId: string) {
  return env.DB.prepare(
    "SELECT status,provider_id,provider_generation FROM notification_jobs WHERE id = ? LIMIT 1",
  )
    .bind(jobId)
    .first<NotificationPersistState>();
}

function notificationResultWasPersisted(
  current: NotificationPersistState | null,
  state: string,
  providerId: string | null,
) {
  return current?.status === state && current.provider_id === providerId;
}

async function reconcileAcceptedScheduledResult(input: {
  jobId: string;
  providerId: string;
  providerAccountKey: string | null;
  providerGeneration: number;
  now: string;
}) {
  const before = await readNotificationPersistState(input.jobId).catch(() => null);
  if (notificationResultWasPersisted(before, "scheduled", input.providerId)) {
    return "committed" as const;
  }

  const providerResolved = await providerReminderIsResolved(input.providerId);
  if (!providerResolved) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await env.DB.prepare(
        `UPDATE notification_jobs
         SET status = 'scheduled', provider_id = ?, last_error = NULL, updated_at = ?
         WHERE id = ? AND status = 'sending' AND provider_id IS NULL
           AND provider_generation = ? AND provider_account_key IS ?`,
      )
        .bind(
          input.providerId,
          input.now,
          input.jobId,
          input.providerGeneration,
          input.providerAccountKey,
        )
        .run()
        .catch(() => null);
      const adopted = await readNotificationPersistState(input.jobId).catch(() => null);
      if (notificationResultWasPersisted(adopted, "scheduled", input.providerId)) {
        return "committed" as const;
      }
      if (adopted?.status === "scheduled" && adopted.provider_id) {
        return "committed" as const;
      }
    }
    return "unresolved" as const;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await env.DB.prepare(
      `UPDATE notification_jobs
       SET status = 'pending', provider_id = NULL, last_error = 'schedule_persist_failed',
           sent_at = NULL, provider_generation = provider_generation + 1, updated_at = ?
       WHERE id = ? AND provider_generation = ? AND provider_account_key IS ?
         AND (
           (status = 'sending' AND provider_id IS NULL)
           OR (status = 'scheduled' AND provider_id = ?)
         )`,
    )
      .bind(
        input.now,
        input.jobId,
        input.providerGeneration,
        input.providerAccountKey,
        input.providerId,
      )
      .run()
      .catch(() => null);
    const reset = await readNotificationPersistState(input.jobId).catch(() => null);
    if (
      reset?.status === "pending" &&
      reset.provider_id === null &&
      reset.provider_generation > input.providerGeneration
    ) {
      return "reset" as const;
    }
    if (reset?.status === "cancelled") return "reset" as const;
    if (reset?.status === "scheduled" && reset.provider_id !== input.providerId) {
      return "committed" as const;
    }
  }
  return "unresolved" as const;
}

export async function deliverBookingNotification(input: {
  details: BookingNotificationDetails;
  type: BookingEmailType;
  dueAt: string;
  scheduledAt?: string;
  bookingOperationToken?: string;
}): Promise<NotificationDelivery> {
  const now = new Date().toISOString();
  const staleOperationBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const jobId = crypto.randomUUID();
  const payloadSnapshot = JSON.stringify(input.details);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO notification_jobs (id,booking_id,type,due_at,status,attempts,provider_id,last_error,sent_at,created_at,updated_at,delivery_key,payload_snapshot) VALUES (?,?,?,?, 'pending',0,NULL,NULL,NULL,?,?,?,?)",
  )
    .bind(
      jobId,
      input.details.bookingId,
      input.type,
      input.dueAt,
      now,
      now,
      input.type === "reschedule" ? jobId : null,
      payloadSnapshot,
    )
    .run();

  await env.DB.prepare(
    `UPDATE notification_jobs SET payload_snapshot = ?
     WHERE booking_id = ? AND type = ? AND due_at = ? AND payload_snapshot IS NULL
       AND status IN ('pending','failed','cancelled')`,
  )
    .bind(payloadSnapshot, input.details.bookingId, input.type, input.dueAt)
    .run();

  let job = await env.DB.prepare(
    "SELECT id,status,provider_id,attempts,due_at,created_at,provider_account_key,provider_generation,delivery_key,payload_snapshot FROM notification_jobs WHERE booking_id = ? AND type = ? AND due_at = ? LIMIT 1",
  )
    .bind(input.details.bookingId, input.type, input.dueAt)
    .first<NotificationRow>();
  if (!job) return { accepted: false, configured: false, state: "failed" };
  if (job.status === "sent" || job.status === "scheduled") {
    return {
      accepted: true,
      configured: true,
      state: job.status as "sent" | "scheduled",
    };
  }
  if (job.status === "cancelled") {
    if (
      input.type !== "reminder" ||
      !input.scheduledAt ||
      Date.parse(input.scheduledAt) <= Date.now()
    ) {
      return { accepted: false, configured: true, state: "failed" };
    }
    const reopened = await env.DB.prepare(
      `UPDATE notification_jobs
       SET status = 'pending', attempts = 0, provider_id = NULL, last_error = NULL,
           sent_at = NULL, provider_account_key = NULL,
           provider_generation = provider_generation + 1, payload_snapshot = ?,
           created_at = ?, updated_at = ?
       WHERE id = ? AND status = 'cancelled' RETURNING id,provider_generation`,
    )
      .bind(payloadSnapshot, now, now, job.id)
      .first<{ id: string; provider_generation: number }>();
    if (!reopened) {
      return { accepted: false, configured: true, state: "failed" };
    }
    job = {
      ...job,
      status: "pending",
      attempts: 0,
      provider_id: null,
      provider_account_key: null,
      provider_generation: reopened.provider_generation,
      payload_snapshot: payloadSnapshot,
      created_at: now,
    };
  }
  if (job.status === "sending") {
    return { accepted: false, configured: true, state: "pending" };
  }

  const providerAccountKey = await bookingEmailProviderAccountKey();
  const claimed = await env.DB.prepare(
    `UPDATE notification_jobs
     SET status = 'sending', attempts = attempts + 1,
         provider_account_key = CASE
           WHEN last_error = 'email_not_configured' AND provider_id IS NULL THEN ?
           ELSE COALESCE(provider_account_key, ?)
         END,
         updated_at = ?
     WHERE id = ? AND status IN ('pending','failed')
       AND (
         provider_account_key IS NULL OR provider_account_key = ?
         OR (last_error = 'email_not_configured' AND provider_id IS NULL)
       )
       AND EXISTS (
         SELECT 1 FROM bookings booking
         WHERE booking.id = notification_jobs.booking_id
           AND (
             booking.operation_token IS NULL OR booking.operation_token = ?
             OR booking.operation_started_at IS NULL OR booking.operation_started_at < ?
           )
           AND (
             (notification_jobs.type = 'cancellation' AND booking.status = 'cancelled')
             OR (
               notification_jobs.type IN ('confirmation','reminder','reschedule')
               AND booking.status = 'confirmed' AND booking.deleted_at IS NULL
             )
           )
           AND (notification_jobs.type != 'reschedule' OR notification_jobs.due_at = booking.updated_at)
           AND (notification_jobs.type != 'reminder' OR booking.starts_at = ?)
       )
     RETURNING id`,
  )
    .bind(
      providerAccountKey,
      providerAccountKey,
      now,
      job.id,
      providerAccountKey,
      input.bookingOperationToken ?? null,
      staleOperationBefore,
      input.details.startsAt,
    )
    .first<{ id: string }>();
  if (!claimed) {
    const current = await env.DB.prepare(
      "SELECT status FROM notification_jobs WHERE id = ? LIMIT 1",
    )
      .bind(job.id)
      .first<{ status: string }>();
    if (current?.status === "sent" || current?.status === "scheduled") {
      return { accepted: true, configured: true, state: current.status };
    }
    return { accepted: false, configured: true, state: "failed" };
  }

  const deliveryDetails = parseNotificationSnapshot(job.payload_snapshot) ?? input.details;
  const result = await sendBookingEmail({
    ...deliveryDetails,
    type: input.type,
    ...(job.delivery_key ? { deliveryKey: job.delivery_key } : {}),
    calendarStamp: job.created_at,
    generation: job.provider_generation,
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
  }).catch(() => ({
    accepted: false,
    configured: true,
    providerId: null,
    retryable: true,
    errorCode: "network_error",
  }));
  const state = result.accepted
    ? input.scheduledAt ? "scheduled" : "sent"
    : result.retryable ? "pending" : "failed";

  let persistenceConfirmed = false;
  let persistError: unknown = null;
  try {
    const persisted = await env.DB.prepare(
      "UPDATE notification_jobs SET status = ?, provider_id = ?, last_error = ?, sent_at = ?, updated_at = ? WHERE id = ? AND status = 'sending'",
    )
      .bind(
        state,
        result.providerId,
        result.errorCode,
        result.accepted && !input.scheduledAt ? now : null,
        now,
        job.id,
      )
      .run();
    persistenceConfirmed = (persisted.meta.changes ?? 0) === 1;
  } catch (error) {
    persistError = error;
  }

  if (!persistenceConfirmed) {
    const current = await readNotificationPersistState(job.id).catch(() => null);
    persistenceConfirmed = notificationResultWasPersisted(current, state, result.providerId);
  }

  if (!persistenceConfirmed && result.accepted && input.scheduledAt && result.providerId) {
    const reconciled = await reconcileAcceptedScheduledResult({
      jobId: job.id,
      providerId: result.providerId,
      providerAccountKey,
      providerGeneration: job.provider_generation,
      now,
    });
    persistenceConfirmed = reconciled === "committed";
  }

  if (!persistenceConfirmed) {
    if (persistError instanceof Error) throw persistError;
    throw new Error("notification_operation_lost");
  }

  return {
    accepted: result.accepted,
    configured: result.configured,
    state,
  };
}

function outboxRetryReady(job: OutboxRow, now: number) {
  const updatedAt = Date.parse(job.updated_at);
  if (!Number.isFinite(updatedAt)) return true;
  if (job.status === "sending") return updatedAt <= now - 10 * 60 * 1000;
  const delaySeconds = job.attempts <= 0
    ? 0
    : Math.min(60 * (2 ** Math.min(job.attempts - 1, 6)), 60 * 60);
  return updatedAt <= now - delaySeconds * 1000;
}

export async function drainBookingNotificationOutbox(limit = 3) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 5));
  const now = Date.now();
  const staleBefore = new Date(now - 10 * 60 * 1000).toISOString();
  const retryCutoffs = [0, 60, 120, 240, 480, 960, 1_920, 3_600]
    .map((seconds) => new Date(now - seconds * 1_000).toISOString());
  const result = await env.DB.prepare(
    `SELECT job.id,job.booking_id,job.status,job.provider_id,job.attempts,job.due_at,job.created_at,
            job.provider_account_key,job.provider_generation,job.updated_at,job.last_error,job.payload_snapshot,
            job.type,booking.email,booking.first_name,booking.date_local,
            booking.start_time_local,booking.starts_at,booking.ends_at,booking.updated_at AS booking_updated_at,
            booking.calendar_sequence,
            service.name AS service_name,employee.name AS staff_name
     FROM notification_jobs job
     JOIN bookings booking ON booking.id = job.booking_id
     LEFT JOIN service_settings service ON service.id = booking.service_id
     LEFT JOIN employees employee ON employee.id = booking.employee_id
     WHERE (
         (booking.deleted_at IS NULL AND booking.status = 'confirmed'
           AND job.type IN ('confirmation','reminder','reschedule'))
         OR (booking.status = 'cancelled' AND job.type = 'cancellation')
       )
       AND (
         booking.operation_token IS NULL OR booking.operation_started_at IS NULL
         OR booking.operation_started_at < ?
       )
       AND (job.attempts < 8 OR job.last_error = 'email_not_configured' OR job.status = 'sending')
       AND (job.type != 'reschedule' OR job.due_at = booking.updated_at)
       AND (
         job.status = 'pending'
         OR (job.status = 'failed' AND job.last_error = 'email_not_configured')
         OR (job.status = 'sending' AND job.updated_at <= ?)
       )
       AND (
         job.status = 'sending'
         OR job.updated_at <= CASE
           WHEN job.attempts <= 0 THEN ?
           WHEN job.attempts = 1 THEN ?
           WHEN job.attempts = 2 THEN ?
           WHEN job.attempts = 3 THEN ?
           WHEN job.attempts = 4 THEN ?
           WHEN job.attempts = 5 THEN ?
           WHEN job.attempts = 6 THEN ?
           ELSE ?
         END
       )
     ORDER BY CASE job.type
       WHEN 'reminder' THEN 0
       WHEN 'cancellation' THEN 1
       WHEN 'reschedule' THEN 2
       ELSE 3
     END,job.updated_at ASC
     LIMIT 20`,
  )
    .bind(staleBefore, staleBefore, ...retryCutoffs)
    .all<OutboxRow>();

  let processed = 0;
  for (const job of result.results ?? []) {
    if (processed >= safeLimit || !outboxRetryReady(job, now)) continue;
    if (job.status === "sending") {
      const released = await env.DB.prepare(
        `UPDATE notification_jobs SET status = 'pending',updated_at = ?
         WHERE id = ? AND status = 'sending' AND updated_at = ?
           AND EXISTS (
             SELECT 1 FROM bookings booking
             WHERE booking.id = notification_jobs.booking_id
               AND (
                 booking.operation_token IS NULL OR booking.operation_started_at IS NULL
                 OR booking.operation_started_at < ?
               )
           )`,
      )
        .bind(new Date().toISOString(), job.id, job.updated_at, staleBefore)
        .run();
      if ((released.meta.changes ?? 0) !== 1) continue;
    }

    const startsAt = Date.parse(job.starts_at);
    const reminderMatchesBooking = job.type !== "reminder" || (
      Number.isFinite(startsAt) &&
      Date.parse(job.due_at) === startsAt - 24 * 60 * 60 * 1_000
    );
    if (!reminderMatchesBooking) {
      const reconciled = await cancelBookingReminders({
        bookingId: job.booking_id,
        email: job.email,
        firstName: job.first_name,
        serviceName: job.service_name || "Frizerska usluga",
        staffName: job.staff_name || "Marinela Hair Design",
        dateLabel: `${job.date_local.split("-").reverse().join(".")}.`,
        time: job.start_time_local,
        startsAt: job.starts_at,
        endsAt: job.ends_at,
        calendarSequence: Math.max(0, job.calendar_sequence || 0),
      }, { jobId: job.id }).catch(() => false);
      if (reconciled) {
        await env.DB.prepare(
          "UPDATE notification_jobs SET last_error = 'superseded',updated_at = ? WHERE id = ? AND status = 'cancelled'",
        )
          .bind(new Date().toISOString(), job.id)
          .run();
      }
      processed += 1;
      continue;
    }
    const reminderScheduledAt = job.type === "reminder" && Date.parse(job.due_at) > Date.now()
      ? job.due_at
      : undefined;
    if (job.type === "reminder" && (!reminderScheduledAt || !Number.isFinite(startsAt) || startsAt <= Date.now())) {
      await env.DB.prepare(
        `UPDATE notification_jobs SET status = 'failed',last_error = 'reminder_window_elapsed',updated_at = ?
         WHERE id = ? AND status IN ('pending','failed')`,
      )
        .bind(new Date().toISOString(), job.id)
        .run();
      processed += 1;
      continue;
    }

    await deliverBookingNotification({
      details: {
        bookingId: job.booking_id,
        email: job.email,
        firstName: job.first_name,
        serviceName: job.service_name || "Frizerska usluga",
        staffName: job.staff_name || "Marinela Hair Design",
        dateLabel: `${job.date_local.split("-").reverse().join(".")}.`,
        time: job.start_time_local,
        startsAt: job.starts_at,
        endsAt: job.ends_at,
        calendarSequence: Math.max(0, job.calendar_sequence || 0),
      },
      type: job.type,
      dueAt: job.due_at,
      ...(reminderScheduledAt ? { scheduledAt: reminderScheduledAt } : {}),
    }).catch(() => undefined);
    processed += 1;
  }
  return processed;
}

async function providerReminderIsResolved(providerId: string) {
  const before = await getBookingEmailProviderStatus(providerId)
    .catch(() => ({ state: "unknown" as const, scheduledAt: null, lastEvent: null }));
  if (before.state === "missing" || before.state === "not_scheduled") return true;

  const cancelled = await cancelScheduledBookingEmail(providerId).catch(() => false);
  if (cancelled) return true;

  const after = await getBookingEmailProviderStatus(providerId)
    .catch(() => ({ state: "unknown" as const, scheduledAt: null, lastEvent: null }));
  if (after.state === "missing" || after.state === "not_scheduled") return true;
  return false;
}

async function markReminderCancelled(jobId: string) {
  const cancelled = await env.DB.prepare(
    `UPDATE notification_jobs SET status = 'cancelled', updated_at = ?
     WHERE id = ? AND status IN ('pending','failed','sending','scheduled')`,
  )
    .bind(new Date().toISOString(), jobId)
    .run();
  if ((cancelled.meta.changes ?? 0) === 1) return true;
  const current = await env.DB.prepare(
    "SELECT status FROM notification_jobs WHERE id = ? LIMIT 1",
  )
    .bind(jobId)
    .first<{ status: string }>();
  return current?.status === "cancelled";
}

export async function cancelBookingReminders(
  details: BookingNotificationDetails,
  options: { jobId?: string } = {},
) {
  const currentProviderAccountKey = await bookingEmailProviderAccountKey();
  const result = await env.DB.prepare(
    `SELECT id,status,provider_id,attempts,due_at,created_at,provider_account_key,provider_generation,payload_snapshot,last_error
     FROM notification_jobs
     WHERE booking_id = ? AND type = 'reminder'
       AND status IN ('pending','failed','sending','scheduled')
       AND (? IS NULL OR id = ?)`,
  )
    .bind(details.bookingId, options.jobId ?? null, options.jobId ?? null)
    .all<NotificationRow>();
  const jobs = result.results ?? [];
  let allCancelled = true;
  for (const job of jobs) {
    const failedBeforeProvider =
      job.attempts === 1 &&
      !job.provider_id &&
      (job.last_error === "email_not_configured" || job.last_error === "invalid_schedule_window");
    if (
      (job.status === "pending" && job.attempts === 0 && !job.provider_id) ||
      failedBeforeProvider
    ) {
      if (!(await markReminderCancelled(job.id))) allCancelled = false;
      continue;
    }

    if (!currentProviderAccountKey) {
      allCancelled = false;
      continue;
    }

    const providerIds = new Set<string>();
    if (job.provider_id) providerIds.add(job.provider_id);
    if (currentProviderAccountKey !== job.provider_account_key) {
      if (job.provider_id) {
        const providerVerified = await verifyBookingReminderProvider({
          providerId: job.provider_id,
          bookingId: details.bookingId,
          email: details.email,
          scheduledAt: job.due_at,
          generation: job.provider_generation,
        }).catch(() => false);
        if (!providerVerified) {
          allCancelled = false;
          continue;
        }
      } else {
        const proof = await findBookingReminderProviderIds({
          bookingId: details.bookingId,
          email: details.email,
          scheduledAt: job.due_at,
          createdAt: job.created_at,
          generation: job.provider_generation,
        }).catch(() => ({ complete: false, providerIds: [] as string[] }));
        for (const providerId of proof.providerIds) providerIds.add(providerId);
        if (!proof.complete || !providerIds.size) {
          allCancelled = false;
          continue;
        }
      }
      const adoptedProviderId = providerIds.values().next().value as string;
      const adopted = await env.DB.prepare(
        `UPDATE notification_jobs
         SET provider_account_key = ?, provider_id = COALESCE(provider_id, ?), updated_at = ?
         WHERE id = ? AND status = ? AND provider_id IS ? AND provider_account_key IS ?`,
      )
        .bind(
          currentProviderAccountKey,
          adoptedProviderId,
          new Date().toISOString(),
          job.id,
          job.status,
          job.provider_id,
          job.provider_account_key,
        )
        .run()
        .catch(() => null);
      if ((adopted?.meta.changes ?? 0) !== 1) {
        allCancelled = false;
        continue;
      }
    }

    if (!providerIds.size) {
      const firstAttempt = Date.parse(job.created_at);
      if (!Number.isFinite(firstAttempt)) {
        allCancelled = false;
        continue;
      }
      if (firstAttempt >= Date.now() - 24 * 60 * 60 * 1000) {
        const recoveryDetails = parseNotificationSnapshot(job.payload_snapshot) ?? details;
        const recovered = await sendBookingEmail({
          ...recoveryDetails,
          type: "reminder",
          scheduledAt: job.due_at,
          calendarStamp: job.created_at,
          generation: job.provider_generation,
        }).catch(() => ({
          accepted: false,
          configured: true,
          providerId: null,
          retryable: true,
          errorCode: "network_error",
        }));
        if (recovered.accepted && recovered.providerId) {
          providerIds.add(recovered.providerId);
        }
      }

      if (!providerIds.size) {
        const lookup = await findBookingReminderProviderIds({
          bookingId: details.bookingId,
          email: details.email,
          scheduledAt: job.due_at,
          createdAt: job.created_at,
          generation: job.provider_generation,
        }).catch(() => ({ complete: false, providerIds: [] as string[] }));
        for (const providerId of lookup.providerIds) providerIds.add(providerId);
        if (!lookup.complete || (!providerIds.size && firstAttempt > Date.now() - 5 * 60 * 1000)) {
          allCancelled = false;
          continue;
        }
        if (!providerIds.size) {
          if (!(await markReminderCancelled(job.id))) allCancelled = false;
          continue;
        }
      }

      const recoveredProviderId = providerIds.values().next().value as string;
      const persisted = await env.DB.prepare(
        `UPDATE notification_jobs
         SET status = 'scheduled', provider_id = ?, last_error = NULL, updated_at = ?
         WHERE id = ? AND status = ? AND provider_id IS NULL AND provider_account_key = ?`,
      )
        .bind(
          recoveredProviderId,
          new Date().toISOString(),
          job.id,
          job.status,
          currentProviderAccountKey,
        )
        .run()
        .catch(() => null);
      if ((persisted?.meta.changes ?? 0) !== 1) {
        for (const providerId of providerIds) {
          await cancelScheduledBookingEmail(providerId).catch(() => false);
        }
        allCancelled = false;
        continue;
      }
    }

    let providersResolved = true;
    for (const providerId of providerIds) {
      if (!(await providerReminderIsResolved(providerId))) {
        providersResolved = false;
      }
    }
    if (!providersResolved) {
      allCancelled = false;
      continue;
    }
    if (!(await markReminderCancelled(job.id))) allCancelled = false;
  }
  return allCancelled;
}
