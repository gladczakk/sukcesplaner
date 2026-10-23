// Maps Supabase auth errors to short codes (`?error=`) and codes to Polish UI copy.
// Kept free of `@/` imports so it can be loaded by `node --experimental-strip-types --test`.

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "weak_password"
  | "rate_limited"
  | "invalid_input"
  | "unavailable"
  | "unknown";

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
  email_not_confirmed: "Potwierdź adres e-mail, zanim się zalogujesz.",
  user_already_exists: "Konto z tym adresem e-mail już istnieje.",
  weak_password: "Hasło jest zbyt słabe.",
  rate_limited: "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
  invalid_input: "Sprawdź adres e-mail i hasło.",
  unavailable: "Aplikacja nie jest teraz dostępna. Spróbuj ponownie za chwilę.",
  unknown: "Coś poszło nie tak. Spróbuj ponownie.",
};

const SUPABASE_CODES: Record<string, AuthErrorCode> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  user_already_exists: "user_already_exists",
  weak_password: "weak_password",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
};

export function toAuthErrorCode(error: { code?: string } | null | undefined): AuthErrorCode {
  const code = error?.code;
  if (typeof code !== "string") return "unknown";
  return Object.hasOwn(SUPABASE_CODES, code) ? SUPABASE_CODES[code] : "unknown";
}

export function authErrorMessage(code: string | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code as AuthErrorCode] : MESSAGES.unknown;
}

/** Value of `?error=` safe to hand to the form island: a known code, `unknown` for anything else, `null` when absent. */
export function parseAuthErrorCode(value: string | null | undefined): AuthErrorCode | null {
  if (value === null || value === undefined) return null;
  return Object.hasOwn(MESSAGES, value) ? (value as AuthErrorCode) : "unknown";
}
