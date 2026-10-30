import type { PostgrestError } from "@supabase/supabase-js";
import { logWarn, type LogContext } from "@/lib/log";

export const GENERIC_ERROR = "Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.";
export const SESSION_ERROR = "Sesja wygasła. Zaloguj się ponownie.";

export function readFailure(error: PostgrestError): Error {
  return new Error(`${error.code}: ${error.message}`, { cause: error });
}

/** Logs why an empty result became `not_found` (the caller still just sees `not_found`). */
export function notFound(scope: string, event: string, ctx: LogContext): { status: "not_found" } {
  logWarn(scope, event, ctx);
  return { status: "not_found" };
}
