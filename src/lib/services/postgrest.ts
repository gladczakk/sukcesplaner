import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_ERROR = "Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.";
export const SESSION_ERROR = "Sesja wygasła. Zaloguj się ponownie.";

export function readFailure(error: PostgrestError): Error {
  return new Error(`${error.code}: ${error.message}`, { cause: error });
}
