import { z } from "zod";

// Postgres rejects the NUL character in text and dates before year 1 (e.g. 0000-01-01); catch both here so
// they become field errors (422) instead of a generic server error.
export const NUL = "\u0000";
export const MIN_DUE_DATE = "1000-01-01";

export interface NameMessages {
  required: string;
  max: string;
  nul: string;
}

export interface DateMessages {
  invalid: string;
  tooEarly: string;
}

/** Trimmed name, 1-200 characters, without NUL; messages come from the caller. */
export function nameField(messages: NameMessages) {
  return z
    .string({ error: messages.required })
    .trim()
    .min(1, messages.required)
    .max(200, messages.max)
    .refine((value) => !value.includes(NUL), messages.nul);
}

/** ISO calendar date (YYYY-MM-DD) not earlier than MIN_DUE_DATE; messages come from the caller. */
export function dateField(messages: DateMessages) {
  return z.iso.date({ error: messages.invalid }).refine((value) => value >= MIN_DUE_DATE, messages.tooEarly);
}
