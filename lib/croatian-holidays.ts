// Public holidays established by Croatia's current holiday law (NN 110/19).
// Movable holidays are derived from Gregorian Easter for every year.
const fixedHolidays = new Map<string, string>([
  ["01-01", "Nova godina"],
  ["01-06", "Bogojavljenje ili Sveta tri kralja"],
  ["05-01", "Praznik rada"],
  ["05-30", "Dan državnosti"],
  ["06-22", "Dan antifašističke borbe"],
  ["08-05", "Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja"],
  ["08-15", "Velika Gospa"],
  ["11-01", "Svi sveti"],
  ["11-18", "Dan sjećanja na žrtve Domovinskog rata i žrtvu Vukovara i Škabrnje"],
  ["12-25", "Božić"],
  ["12-26", "Sveti Stjepan"],
]);

function isoUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function gregorianEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function parsedIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

export function croatianPublicHolidayName(dateLocal: string) {
  const parsed = parsedIsoDate(dateLocal);
  if (!parsed) return null;

  const fixed = fixedHolidays.get(
    `${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`,
  );
  if (fixed) return fixed;

  const easter = gregorianEasterSunday(parsed.year);
  const movable = new Map<string, string>([
    [isoUtc(easter), "Uskrs"],
    [isoUtc(addUtcDays(easter, 1)), "Uskrsni ponedjeljak"],
    [isoUtc(addUtcDays(easter, 60)), "Tijelovo"],
  ]);
  return movable.get(dateLocal) ?? null;
}

export function isCroatianPublicHoliday(dateLocal: string) {
  return croatianPublicHolidayName(dateLocal) !== null;
}
