import { describe, expect, it } from "vitest";

import { classifyAuthError } from "@/lib/auth-health";

// Oracle: shapes captured from the local Supabase Auth in the research of observability-error-signals (not from the
// classifier): a guest is a 400 AuthSessionMissingError with no network call, an unreachable backend is an
// AuthRetryableFetchError with status 0 ("fetch failed"), a tampered token is a 403 AuthApiError "bad_jwt".
describe("classifyAuthError", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("treats %s as no error", (_label, error) => {
    expect(classifyAuthError(error)).toBe("none");
  });

  it("treats a guest (AuthSessionMissingError, 400) as anonymous", () => {
    expect(classifyAuthError({ name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" })).toBe(
      "anonymous",
    );
  });

  it.each([
    ["unreachable backend (status 0)", { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" }],
    ["retryable error without status", { name: "AuthRetryableFetchError", message: "fetch failed" }],
    ["HTTP 500", { name: "AuthApiError", status: 500, message: "boom" }],
    ["HTTP 503", { name: "AuthUnknownError", status: 503, message: "unavailable" }],
    // Supabase Auth throttling signed-in users must not look like a sign-out.
    ["rate limit (429)", { name: "AuthApiError", status: 429, code: "over_request_rate_limit", message: "rate limit" }],
  ])("treats %s as an outage", (_label, error) => {
    expect(classifyAuthError(error)).toBe("outage");
  });

  it.each([
    ["tampered token (403 bad_jwt)", { name: "AuthApiError", status: 403, code: "bad_jwt", message: "invalid JWT" }],
    ["401 AuthApiError", { name: "AuthApiError", status: 401, message: "unauthorized" }],
    ["400 AuthApiError", { name: "AuthApiError", status: 400, message: "bad request" }],
    ["unknown error without status", { name: "AuthUnknownError", message: "???" }],
    ["plain Error", new Error("something")],
    ["non-error value", "oops"],
  ])("treats %s as an invalid session (logged, never silent)", (_label, error) => {
    expect(classifyAuthError(error)).toBe("invalid_session");
  });
});
