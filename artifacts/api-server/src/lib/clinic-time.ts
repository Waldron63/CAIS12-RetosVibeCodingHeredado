// The clinic works on Bogotá time (UTC-5, no daylight saving).
export const CLINIC_TIME_ZONE = "America/Bogota";
const CLINIC_UTC_OFFSET = "-05:00";
const DAY_MS = 24 * 60 * 60 * 1000;

const clinicDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clinicDateTimeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Calendar date (YYYY-MM-DD) of an instant on the clinic's clock. */
export function clinicDate(instant: Date): string {
  return clinicDateFormat.format(instant);
}

/** "YYYY-MM-DD HH:mm" of an instant on the clinic's clock. */
export function clinicDateTime(instant: Date): string {
  const parts = Object.fromEntries(
    clinicDateTimeFormat.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** First instant of a clinic calendar day (YYYY-MM-DD). */
export function clinicDayStart(date: string): Date {
  return new Date(`${date}T00:00:00${CLINIC_UTC_OFFSET}`);
}

/**
 * Window covering the last `days` clinic calendar days, today included.
 * `from` is inclusive and `to` (start of tomorrow) is exclusive.
 */
export function lastDaysWindow(days: number, now: Date = new Date()): { from: Date; to: Date } {
  const startOfToday = clinicDayStart(clinicDate(now));
  return {
    from: new Date(startOfToday.getTime() - (days - 1) * DAY_MS),
    to: new Date(startOfToday.getTime() + DAY_MS),
  };
}

// A date-only value ("2026-10-30") means that day on the clinic's clock, not UTC midnight.
export function dateOnlyToClinicNoon(value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T12:00:00${CLINIC_UTC_OFFSET}`;
  }
  return value;
}
