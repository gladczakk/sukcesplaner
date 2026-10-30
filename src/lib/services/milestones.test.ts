import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createMilestone, deleteMilestone, setMilestoneCompleted, updateMilestone } from "@/lib/services/milestones";
import { fail, ok, stubClient } from "@/lib/services/testing/stub-client";

// Oracle: decisions L1/L4 of observability-error-signals and the audit: an empty write, a foreign key violation and a
// lost race keep the result the caller already sees (not_found / ok), but each leaves a distinct warn entry with ids;
// an expired JWT is the session message.
const SESSION_MESSAGE = "Sesja wygasła. Zaloguj się ponownie.";
const CTX = { userId: "u1", requestId: "r1" };
const INPUT = { name: "Etap", due_date: "2026-11-30" };

function milestoneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    project_id: "p1",
    user_id: "u1",
    name: "Etap",
    due_date: "2026-11-30",
    completed_at: null,
    seq: 1,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}
const CLOSED_AT = "2026-10-29T10:00:00.000Z";

let consoleError: MockInstance<(message: string) => void>;
let consoleWarn: MockInstance<(message: string) => void>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function warnings(): Record<string, unknown>[] {
  return consoleWarn.mock.calls.map(([message]) => JSON.parse(message) as Record<string, unknown>);
}

describe("milestone write signals", () => {
  it("logs zero_rows with ids and request context when the update touches no row", async () => {
    const { client } = stubClient({ "milestones.update": [ok([])] }, { defaultMilestone: false });

    expect(await updateMilestone(client, "p1", "m1", INPUT, CTX)).toEqual({ status: "not_found" });

    expect(warnings()).toEqual([
      {
        level: "warn",
        scope: "milestones",
        event: "zero_rows",
        op: "updateMilestone",
        projectId: "p1",
        milestoneId: "m1",
        userId: "u1",
        requestId: "r1",
      },
    ]);
  });

  it("logs zero_rows when a delete removes nothing", async () => {
    const { client } = stubClient({ "milestones.delete": [ok([])] }, { defaultMilestone: false });

    expect(await deleteMilestone(client, "p1", "m1", CTX)).toEqual({ status: "not_found" });

    expect(warnings()).toEqual([
      {
        level: "warn",
        scope: "milestones",
        event: "zero_rows",
        op: "deleteMilestone",
        projectId: "p1",
        milestoneId: "m1",
        ...CTX,
      },
    ]);
  });

  it("logs fk_violation with the constraint name when the project is gone", async () => {
    const { client } = stubClient(
      {
        "milestones.insert": [
          fail(
            "23503",
            'insert or update on table "milestones" violates foreign key constraint "milestones_project_owner_fkey"',
          ),
        ],
      },
      { defaultMilestone: false },
    );

    expect(await createMilestone(client, "p1", INPUT, CTX)).toEqual({ status: "not_found" });

    expect(warnings()).toEqual([
      {
        level: "warn",
        scope: "milestones",
        event: "fk_violation:milestones_project_owner_fkey",
        op: "createMilestone",
        projectId: "p1",
        ...CTX,
      },
    ]);
  });

  it.each([{ code: "PGRST301" }, { code: "PGRST303" }])(
    "maps an expired JWT ($code) to the session message and logs the cause",
    async ({ code }) => {
      const { client } = stubClient({ "milestones.update": [fail(code, "JWT expired")] }, { defaultMilestone: false });

      expect(await updateMilestone(client, "p1", "m1", INPUT, CTX)).toEqual({
        status: "unavailable",
        error: SESSION_MESSAGE,
      });

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(JSON.parse(consoleError.mock.calls[0][0])).toMatchObject({
        scope: "milestones",
        message: `${code}: JWT expired`,
        ...CTX,
      });
    },
  );

  it("logs the same zero_rows event without user and request ids when no context is passed", async () => {
    const { client } = stubClient({ "milestones.update": [ok([])] }, { defaultMilestone: false });

    await updateMilestone(client, "p1", "m1", INPUT);

    expect(warnings()).toEqual([
      {
        level: "warn",
        scope: "milestones",
        event: "zero_rows",
        op: "updateMilestone",
        projectId: "p1",
        milestoneId: "m1",
      },
    ]);
  });
});

describe("setMilestoneCompleted", () => {
  const CLOSE_IDS = {
    level: "warn",
    scope: "milestones",
    op: "setMilestoneCompleted",
    projectId: "p1",
    milestoneId: "m1",
  };

  it("logs target_not_found when the milestone cannot be read", async () => {
    const { client } = stubClient({ "milestones.select": [ok(null)] }, { defaultMilestone: false });

    expect(await setMilestoneCompleted(client, "p1", "m1", true, CTX)).toEqual({ status: "not_found" });

    expect(warnings()).toEqual([{ ...CLOSE_IDS, event: "target_not_found", ...CTX }]);
  });

  it.each([
    {
      name: "the milestone was deleted in between",
      latest: ok(null),
      expected: { status: "not_found" },
      event: "lost_race:deleted",
    },
    {
      name: "someone already closed it",
      latest: ok(milestoneRow({ completed_at: CLOSED_AT })),
      expected: { status: "ok", milestone: { completed_at: CLOSED_AT } },
      event: "lost_race:matches_request",
    },
    {
      name: "the state is still the opposite of the request",
      latest: ok(milestoneRow({ completed_at: null })),
      expected: { status: "ok", milestone: { completed_at: null } },
      event: "lost_race:opposite",
    },
  ])(
    "keeps the result and logs $event when the closing write lost a race: $name",
    async ({ latest, expected, event }) => {
      const { client } = stubClient(
        { "milestones.select": [ok(milestoneRow()), latest], "milestones.update": [ok([])] },
        { defaultMilestone: false },
      );

      expect(await setMilestoneCompleted(client, "p1", "m1", true, CTX)).toMatchObject(expected);

      expect(warnings()).toEqual([{ ...CLOSE_IDS, event, step: "close", ...CTX }]);
    },
  );

  it("logs the reopen step when reopening lost a race", async () => {
    const closed = milestoneRow({ completed_at: CLOSED_AT });
    const { client } = stubClient(
      { "milestones.select": [ok(closed), ok(milestoneRow())], "milestones.update": [ok([])] },
      { defaultMilestone: false },
    );

    expect(await setMilestoneCompleted(client, "p1", "m1", false, CTX)).toMatchObject({ status: "ok" });

    expect(warnings()).toEqual([{ ...CLOSE_IDS, event: "lost_race:matches_request", step: "reopen", ...CTX }]);
  });

  it("does not log when the milestone is already in the requested state (idempotent, nothing written)", async () => {
    const { client, writes } = stubClient(
      { "milestones.select": [ok(milestoneRow({ completed_at: CLOSED_AT }))] },
      { defaultMilestone: false },
    );

    expect(await setMilestoneCompleted(client, "p1", "m1", true, CTX)).toMatchObject({ status: "ok" });

    expect(writes).toEqual([]);
    expect(warnings()).toEqual([]);
  });

  it("does not log when the conditional update returns the row", async () => {
    const { client } = stubClient(
      {
        "milestones.select": [ok(milestoneRow())],
        "milestones.update": [ok([milestoneRow({ completed_at: CLOSED_AT })])],
      },
      { defaultMilestone: false },
    );

    expect(await setMilestoneCompleted(client, "p1", "m1", true, CTX)).toMatchObject({
      status: "ok",
      milestone: { completed_at: CLOSED_AT },
    });

    expect(warnings()).toEqual([]);
  });

  it("logs a lost race without user and request ids when no context is passed", async () => {
    const { client } = stubClient(
      { "milestones.select": [ok(milestoneRow()), ok(null)], "milestones.update": [ok([])] },
      { defaultMilestone: false },
    );

    await setMilestoneCompleted(client, "p1", "m1", true);

    expect(warnings()).toEqual([{ ...CLOSE_IDS, event: "lost_race:deleted", step: "close" }]);
  });
});
