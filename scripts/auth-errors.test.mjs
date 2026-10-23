// Dependency-free unit test for the auth error mapping (node:test; types are stripped on the fly).
// Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";

import { authErrorMessage, toAuthErrorCode } from "../src/lib/auth-errors.ts";

const CODE_CASES = [
  ["invalid_credentials", "invalid_credentials"],
  ["email_not_confirmed", "email_not_confirmed"],
  ["user_already_exists", "user_already_exists"],
  ["weak_password", "weak_password"],
  ["over_request_rate_limit", "rate_limited"],
  ["over_email_send_rate_limit", "rate_limited"],
  ["something_else_entirely", "unknown"],
  ["", "unknown"],
];

for (const [supabaseCode, expected] of CODE_CASES) {
  test(`toAuthErrorCode maps "${supabaseCode}" to ${expected}`, () => {
    assert.equal(toAuthErrorCode({ code: supabaseCode }), expected);
  });
}

test("toAuthErrorCode returns unknown for a missing error or code", () => {
  assert.equal(toAuthErrorCode(null), "unknown");
  assert.equal(toAuthErrorCode(undefined), "unknown");
  assert.equal(toAuthErrorCode({}), "unknown");
});

const KNOWN_CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "weak_password",
  "rate_limited",
  "unavailable",
  "unknown",
];

for (const code of KNOWN_CODES) {
  test(`authErrorMessage returns a non-empty message for ${code}`, () => {
    const message = authErrorMessage(code);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0);
  });
}

test("authErrorMessage returns the generic text for an unknown code and never echoes input", () => {
  const generic = authErrorMessage("unknown");
  const message = authErrorMessage("<script>x</script>");
  assert.equal(message, "Coś poszło nie tak. Spróbuj ponownie.");
  assert.equal(message, generic);
  assert.ok(!message.includes("<script>"));
});

test("authErrorMessage returns undefined for null or undefined", () => {
  assert.equal(authErrorMessage(null), undefined);
  assert.equal(authErrorMessage(undefined), undefined);
});
