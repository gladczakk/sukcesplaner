import { z } from "zod";
import { LIFE_AREAS } from "@/types";
import { NUL, dateField, nameField } from "@/lib/validation/fields";

export const PROJECT_FIELDS = ["name", "description", "life_area", "due_date"] as const;
export type ProjectField = (typeof PROJECT_FIELDS)[number];
export type ProjectFieldErrors = Partial<Record<ProjectField, string>>;

export const projectInputSchema = z.object({
  name: nameField({
    required: "Podaj nazwę projektu",
    max: "Nazwa projektu może mieć maksymalnie 200 znaków",
    nul: "Nazwa zawiera niedozwolony znak",
  }),
  description: z
    .string({ error: "Opis musi być tekstem" })
    .trim()
    .max(2000, "Opis może mieć maksymalnie 2000 znaków")
    .refine((value) => !value.includes(NUL), "Opis zawiera niedozwolony znak")
    .nullish()
    .transform((value) => (typeof value === "string" && value.length > 0 ? value : null)),
  life_area: z.enum(LIFE_AREAS, { error: "Wybierz obszar życia" }),
  due_date: dateField({
    invalid: "Podaj poprawny termin w formacie RRRR-MM-DD",
    tooEarly: "Termin nie może być wcześniejszy niż rok 1000",
  }),
});

export type ProjectInput = z.output<typeof projectInputSchema>;

export const projectIdSchema = z.uuid();

/** Flattens a zod error to the first message per project field. */
export function flattenProjectErrors(error: z.ZodError): ProjectFieldErrors {
  const result: ProjectFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && (PROJECT_FIELDS as readonly string[]).includes(key)) {
      const field = key as ProjectField;
      result[field] ??= issue.message;
    }
  }
  return result;
}
