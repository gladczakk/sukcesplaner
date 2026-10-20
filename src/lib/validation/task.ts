import { z } from "zod";
import { TASK_STATUSES } from "@/types";
import { dateField, nameField } from "@/lib/validation/fields";

export const TASK_FIELDS = ["title", "due_date", "recurrence_interval_days", "recurrence_weekdays"] as const;
export type TaskField = (typeof TASK_FIELDS)[number];
export type TaskFieldErrors = Partial<Record<TaskField, string>>;

export const taskInputSchema = z.object({
  title: nameField({
    required: "Podaj tytuł zadania",
    max: "Tytuł zadania może mieć maksymalnie 200 znaków",
    nul: "Tytuł zawiera niedozwolony znak",
  }),
  // Optional: a missing value, null and an empty string all mean "no due date".
  due_date: z.preprocess(
    (value) => (value === undefined || value === "" ? null : value),
    dateField({
      invalid: "Podaj poprawną datę terminu w formacie RRRR-MM-DD",
      tooEarly: "Termin nie może być wcześniejszy niż rok 1000",
    }).nullable(),
  ),
});

export type TaskInput = z.output<typeof taskInputSchema>;

const RECURRENCE_ERROR = "Podaj liczbę dni od 2 do 30";
const WEEKDAYS_EMPTY_ERROR = "Wybierz co najmniej jeden dzień tygodnia";
const WEEKDAYS_INVALID_ERROR = "Podaj dni tygodnia jako liczby od 1 do 7, bez powtórzeń";
const ONE_RHYTHM_ERROR = "Wybierz jeden rytm: co X dni albo dni tygodnia";

// Creation only: PUT keeps `taskInputSchema`, so zod strips a rhythm sent on edit and the rhythm never changes.
// A missing value, null and an empty string all mean "no rhythm"; 1 = every day, 2..30 = every X days.
// `recurrence_weekdays` is the other rhythm: 1..7 distinct ISO days (1 = Monday); it excludes the interval.
export const taskCreateSchema = taskInputSchema
  .extend({
    recurrence_interval_days: z.preprocess(
      (value) => (value === undefined || value === "" ? null : value),
      z
        .number({ error: RECURRENCE_ERROR })
        .int(RECURRENCE_ERROR)
        .min(1, RECURRENCE_ERROR)
        .max(30, RECURRENCE_ERROR)
        .nullable(),
    ),
    recurrence_weekdays: z.preprocess(
      (value) => (value === undefined || value === "" ? null : value),
      z
        .array(
          z
            .number({ error: WEEKDAYS_INVALID_ERROR })
            .int(WEEKDAYS_INVALID_ERROR)
            .min(1, WEEKDAYS_INVALID_ERROR)
            .max(7, WEEKDAYS_INVALID_ERROR),
          { error: WEEKDAYS_INVALID_ERROR },
        )
        .min(1, WEEKDAYS_EMPTY_ERROR)
        .max(7, WEEKDAYS_INVALID_ERROR)
        .refine((days) => new Set(days).size === days.length, WEEKDAYS_INVALID_ERROR)
        .nullable(),
    ),
  })
  .refine((task) => task.recurrence_interval_days === null || task.recurrence_weekdays === null, {
    path: ["recurrence_weekdays"],
    message: ONE_RHYTHM_ERROR,
  })
  .refine(
    (task) => (task.recurrence_interval_days === null && task.recurrence_weekdays === null) || task.due_date === null,
    {
      path: ["due_date"],
      message: "Zadanie powtarzalne nie ma własnego terminu",
    },
  );

export type TaskCreateInput = z.output<typeof taskCreateSchema>;

export type RecurrenceMode = "none" | "daily" | "every" | "weekdays";

export const RECURRENCE_MODE_OPTIONS: { value: RecurrenceMode; label: string }[] = [
  { value: "none", label: "Nie powtarzaj" },
  { value: "daily", label: "Codziennie" },
  { value: "every", label: "Co X dni" },
  { value: "weekdays", label: "W wybrane dni tygodnia" },
];

export function isRecurrenceMode(value: string): value is RecurrenceMode {
  return RECURRENCE_MODE_OPTIONS.some((option) => option.value === value);
}

/** Maps the form choice to `recurrence_interval_days`: "Codziennie" -> 1, "Co X dni" -> X (2..30), "Nie powtarzaj" -> null. */
export function readRecurrenceInterval(mode: RecurrenceMode, days: string): { value: number | null; error?: string } {
  if (mode === "none" || mode === "weekdays") return { value: null };
  if (mode === "daily") return { value: 1 };
  const trimmed = days.trim();
  const parsed = Number(trimmed);
  if (trimmed === "" || !Number.isInteger(parsed) || parsed < 2 || parsed > 30) {
    return { value: null, error: RECURRENCE_ERROR };
  }
  return { value: parsed };
}

/** Maps the form choice to `recurrence_weekdays`: "W wybrane dni tygodnia" -> the selected ISO days sorted ascending (at least one), other modes -> null. */
export function readRecurrenceWeekdays(
  mode: RecurrenceMode,
  selected: readonly number[],
): { value: number[] | null; error?: string } {
  if (mode !== "weekdays") return { value: null };
  if (selected.length === 0) return { value: null, error: WEEKDAYS_EMPTY_ERROR };
  return { value: [...selected].sort((a, b) => a - b) };
}

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES, { error: "Podaj status: todo, partial lub done" }),
});

export const taskDeferralSchema = z.object({
  deferred: z.union([z.literal("tomorrow"), z.null()], { error: 'Podaj przeniesienie: "tomorrow" albo null' }),
});

export const taskIdSchema = z.uuid();

/** Flattens a zod error to the first message per task field. */
export function flattenTaskErrors(error: z.ZodError): TaskFieldErrors {
  const result: TaskFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && (TASK_FIELDS as readonly string[]).includes(key)) {
      const field = key as TaskField;
      result[field] ??= issue.message;
    }
  }
  return result;
}
