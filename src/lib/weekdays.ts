/** Days of the week in display order (Monday first); `value` is the ISO number 1 = Monday .. 7 = Sunday. */
export const WEEKDAYS = [
  { value: 1, short: "pn", label: "poniedziałek" },
  { value: 2, short: "wt", label: "wtorek" },
  { value: 3, short: "śr", label: "środa" },
  { value: 4, short: "cz", label: "czwartek" },
  { value: 5, short: "pt", label: "piątek" },
  { value: 6, short: "so", label: "sobota" },
  { value: 7, short: "nd", label: "niedziela" },
] as const;

const WEEKDAY_FROM_PHRASES = [
  "z poniedziałku",
  "z wtorku",
  "ze środy",
  "z czwartku",
  "z piątku",
  "z soboty",
  "z niedzieli",
] as const;

/** Genitive phrase for the weekday of an ISO date (`YYYY-MM-DD`), e.g. "ze środy"; computed in UTC so the day never shifts by timezone. */
export function formatWeekdayFrom(iso: string): string {
  // getUTCDay: 0 = Sunday .. 6 = Saturday; the table starts on Monday.
  const day = new Date(iso).getUTCDay();
  // Not a date (empty or malformed input): no phrase rather than "undefined" in the view.
  if (Number.isNaN(day)) return "";
  return WEEKDAY_FROM_PHRASES[(day + 6) % 7];
}
