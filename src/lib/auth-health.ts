/**
 * Tells a guest apart from a Supabase Auth failure. `getUser()` returns (does not throw) an AuthError, and without this
 * split an outage looks exactly like "not signed in". Pure on purpose: it compares `name`/`status` instead of importing
 * Supabase classes, so it is testable without `astro:*` mocks.
 *
 * - none: no error.
 * - anonymous: no session at all (AuthSessionMissingError), the ordinary guest.
 * - outage: backend unreachable (AuthRetryableFetchError, status 0), a 5xx or a 429 rate limit.
 * - invalid_session: anything else (e.g. 403 bad_jwt); logged by the caller so nothing disappears silently.
 */
export type AuthHealth = "none" | "anonymous" | "invalid_session" | "outage";

export function classifyAuthError(error: unknown): AuthHealth {
  if (error === null || error === undefined) return "none";
  const source = typeof error === "object" ? (error as Record<string, unknown>) : {};
  const name = source.name;
  const status = source.status;
  if (name === "AuthRetryableFetchError" || (typeof status === "number" && (status >= 500 || status === 429))) {
    return "outage";
  }
  if (name === "AuthSessionMissingError") return "anonymous";
  return "invalid_session";
}
