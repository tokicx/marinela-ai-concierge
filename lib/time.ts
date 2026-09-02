export const SALON_TIME_ZONE = "Europe/Zagreb";

const zagrebParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: SALON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function zonedLocalToUtc(dateLocal: string, timeLocal: string) {
  const [year, month, day] = dateLocal.split("-").map(Number);
  const [hour, minute] = timeLocal.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = Object.fromEntries(
    zagrebParts
      .formatToParts(new Date(guess))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = representedAsUtc - guess;
  return new Date(guess - offset);
}

export function localMinutesToTime(totalMinutes: number) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

export function localTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function addLocalMinutes(time: string, minutes: number) {
  return localMinutesToTime(localTimeToMinutes(time) + minutes);
}

export function utcSlotKeys(startsAt: Date, durationMinutes: number, bufferMinutes: number) {
  const keys: string[] = [];
  const until = startsAt.getTime() + (durationMinutes + bufferMinutes) * 60_000;
  for (let cursor = startsAt.getTime(); cursor < until; cursor += 15 * 60_000) {
    keys.push(new Date(cursor).toISOString().slice(0, 16));
  }
  return keys;
}

export function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function salonDateString(date = new Date()) {
  const parts = Object.fromEntries(
    zagrebParts
      .formatToParts(date)
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addIsoCalendarDays(value: string, days: number) {
  if (!isIsoDate(value) || !Number.isSafeInteger(days)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day, 12));
  calendarDate.setUTCDate(calendarDate.getUTCDate() + days);
  return calendarDate.toISOString().slice(0, 10);
}

export function bookingWindowEndDate(now = new Date()) {
  return addIsoCalendarDays(salonDateString(now), 30)!;
}

export function isDateWithinBookingWindow(value: string, now = new Date()) {
  if (!isIsoDate(value)) return false;
  return value >= salonDateString(now) && value <= bookingWindowEndDate(now);
}

export function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
