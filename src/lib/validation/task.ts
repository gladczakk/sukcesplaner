import { z } from "zod";
import { TASK_STATUSES } from "@/types";
import { dateField, nameField } from "@/lib/validation/fields";

export const TASK_FIELDS = ["title", "due_date"] as const;
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
