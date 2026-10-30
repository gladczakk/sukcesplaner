import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { logContextFrom, logError, logWarn, type LogContext } from "@/lib/log";

// Oracle: the decisions of observability-error-signals phase 1 — one JSON line per entry, the cause chain and stack kept,
// PostgREST fields (code/details/hint) kept, only allow-listed context keys, no PII. Expected values are written by hand.
let consoleError: MockInstance<(line: string) => void>;
let consoleWarn: MockInstance<(line: string) => void>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastLine(spy: MockInstance<(line: string) => void>): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  const line = spy.mock.calls[0][0];
  expect(typeof line).toBe("string");
  expect(line).not.toContain("\n");
  return JSON.parse(line) as Record<string, unknown>;
}

describe("logError", () => {
  it("emits one JSON line with level, scope, name, message and stack of an Error", () => {
    logError("tasks", new Error("boom"));

    const entry = lastLine(consoleError);
    expect(entry).toMatchObject({ level: "error", scope: "tasks", name: "Error", message: "boom" });
    expect(entry.stack).toEqual(expect.stringContaining("boom"));
  });

  it("keeps the cause chain as a list, at most 3 levels deep", () => {
    const root = new Error("level4");
    const l3 = new Error("level3", { cause: root });
    const l2 = new TypeError("level2", { cause: l3 });
    const top = new Error("level1", { cause: l2 });

    logError("chain", top);

    const entry = lastLine(consoleError);
    expect(entry.message).toBe("level1");
    expect(entry.cause).toEqual([
      { name: "TypeError", message: "level2" },
      { name: "Error", message: "level3" },
      { name: "Error", message: "level4" },
    ]);
  });

  it("does not loop forever on a cyclic cause", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;

    logError("cycle", a);

    const entry = lastLine(consoleError);
    expect((entry.cause as unknown[]).length).toBeLessThanOrEqual(3);
  });

  it("keeps the PostgREST code, details and hint of an error object, and of the cause of an Error", () => {
    const postgrest = { name: "PostgrestError", message: "permission denied", code: "42501", details: "d", hint: "h" };
    logError("db", new Error("42501: permission denied", { cause: postgrest }));

    const entry = lastLine(consoleError);
    expect(entry.message).toBe("42501: permission denied");
    expect(entry.cause).toEqual([
      { name: "PostgrestError", message: "permission denied", code: "42501", details: "d", hint: "h" },
    ]);
  });

  it("keeps status, code, details and hint of the error itself", () => {
    const error = Object.assign(new Error("Invalid login"), {
      status: 400,
      code: "invalid_credentials",
      details: "some details",
      hint: "some hint",
    });

    logError("auth", error);

    expect(lastLine(consoleError)).toMatchObject({
      status: 400,
      code: "invalid_credentials",
      details: "some details",
      hint: "some hint",
    });
  });

  it.each([
    { name: "a string", value: "plain failure", message: "plain failure" },
    { name: "a number", value: 42, message: "42" },
    { name: "a plain object", value: { reason: "x" }, message: '{"reason":"x"}' },
    { name: "null", value: null, message: "null" },
  ])("describes a non-Error value readably: $name", ({ value, message }) => {
    logError("odd", value);

    const entry = lastLine(consoleError);
    expect(entry.message).toBe(message);
    expect(entry.message).not.toContain("[object Object]");
  });

  it("adds allow-listed context fields and drops everything else (no PII)", () => {
    const ctx = {
      userId: "u1",
      requestId: "r1",
      projectId: "p1",
      milestoneId: "m1",
      taskId: "t1",
      op: "setStatus",
      step: "update",
      email: "a@b.pl",
      password: "secret",
      ip: "1.2.3.4",
    } as LogContext;

    logError("tasks", new Error("boom"), ctx);

    const entry = lastLine(consoleError);
    expect(entry).toMatchObject({
      userId: "u1",
      requestId: "r1",
      projectId: "p1",
      milestoneId: "m1",
      taskId: "t1",
      op: "setStatus",
      step: "update",
    });
    expect(entry).not.toHaveProperty("email");
    expect(entry).not.toHaveProperty("password");
    expect(entry).not.toHaveProperty("ip");
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(JSON.stringify(entry)).not.toContain("a@b.pl");
  });
});

describe("logWarn", () => {
  it("emits one JSON line through console.warn with level warn, scope, event and context", () => {
    logWarn("auth", "signin_rejected", { requestId: "r1" });

    expect(consoleError).not.toHaveBeenCalled();
    expect(lastLine(consoleWarn)).toEqual({
      level: "warn",
      scope: "auth",
      event: "signin_rejected",
      requestId: "r1",
    });
  });
});

describe("logContextFrom", () => {
  it("returns the user id and the request id", () => {
    expect(logContextFrom({ user: { id: "u1" }, requestId: "r1" })).toEqual({ userId: "u1", requestId: "r1" });
  });

  it.each([
    { name: "no user", locals: { user: null, requestId: "r1" }, expected: { requestId: "r1" } },
    { name: "no request id", locals: { user: { id: "u1" } }, expected: { userId: "u1" } },
    { name: "nothing", locals: {}, expected: {} },
  ])("leaves out keys without a value: $name", ({ locals, expected }) => {
    expect(logContextFrom(locals)).toEqual(expected);
  });
});
