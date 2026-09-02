import { env } from "cloudflare:workers";

import {
  renderBookingEmail,
  type BookingEmailType,
} from "./booking-email-template";

export type { BookingEmailType } from "./booking-email-template";

type RuntimeEnv = Record<string, string | undefined>;

export type BookingEmailInput = {
  bookingId: string;
  type: BookingEmailType;
  email: string;
  firstName: string;
  serviceName: string;
  staffName: string;
  dateLabel: string;
  time: string;
  startsAt: string;
  endsAt: string;
  calendarSequence?: number;
  calendarStamp?: string;
  scheduledAt?: string;
  generation?: number;
  deliveryKey?: string;
};

export type BookingEmailResult = {
  accepted: boolean;
  configured: boolean;
  providerId: string | null;
  retryable: boolean;
  errorCode: string | null;
};

export type BookingEmailProviderStatus = {
  state: "scheduled" | "not_scheduled" | "missing" | "unknown";
  scheduledAt: string | null;
  lastEvent: string | null;
};

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function senderEmail(value: string) {
  const bracketed = /<([^<>\s]+@[^<>\s]+)>/.exec(value)?.[1];
  if (bracketed) return bracketed;
  return /^\S+@\S+\.\S+$/.test(value.trim()) ? value.trim() : undefined;
}

export async function bookingEmailProviderAccountKey() {
  const apiKey = runtimeEnv().RESEND_API_KEY;
  if (!apiKey) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(apiKey),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bookingEmailConfigured() {
  const runtime = runtimeEnv();
  return Boolean(runtime.RESEND_API_KEY && runtime.BOOKING_EMAIL_FROM);
}

export async function sendBookingEmail(input: BookingEmailInput): Promise<BookingEmailResult> {
  const runtime = runtimeEnv();
  const apiKey = runtime.RESEND_API_KEY;
  const from = runtime.BOOKING_EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      accepted: false,
      configured: false,
      providerId: null,
      retryable: false,
      errorCode: "email_not_configured",
    };
  }

  if (input.scheduledAt) {
    const scheduleTime = new Date(input.scheduledAt).getTime();
    const maximum = Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(scheduleTime) || scheduleTime <= Date.now() || scheduleTime > maximum) {
      return {
        accepted: false,
        configured: true,
        providerId: null,
        retryable: false,
        errorCode: "invalid_schedule_window",
      };
    }
  }

  const content = renderBookingEmail({
    ...input,
    organizerEmail: senderEmail(from),
  });
  const lifecycleKey = input.deliveryKey
    ? `job-${input.deliveryKey}`
    : input.scheduledAt ?? "now";
  const idempotencyKey = [
    "marinela",
    input.bookingId,
    input.type,
    lifecycleKey,
    String(input.generation ?? 0),
  ].join("/");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      ...(runtime.BOOKING_EMAIL_REPLY_TO ? { reply_to: runtime.BOOKING_EMAIL_REPLY_TO } : {}),
      subject: content.subject,
      ...(input.scheduledAt ? { scheduled_at: input.scheduledAt } : {}),
      tags: [
        { name: "booking_id", value: input.bookingId },
        { name: "email_type", value: input.type },
        { name: "generation", value: String(input.generation ?? 0) },
      ],
      text: content.text,
      html: content.html,
      ...(content.calendar
        ? {
            attachments: [
              {
                filename: "marinela-hair-design-termin.ics",
                content: utf8Base64(content.calendar.ics),
              },
            ],
          }
        : {}),
    }),
    signal: AbortSignal.timeout(8_000),
  });

  let payload: { id?: string; name?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const accepted = response.ok && Boolean(payload.id);
  return {
    accepted,
    configured: true,
    providerId: response.ok ? payload.id ?? null : null,
    retryable:
      (response.ok && !payload.id) ||
      response.status === 408 ||
      response.status === 409 ||
      response.status === 429 ||
      response.status >= 500,
    errorCode: accepted
      ? null
      : response.ok
        ? "resend_missing_id"
        : payload.name ?? `resend_${response.status}`,
  };
}

type RetrievedEmail = {
  id?: unknown;
  to?: unknown;
  created_at?: unknown;
  last_event?: unknown;
  scheduled_at?: unknown;
  tags?: unknown;
};

async function retrieveBookingEmail(providerId: string) {
  const apiKey = runtimeEnv().RESEND_API_KEY;
  if (!apiKey) return { status: 0, payload: null as RetrievedEmail | null };
  const response = await fetch(
    `https://api.resend.com/emails/${encodeURIComponent(providerId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) return { status: response.status, payload: null as RetrievedEmail | null };
  const payload = await response.json().catch(() => null) as RetrievedEmail | null;
  return { status: response.status, payload };
}

export async function getBookingEmailProviderStatus(
  providerId: string,
): Promise<BookingEmailProviderStatus> {
  const retrieved = await retrieveBookingEmail(providerId);
  if (retrieved.status === 404) {
    return { state: "missing", scheduledAt: null, lastEvent: null };
  }
  if (retrieved.status !== 200) {
    return { state: "unknown", scheduledAt: null, lastEvent: null };
  }
  const payload = retrieved.payload;
  if (!payload || payload.id !== providerId || typeof payload.last_event !== "string") {
    return { state: "unknown", scheduledAt: null, lastEvent: null };
  }
  const scheduledAt = typeof payload.scheduled_at === "string"
    ? payload.scheduled_at
    : null;
  if (payload.last_event === "scheduled") {
    return { state: "scheduled", scheduledAt, lastEvent: payload.last_event };
  }
  const conclusiveEvents = new Set([
    "bounced",
    "canceled",
    "clicked",
    "complained",
    "delivered",
    "delivery_delayed",
    "failed",
    "opened",
    "queued",
    "sent",
    "suppressed",
  ]);
  return {
    state: conclusiveEvents.has(payload.last_event) ? "not_scheduled" : "unknown",
    scheduledAt,
    lastEvent: payload.last_event,
  };
}

export async function verifyBookingReminderProvider(input: {
  providerId: string;
  bookingId: string;
  email: string;
  scheduledAt: string;
  generation: number;
}) {
  const retrieved = await retrieveBookingEmail(input.providerId);
  const payload = retrieved.payload;
  if (retrieved.status !== 200 || !payload || payload.id !== input.providerId) return false;
  const recipients = Array.isArray(payload.to)
    ? payload.to.filter((value): value is string => typeof value === "string")
    : [];
  if (!recipients.some((value) => value.toLowerCase() === input.email.toLowerCase())) return false;
  const scheduleMatches =
    typeof payload.scheduled_at === "string" &&
    Date.parse(payload.scheduled_at) === Date.parse(input.scheduledAt);
  const terminalEvents = new Set([
    "bounced",
    "canceled",
    "clicked",
    "complained",
    "delivered",
    "delivery_delayed",
    "failed",
    "opened",
    "queued",
    "sent",
    "suppressed",
  ]);
  if (!scheduleMatches && !terminalEvents.has(String(payload.last_event ?? ""))) {
    return false;
  }
  const tags = Array.isArray(payload.tags)
    ? payload.tags as Array<{ name?: unknown; value?: unknown }>
    : [];
  const bookingTag = tags.find((tag) => tag.name === "booking_id");
  const typeTag = tags.find((tag) => tag.name === "email_type");
  const generationTag = tags.find((tag) => tag.name === "generation");
  return (
    (!bookingTag || bookingTag.value === input.bookingId) &&
    (!typeTag || typeTag.value === "reminder") &&
    (!generationTag || generationTag.value === String(input.generation))
  );
}

export async function findBookingReminderProviderIds(input: {
  bookingId: string;
  email: string;
  scheduledAt: string;
  createdAt: string;
  generation: number;
}) {
  const apiKey = runtimeEnv().RESEND_API_KEY;
  const scheduledAt = Date.parse(input.scheduledAt);
  const createdAt = Date.parse(input.createdAt);
  if (!apiKey || !Number.isFinite(scheduledAt) || !Number.isFinite(createdAt)) {
    return { complete: false, providerIds: [] as string[] };
  }

  const providerIds = new Set<string>();
  const createdCutoff = createdAt - 5 * 60 * 1000;
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://api.resend.com/emails");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { complete: false, providerIds: [...providerIds] };
    const payload = await response.json().catch(() => null) as {
      has_more?: unknown;
      data?: unknown;
    } | null;
    if (!payload || typeof payload.has_more !== "boolean" || !Array.isArray(payload.data)) {
      return { complete: false, providerIds: [...providerIds] };
    }

    let oldestCreatedAt = Number.POSITIVE_INFINITY;
    for (const candidate of payload.data as RetrievedEmail[]) {
      if (typeof candidate.id !== "string" || typeof candidate.created_at !== "string") {
        return { complete: false, providerIds: [...providerIds] };
      }
      const candidateCreatedAt = Date.parse(candidate.created_at);
      if (Number.isFinite(candidateCreatedAt)) {
        oldestCreatedAt = Math.min(oldestCreatedAt, candidateCreatedAt);
      }
      const recipients = Array.isArray(candidate.to)
        ? candidate.to.filter((value): value is string => typeof value === "string")
        : [];
      if (
        !recipients.some((value) => value.toLowerCase() === input.email.toLowerCase()) ||
        typeof candidate.scheduled_at !== "string" ||
        Date.parse(candidate.scheduled_at) !== scheduledAt
      ) {
        continue;
      }
      const retrieved = await retrieveBookingEmail(candidate.id);
      if (retrieved.status !== 200 || !retrieved.payload) {
        return { complete: false, providerIds: [...providerIds] };
      }
      const tags = Array.isArray(retrieved.payload.tags)
        ? retrieved.payload.tags as Array<{ name?: unknown; value?: unknown }>
        : [];
      const bookingMatches = tags.some(
        (tag) => tag.name === "booking_id" && tag.value === input.bookingId,
      );
      const typeMatches = tags.some(
        (tag) => tag.name === "email_type" && tag.value === "reminder",
      );
      const generationMatches = tags.some(
        (tag) => tag.name === "generation" && tag.value === String(input.generation),
      );
      if (bookingMatches && typeMatches && generationMatches) providerIds.add(candidate.id);
    }

    if (!payload.has_more || oldestCreatedAt < createdCutoff) {
      return { complete: true, providerIds: [...providerIds] };
    }
    const last = payload.data.at(-1) as RetrievedEmail | undefined;
    if (!last || typeof last.id !== "string") {
      return { complete: false, providerIds: [...providerIds] };
    }
    cursor = last.id;
  }
  return { complete: false, providerIds: [...providerIds] };
}

export async function cancelScheduledBookingEmail(providerId: string) {
  const apiKey = runtimeEnv().RESEND_API_KEY;
  if (!apiKey) return false;
  const response = await fetch(
    `https://api.resend.com/emails/${encodeURIComponent(providerId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    },
  );
  return response.ok;
}
