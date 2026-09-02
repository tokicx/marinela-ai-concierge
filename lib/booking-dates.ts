import { isCroatianPublicHoliday } from "./croatian-holidays";
import { isIsoDate } from "./time";
import type { OpeningHourSetting } from "./salon-settings";

export type BookingDateOption = {
  iso: string;
  day: string;
  date: string;
  month: string;
};

function calendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function isoUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function createBookingDateOptions(
  openingHours: OpeningHourSetting[],
  startDate: string,
  endDate: string,
) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) return [];

  const options: BookingDateOption[] = [];
  const formatterDay = new Intl.DateTimeFormat("hr-HR", {
    weekday: "short",
    timeZone: "UTC",
  });
  const formatterMonth = new Intl.DateTimeFormat("hr-HR", {
    month: "short",
    timeZone: "UTC",
  });
  const cursor = calendarDate(startDate);

  while (options.length < 15) {
    const candidateIso = isoUtcDate(cursor);
    if (candidateIso > endDate) break;
    const weekday = cursor.getUTCDay();
    const open = openingHours.find((entry) => entry.dayOfWeek === weekday)?.closed === false;
    if (open && !isCroatianPublicHoliday(candidateIso)) {
      options.push({
        iso: candidateIso,
        day: formatterDay.format(cursor).replace(".", ""),
        date: String(cursor.getUTCDate()).padStart(2, "0"),
        month: formatterMonth.format(cursor).replace(".", ""),
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return options;
}
