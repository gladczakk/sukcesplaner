import { z } from "zod";
import { LIFE_AREAS } from "@/types";

export const PROJECT_FIELDS = ["name", "description", "life_area", "due_date"] as const;
export type ProjectField = (typeof PROJECT_FIELDS)[number];
export type ProjectFieldErrors = Partial<Record<ProjectField, string>>;

// Postgres rejects the NUL character in text and dates before year 1 (e.g. 0000-01-01); catch both here so
// they become field errors (422) instead of a generic server error.
const NUL = "\u0000";
const MIN_DUE_DATE = "1000-01-01";

export const projectInputSchema = z.object({
  name: z
    .string({ error: "Podaj nazwę projektu" })
    .trim()
    .min(1, "Podaj nazwę projektu")
    .max(200, "Nazwa projektu może mieć maksymalnie 200 znaków")
    .refine((value) => !value.includes(NUL), "Nazwa zawiera niedozwolony znak"),
  description: z
    .string({ error: "Opis musi być tekstem" })
    .trim()
    .max(2000, "Opis może mieć maksymalnie 2000 znaków")
    .refine((value) => !value.includes(NUL), "Opis zawiera niedozwolony znak")
    .nullish()
    .transform((value) => (typeof value === "string" && value.length > 0 ? value : null)),
  life_area: z.enum(LIFE_AREAS, { error: "Wybierz obszar życia" }),
  due_date: z.iso
    .date({ error: "Podaj poprawny termin w formacie RRRR-MM-DD" })
    .refine((value) => value >= MIN_DUE_DATE, "Termin nie może być wcześniejszy niż rok 1000"),
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
