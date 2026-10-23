// Dependency-free unit test for the auth error mapping (node:test; types are stripped on the fly).
// Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";

import { authErrorMessage, parseAuthErrorCode, toAuthErrorCode } from "../src/lib/auth-errors.ts";
import { authCredentialsSchema } from "../src/lib/validation/auth.ts";

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
  "invalid_input",
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

const VALID_CREDENTIALS = { email: "  jan@example.com ", password: "secret1" };
const INVALID_CREDENTIALS = [
  ["missing email", { email: null, password: "secret1" }],
  ["empty email", { email: "", password: "secret1" }],
  ["email without a domain", { email: "jan@", password: "secret1" }],
  ["email longer than 254 characters", { email: `${"a".repeat(250)}@example.com`, password: "secret1" }],
  ["missing password", { email: "jan@example.com", password: null }],
  ["empty password", { email: "jan@example.com", password: "" }],
  ["file instead of text", { email: new globalThis.File(["x"], "x.txt"), password: "secret1" }],
];

test("authCredentialsSchema accepts credentials and trims the email", () => {
  const parsed = authCredentialsSchema.safeParse(VALID_CREDENTIALS);
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, { email: "jan@example.com", password: "secret1" });
});

for (const [name, input] of INVALID_CREDENTIALS) {
  test(`authCredentialsSchema rejects ${name}`, () => {
    assert.equal(authCredentialsSchema.safeParse(input).success, false);
  });
}

test("parseAuthErrorCode keeps known codes, maps anything else to unknown and null stays null", () => {
  assert.equal(parseAuthErrorCode("invalid_credentials"), "invalid_credentials");
  assert.equal(parseAuthErrorCode("<script>x</script>"), "unknown");
  assert.equal(parseAuthErrorCode("__proto__"), "unknown");
  assert.equal(parseAuthErrorCode(""), "unknown");
  assert.equal(parseAuthErrorCode(null), null);
  assert.equal(parseAuthErrorCode(undefined), null);
});
