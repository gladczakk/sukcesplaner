const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats an ISO date (`YYYY-MM-DD`) as e.g. "20 cze 2027". UTC keeps the day from shifting by timezone. */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

const timestampFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Warsaw",
});

/** Formats an ISO timestamp (e.g. `created_at`, `completed_at`) as a day in Warsaw time, e.g. "20 cze 2027". */
export function formatTimestamp(iso: string): string {
  return timestampFormatter.format(new Date(iso));
}

/**
 * Polish plural form: `forms` = [one, few, many].
 * 1 -> one; n%10 in 2..4 and n%100 not in 12..14 -> few; everything else (0, 5..21, 12..14) -> many.
 * Examples: 0 zadań, 1 zadanie, 2 zadania, 12 zadań, 22 zadania, 25 zadań; 1 milestone, 3 milestony, 5 milestonów.
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  if (n === 1) return forms[0];
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Label of a task rhythm: 1 -> "codziennie", 2 -> "co 2 dni", 5 -> "co 5 dni". */
export function formatRecurrence(intervalDays: number): string {
  if (intervalDays === 1) return "codziennie";
  return `co ${intervalDays} ${plural(intervalDays, ["dzień", "dni", "dni"])}`;
}
