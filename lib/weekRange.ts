function pad2(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

export function toDateOnlyString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toSortValueFromDateOnly(dateOnly: string): number {
  // YYYY-MM-DD -> YYYYMMDD number
  const compact = dateOnly.replaceAll("-", "");
  return Number(compact);
}

/** Parses "YYYY-MM-DD" as a local date (new Date("YYYY-MM-DD") would be UTC midnight). */
export function parseDateOnly(dateOnly: string): Date | null {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || toDateOnlyString(date) !== dateOnly ? null : date;
}

/** "2026-07-27" -> "July 27 — August 2", the format stored in meal_plans.week_range. */
export function formatWeekRange(weekStartDateOnly: string): string {
  const start = parseDateOnly(weekStartDateOnly);
  if (!start) throw new Error(`Invalid week start date: ${weekStartDateOnly}`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const format = (date: Date) => date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `${format(start)} — ${format(end)}`;
}

export function getWeekStartDateOnly(reference: Date = new Date()): string {
  // Monday-start week
  const date = new Date(reference);
  const day = date.getDay(); // 0=Sun
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return toDateOnlyString(date);
}

export function deriveWeekStartDateOnlyFromWeekRange(
  weekRange: string,
  reference: Date = new Date()
): string | null {
  // Accept:
  // - "April 27 — May 3"
  // - "April 27 — May 3, 2026"
  // - "April 27, 2026 — May 3, 2026"
  const match = weekRange.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/);
  if (!match) return null;

  const [, monthName, dayStr, yearStr] = match;
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  const monthIndex = months.indexOf(monthName.toLowerCase());
  if (monthIndex < 0) return null;

  const day = Number(dayStr);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;

  const year = yearStr ? Number(yearStr) : reference.getFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 3000) return null;

  const start = new Date(year, monthIndex, day);
  if (Number.isNaN(start.getTime())) return null;

  return toDateOnlyString(start);
}

