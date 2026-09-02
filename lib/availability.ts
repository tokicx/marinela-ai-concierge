import { env } from "cloudflare:workers";
import type { Service } from "../app/salon-data";
import { isCroatianPublicHoliday } from "./croatian-holidays";
import {
  hasGoogleCalendarConnection,
  readGoogleBusy,
  readGoogleBusyExcludingEvent,
} from "./google-calendar";
import { loadOpeningHours, type OpeningHourSetting } from "./salon-settings";
import { addLocalMinutes, localMinutesToTime, localTimeToMinutes, zonedLocalToUtc } from "./time";

type StaffId = "marinela" | "mia";
type BusyPeriod = { start: string; end: string };
type AvailabilityOptions = {
  excludeBookingId?: string;
  excludeGoogleEvent?: { eventId: string; connectionId: string };
};

export type DateAvailability = {
  times: string[];
  employeeByTime: Record<string, StaffId>;
  checked: boolean;
};

type EmployeeDateAvailability = {
  checked: boolean;
  timesByDate: Record<string, string[]>;
};

function workingWindow(dateLocal: string, schedule: OpeningHourSetting[]) {
  if (isCroatianPublicHoliday(dateLocal)) return null;
  const weekday = new Date(`${dateLocal}T12:00:00Z`).getUTCDay();
  const entry = schedule.find((item) => item.dayOfWeek === weekday);
  if (!entry || entry.closed) return null;
  return {
    open: localTimeToMinutes(entry.openTime),
    close: localTimeToMinutes(entry.closeTime),
  };
}

function overlaps(startsAt: Date, endsAt: Date, busy: BusyPeriod[]) {
  return busy.some((period) => {
    const busyStart = new Date(period.start).getTime();
    const busyEnd = new Date(period.end).getTime();
    return startsAt.getTime() < busyEnd && endsAt.getTime() > busyStart;
  });
}

async function localBusy(
  employeeId: StaffId,
  dayStart: Date,
  dayEnd: Date,
  options: AvailabilityOptions = {},
): Promise<BusyPeriod[] | null> {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return null;
  try {
    const result = await database
      .prepare(
        `SELECT starts_at AS start,COALESCE(blocked_until,ends_at) AS end
         FROM bookings
         WHERE employee_id = ? AND deleted_at IS NULL
           AND status IN ('pending_calendar','pending_confirmation','confirmed','needs_attention')
           AND starts_at < ? AND COALESCE(blocked_until,ends_at) > ?
           ${options.excludeBookingId ? "AND id != ?" : ""}`,
      )
      .bind(
        employeeId,
        dayEnd.toISOString(),
        dayStart.toISOString(),
        ...(options.excludeBookingId ? [options.excludeBookingId] : []),
      )
      .all<BusyPeriod>();
    return result.results ?? [];
  } catch {
    return null;
  }
}

function emptyTimesByDate(dates: string[]) {
  return Object.fromEntries(dates.map((date) => [date, [] as string[]]));
}

async function availabilityForEmployeeDates(
  service: Service,
  employeeId: StaffId,
  dates: string[],
  schedule: OpeningHourSetting[],
  options: AvailabilityOptions = {},
): Promise<EmployeeDateAvailability> {
  const timesByDate = emptyTimesByDate(dates);
  if (!service.staffIds.includes(employeeId)) return { checked: true, timesByDate };

  const windows = dates.flatMap((dateLocal) => {
    const window = workingWindow(dateLocal, schedule);
    if (!window) return [];
    return [{
      dateLocal,
      open: window.open,
      close: window.close,
      dayStart: zonedLocalToUtc(dateLocal, localMinutesToTime(window.open)),
      dayEnd: zonedLocalToUtc(dateLocal, localMinutesToTime(window.close)),
    }];
  });
  if (!windows.length) return { checked: true, timesByDate };

  const googleConnected = await hasGoogleCalendarConnection(employeeId);
  if (!googleConnected) return { checked: false, timesByDate };

  const rangeStart = new Date(Math.min(...windows.map((entry) => entry.dayStart.getTime())));
  const rangeEnd = new Date(Math.max(...windows.map((entry) => entry.dayEnd.getTime())));
  const google = await (options.excludeGoogleEvent
    ? readGoogleBusyExcludingEvent(
        employeeId,
        rangeStart,
        rangeEnd,
        options.excludeGoogleEvent.eventId,
        options.excludeGoogleEvent.connectionId,
      )
    : readGoogleBusy(employeeId, rangeStart, rangeEnd)
  ).catch(() => null);
  if (google === null) return { checked: false, timesByDate };
  const local = await localBusy(employeeId, rangeStart, rangeEnd, options);
  if (local === null) return { checked: false, timesByDate };
  const busy = [...local, ...google];

  for (const window of windows) {
    const times: string[] = [];
    for (
      let cursor = window.open;
      cursor + service.duration + service.buffer <= window.close;
      cursor += 30
    ) {
      const time = localMinutesToTime(cursor);
      const startsAt = zonedLocalToUtc(window.dateLocal, time);
      if (startsAt.getTime() <= Date.now()) continue;
      const endsAt = zonedLocalToUtc(
        window.dateLocal,
        addLocalMinutes(time, service.duration + service.buffer),
      );
      if (!overlaps(startsAt, endsAt, busy)) times.push(time);
    }
    timesByDate[window.dateLocal] = times;
  }

  return { checked: true, timesByDate };
}

export async function availableTimesForDates(
  service: Service,
  staffId: StaffId | "first",
  dateLocals: string[],
  options: AvailabilityOptions = {},
) {
  const dates = Array.from(new Set(dateLocals));
  const schedule = await loadOpeningHours({ strict: true });
  const employeeIds = staffId === "first" ? service.staffIds : [staffId];
  const perEmployee = await Promise.all(
    employeeIds.map(async (employeeId) => ({
      employeeId,
      ...(await availabilityForEmployeeDates(service, employeeId, dates, schedule, options)),
    })),
  );

  return Object.fromEntries(
    dates.map((dateLocal) => {
      const verifiedEmployees = perEmployee.filter((entry) => entry.checked);
      const merged = Array.from(
        new Set(verifiedEmployees.flatMap((entry) => entry.timesByDate[dateLocal] ?? [])),
      ).sort();
      const employeeByTime = Object.fromEntries(
        merged.map((time) => [
          time,
          verifiedEmployees.find((entry) => entry.timesByDate[dateLocal]?.includes(time))
            ?.employeeId ?? employeeIds[0],
        ]),
      ) as Record<string, StaffId>;
      return [
        dateLocal,
        {
          times: merged,
          employeeByTime,
          checked: merged.length > 0 || perEmployee.every((entry) => entry.checked),
        } satisfies DateAvailability,
      ];
    }),
  ) as Record<string, DateAvailability>;
}

export async function availableTimesForEmployee(
  service: Service,
  employeeId: StaffId,
  dateLocal: string,
  options: AvailabilityOptions = {},
) {
  const result = await availableTimesForDates(service, employeeId, [dateLocal], options);
  return result[dateLocal]?.times ?? [];
}

export async function availableTimes(
  service: Service,
  staffId: StaffId | "first",
  dateLocal: string,
  options: AvailabilityOptions = {},
) {
  const result = await availableTimesForDates(service, staffId, [dateLocal], options);
  return result[dateLocal] ?? { times: [], employeeByTime: {}, checked: false };
}
