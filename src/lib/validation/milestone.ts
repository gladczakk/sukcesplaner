import { z } from "zod";
import { dateField, nameField } from "@/lib/validation/fields";

export const MILESTONE_FIELDS = ["name", "due_date"] as const;
export type MilestoneField = (typeof MILESTONE_FIELDS)[number];
export type MilestoneFieldErrors = Partial<Record<MilestoneField, string>>;

export const milestoneInputSchema = z.object({
  name: nameField({
    required: "Podaj nazwę milestona",
    max: "Nazwa milestona może mieć maksymalnie 200 znaków",
    nul: "Nazwa zawiera niedozwolony znak",
  }),
  due_date: dateField({
    invalid: "Podaj poprawną datę milestona w formacie RRRR-MM-DD",
    tooEarly: "Data milestona nie może być wcześniejsza niż rok 1000",
  }),
});

export type MilestoneInput = z.output<typeof milestoneInputSchema>;

export const milestoneCompletionSchema = z.object({
  completed: z.boolean({ error: "Podaj, czy milestone ma być zamknięty (true lub false)" }),
});

export const milestoneIdSchema = z.uuid();

/** Flattens a zod error to the first message per milestone field. */
export function flattenMilestoneErrors(error: z.ZodError): MilestoneFieldErrors {
  const result: MilestoneFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && (MILESTONE_FIELDS as readonly string[]).includes(key)) {
      const field = key as MilestoneField;
      result[field] ??= issue.message;
    }
  }
  return result;
}
