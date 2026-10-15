import { formatDate } from "@/lib/format";

const warsawParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date in Warsaw as `YYYY-MM-DD`, built from the parts so it does not depend on the locale separator. */
export function todayInWarsaw(now: Date = new Date()): string {
  const parts = warsawParts.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const DAY_MS = 86_400_000;

/** Whole calendar days from `today` to `isoDate` (both `YYYY-MM-DD`); negative for past dates. */
export function daysFromToday(isoDate: string, today: string): number {
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / DAY_MS);
}

export type DueTone = "overdue" | "today" | "tomorrow" | "soon" | "date" | "none";

export function dueChip(due: string | null, today: string): { tone: DueTone; label: string } {
  if (due === null) return { tone: "none", label: "bez terminu" };
  const days = daysFromToday(due, today);
  if (days === -1) return { tone: "overdue", label: "wczoraj" };
  if (days <= -2) return { tone: "overdue", label: `${-days} dni po terminie` };
  if (days === 0) return { tone: "today", label: "dziś" };
  if (days === 1) return { tone: "tomorrow", label: "jutro" };
  if (days <= 7) return { tone: "soon", label: `za ${days} dni` };
  return { tone: "date", label: formatDate(due) };
}

const headingFormatter = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** e.g. "czwartek, 15 października". */
export function formatTodayHeading(today: string): string {
  return headingFormatter.format(new Date(today));
}
