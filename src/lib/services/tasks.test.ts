import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/database.types";
import {
  completeOccurrence,
  deleteTask,
  moveOccurrenceToTomorrow,
  setTaskDeferral,
  setTaskStatus,
  updateTask,
} from "@/lib/services/tasks";
import type { TaskCreateInput } from "@/lib/validation/task";

type Client = SupabaseClient<Database>;
type Op = "select" | "insert" | "update" | "delete";
interface Reply {
  data: unknown;
  error: PostgrestError | null;
}
interface Ctx {
  payload: unknown;
  neq: [string, unknown][];
}
type Responder = Reply | ((ctx: Ctx) => Reply);
interface Write {
  table: string;
  op: Op;
  payload: unknown;
  neq: [string, unknown][];
}

const GENERIC_MESSAGE = "Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.";
const SESSION_MESSAGE = "Sesja wygasła. Zaloguj się ponownie.";

// Error texts as raised by the database: migrations / pgTAP assertions, not the constants of the service.
const SHAPE_VIOLATION = 'new row for relation "tasks" violates check constraint "tasks_recurrence_shape"';
const NOT_RHYTHM_DAY = "Wystapienie (2026-10-22) nie pasuje do rytmu zadania";
const MOVE_FROM_NON_RHYTHM_DAY = "Przeniesienie wystapienia (2026-10-22) dotyczy dnia spoza rytmu zadania";
const MOVE_PAST_MILESTONE =
  "Przeniesienie wystapienia (2026-10-30) na dzien (2026-10-31) wykracza poza date milestona (2026-10-30)";
const MOVE_TO_RHYTHM_DAY =
  "Przeniesienie wystapienia (2026-10-21) na dzien (2026-10-23) nie jest mozliwe: to dzien rytmu zadania";

const ok = (data: unknown): Reply => ({ data, error: null });
const fail = (code: string, message: string): Reply => ({
  data: null,
  error: { code, message, details: "", hint: "", name: "PostgrestError" } as PostgrestError,
});

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    milestone_id: "m1",
    user_id: "u1",
    title: "Zadanie",
    status: "todo",
    due_date: null,
    deferred_until: null,
    recurrence_interval_days: null,
    recurrence_weekdays: null,
    recurrence_start_date: null,
    is_recurring: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const MILESTONE_FOUND = ok({ id: "m1" });
const doneGuardApplied = (ctx: Ctx) => ctx.neq.some(([column, value]) => column === "status" && value === "done");

/**
 * Stub of the Supabase query builder: every chained call returns the same builder, awaiting it (or `maybeSingle`)
 * takes the next programmed reply for `table.operation`. Writes are recorded with the filters applied to them.
 */
function stubClient(queues: Partial<Record<`${string}.${Op}`, Responder[]>> = {}) {
  const remaining = { ...queues };
  const writes: Write[] = [];

  function from(table: string) {
    let op: Op = "select";
    let payload: unknown;
    const neq: [string, unknown][] = [];
    const run = () => {
      if (op !== "select") writes.push({ table, op, payload, neq: [...neq] });
      const key = `${table}.${op}` as const;
      const queue = remaining[key] ?? (key === "milestones.select" ? [MILESTONE_FOUND] : []);
      const next = queue.shift();
      if (next === undefined) throw new Error(`stub: no reply programmed for ${key}`);
      remaining[key] = queue.length > 0 || key === "milestones.select" ? queue : undefined;
      return Promise.resolve(typeof next === "function" ? next({ payload, neq }) : next);
    };
    const builder = {
      select: () => builder,
      update: (patch: unknown) => {
        op = "update";
        payload = patch;
        return builder;
      },
      insert: (row: unknown) => {
        op = "insert";
        payload = row;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      eq: () => builder,
      neq: (column: string, value: unknown) => {
        neq.push([column, value]);
        return builder;
      },
      maybeSingle: run,
      then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
    };
    return builder;
  }

  return {
    client: { from } as unknown as Client,
    writes,
    lastWrite: (table: string, op: Op) => writes.filter((write) => write.table === table && write.op === op).at(-1),
  };
}

const input = (overrides: Partial<TaskCreateInput> = {}): TaskCreateInput => ({
  title: "Nowy tytuł",
  due_date: null,
  recurrence_interval_days: null,
  recurrence_weekdays: null,
  ...overrides,
});

beforeEach(() => {
  // The generic branch logs the real cause; keep the test output clean.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("setTaskStatus", () => {
  it.each([{ status: "done" as const }, { status: "partial" as const }, { status: "todo" as const }])(
    "returns the task and writes status $status together with a cleared deferral",
    async ({ status }) => {
      const { client, lastWrite } = stubClient({ "tasks.update": [ok([taskRow({ status })])] });

      const result = await setTaskStatus(client, "p1", "m1", "t1", status);

      expect(result).toMatchObject({ status: "ok", task: { id: "t1", status } });
      expect(lastWrite("tasks", "update")?.payload).toEqual({ status, deferred_until: null });
    },
  );

  it.each([
    { name: "no row updated", reply: ok([]), expected: { status: "not_found" } },
    {
      name: "a recurring task cannot be done (shape check)",
      reply: fail("23514", SHAPE_VIOLATION),
      expected: { status: "validation", error: expect.stringContaining("powtarzalne") as unknown },
    },
    {
      name: "a check error that matches nothing is a generic failure, never ok",
      reply: fail("23514", 'new row violates check constraint "something_else"'),
      expected: { status: "unavailable", error: GENERIC_MESSAGE },
    },
    {
      name: "an expired session",
      reply: fail("42501", "permission denied"),
      expected: { status: "unavailable", error: SESSION_MESSAGE },
    },
  ])("returns the right result when: $name", async ({ reply, expected }) => {
    const { client } = stubClient({ "tasks.update": [reply] });

    expect(await setTaskStatus(client, "p1", "m1", "t1", "done")).toMatchObject(expected);
  });

  it("returns not_found without writing when the milestone is not in the project", async () => {
    const { client, writes } = stubClient({ "milestones.select": [ok(null)] });

    expect(await setTaskStatus(client, "p1", "m1", "t1", "done")).toEqual({ status: "not_found" });
    expect(writes).toEqual([]);
  });
});

describe("setTaskDeferral", () => {
  it("defers an open task: writes the date and only touches tasks that are not done", async () => {
    const { client, lastWrite } = stubClient({
      "tasks.update": [(ctx) => (doneGuardApplied(ctx) ? ok([taskRow({ deferred_until: "2026-10-27" })]) : ok([]))],
    });

    const result = await setTaskDeferral(client, "p1", "m1", "t1", "2026-10-27");

    expect(result).toMatchObject({ status: "ok", task: { deferred_until: "2026-10-27" } });
    expect(lastWrite("tasks", "update")?.payload).toEqual({ deferred_until: "2026-10-27" });
  });

  it("does not defer a done task: the row exists, so the rule is reported as a validation error", async () => {
    // The database holds a done task: an UPDATE guarded with `status <> 'done'` matches nothing, an unguarded one would.
    const { client } = stubClient({
      "tasks.update": [
        (ctx) => (doneGuardApplied(ctx) ? ok([]) : ok([taskRow({ status: "done", deferred_until: "2026-10-27" })])),
      ],
      "tasks.select": [ok({ id: "t1" })],
    });

    const result = await setTaskDeferral(client, "p1", "m1", "t1", "2026-10-27");

    expect(result).toMatchObject({
      status: "validation",
      error: expect.stringContaining("Zrobionego zadania nie można przenieść") as unknown,
    });
  });

  it("returns not_found when nothing was updated and the task is gone", async () => {
    const { client } = stubClient({ "tasks.update": [ok([])], "tasks.select": [ok(null)] });

    expect(await setTaskDeferral(client, "p1", "m1", "t1", "2026-10-27")).toEqual({ status: "not_found" });
  });

  it("returns unavailable when the read that tells the two empty cases apart fails", async () => {
    const { client } = stubClient({ "tasks.update": [ok([])], "tasks.select": [fail("XX000", "boom")] });

    expect(await setTaskDeferral(client, "p1", "m1", "t1", "2026-10-27")).toEqual({
      status: "unavailable",
      error: GENERIC_MESSAGE,
    });
  });

  it("restores a deferred task without the done guard", async () => {
    const { client, lastWrite } = stubClient({ "tasks.update": [ok([taskRow({ deferred_until: null })])] });

    const result = await setTaskDeferral(client, "p1", "m1", "t1", null);

    expect(result).toMatchObject({ status: "ok", task: { deferred_until: null } });
    expect(lastWrite("tasks", "update")).toMatchObject({ payload: { deferred_until: null }, neq: [] });
  });

  it("returns not_found when restoring updates nothing", async () => {
    const { client } = stubClient({ "tasks.update": [ok([])] });

    expect(await setTaskDeferral(client, "p1", "m1", "t1", null)).toEqual({ status: "not_found" });
  });
});

describe("completeOccurrence", () => {
  const DAY = "2026-10-26";
  const taskReply = ok(taskRow({ recurrence_interval_days: 2 }));

  it("records the occurrence as done for the given day", async () => {
    const { client, lastWrite } = stubClient({ "tasks.select": [taskReply], "task_occurrences.insert": [ok(null)] });

    const result = await completeOccurrence(client, "p1", "m1", "t1", DAY);

    expect(result).toMatchObject({ status: "ok", task: { id: "t1" } });
    expect(lastWrite("task_occurrences", "insert")?.payload).toEqual({ task_id: "t1", occurrence_date: DAY });
  });

  it.each([
    {
      name: "a repeated click on an already done occurrence is a success",
      insert: fail("23505", "duplicate key value violates unique constraint"),
      stored: ok({ state: "done" }),
      expected: { status: "ok" },
    },
    {
      name: "the day was moved to tomorrow, so it is not done",
      insert: fail("23505", "duplicate key value violates unique constraint"),
      stored: ok({ state: "moved" }),
      expected: { status: "validation", error: expect.stringContaining("przeniesione na jutro") as unknown },
    },
    {
      name: "the read after a duplicate fails",
      insert: fail("23505", "duplicate key value violates unique constraint"),
      stored: fail("XX000", "boom"),
      expected: { status: "unavailable", error: GENERIC_MESSAGE },
    },
    {
      name: "the day does not fit the rhythm",
      insert: fail("23514", NOT_RHYTHM_DAY),
      stored: undefined,
      expected: { status: "validation", error: expect.stringContaining("nie jest dziś aktualne") as unknown },
    },
    {
      name: "a check error that matches nothing is a generic failure, never ok",
      insert: fail("23514", "something unexpected"),
      stored: undefined,
      expected: { status: "unavailable", error: GENERIC_MESSAGE },
    },
  ])("returns the right result when: $name", async ({ insert, stored, expected }) => {
    const { client } = stubClient({
      "tasks.select": [taskReply],
      "task_occurrences.insert": [insert],
      "task_occurrences.select": stored ? [stored] : [],
    });

    expect(await completeOccurrence(client, "p1", "m1", "t1", DAY)).toMatchObject(expected);
  });

  it("returns not_found without writing when the task is not in the milestone", async () => {
    const { client, writes } = stubClient({ "tasks.select": [ok(null)] });

    expect(await completeOccurrence(client, "p1", "m1", "t1", DAY)).toEqual({ status: "not_found" });
    expect(writes).toEqual([]);
  });
});

describe("moveOccurrenceToTomorrow", () => {
  const TODAY = "2026-10-26";
  const TOMORROW = "2026-10-27";
  const taskReply = ok(taskRow({ recurrence_interval_days: 2 }));
  const duplicate = fail("23505", "duplicate key value violates unique constraint");

  it("records a moved occurrence pointing at tomorrow", async () => {
    const { client, lastWrite } = stubClient({ "tasks.select": [taskReply], "task_occurrences.insert": [ok(null)] });

    const result = await moveOccurrenceToTomorrow(client, "p1", "m1", "t1", TODAY, TOMORROW);

    expect(result).toMatchObject({ status: "ok", task: { id: "t1" } });
    expect(lastWrite("task_occurrences", "insert")?.payload).toEqual({
      task_id: "t1",
      occurrence_date: TODAY,
      state: "moved",
      moved_to: TOMORROW,
    });
  });

  it.each([
    {
      name: "a repeated move to the same day is a success",
      insert: duplicate,
      stored: ok({ state: "moved", moved_to: TOMORROW }),
      expected: { status: "ok" },
    },
    {
      name: "the occurrence is already done",
      insert: duplicate,
      stored: ok({ state: "done", moved_to: null }),
      expected: { status: "validation", error: expect.stringContaining("już zrobione") as unknown },
    },
    {
      name: "the occurrence was moved to another day",
      insert: duplicate,
      stored: ok({ state: "moved", moved_to: "2026-10-28" }),
      expected: { status: "validation", error: expect.stringContaining("nie można przenieść na jutro") as unknown },
    },
    {
      name: "the read after a duplicate fails",
      insert: duplicate,
      stored: fail("XX000", "boom"),
      expected: { status: "unavailable", error: GENERIC_MESSAGE },
    },
    {
      name: "the source day is not a rhythm day",
      insert: fail("23514", MOVE_FROM_NON_RHYTHM_DAY),
      stored: undefined,
      expected: { status: "validation", error: expect.stringContaining("nie można przenieść na jutro") as unknown },
    },
    {
      name: "tomorrow is past the milestone date",
      insert: fail("23514", MOVE_PAST_MILESTONE),
      stored: undefined,
      expected: { status: "validation", error: expect.stringContaining("nie można przenieść na jutro") as unknown },
    },
    {
      name: "tomorrow is a rhythm day",
      insert: fail("23514", MOVE_TO_RHYTHM_DAY),
      stored: undefined,
      expected: { status: "validation", error: expect.stringContaining("nie można przenieść na jutro") as unknown },
    },
    {
      name: "the common occurrence rejection keeps its own wording",
      insert: fail("23514", NOT_RHYTHM_DAY),
      stored: undefined,
      expected: { status: "validation", error: expect.stringContaining("nie jest dziś aktualne") as unknown },
    },
    {
      name: "a check error that matches nothing is a generic failure, never ok",
      insert: fail("23514", "something unexpected"),
      stored: undefined,
      expected: { status: "unavailable", error: GENERIC_MESSAGE },
    },
  ])("returns the right result when: $name", async ({ insert, stored, expected }) => {
    const { client } = stubClient({
      "tasks.select": [taskReply],
      "task_occurrences.insert": [insert],
      "task_occurrences.select": stored ? [stored] : [],
    });

    expect(await moveOccurrenceToTomorrow(client, "p1", "m1", "t1", TODAY, TOMORROW)).toMatchObject(expected);
  });

  it("returns not_found without writing when the task is not in the milestone", async () => {
    const { client, writes } = stubClient({ "tasks.select": [ok(null)] });

    expect(await moveOccurrenceToTomorrow(client, "p1", "m1", "t1", TODAY, TOMORROW)).toEqual({ status: "not_found" });
    expect(writes).toEqual([]);
  });
});

describe("updateTask", () => {
  beforeEach(() => {
    // 22:30Z on 24 Oct is already 25 Oct in Warsaw (CEST, UTC+2).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T22:30:00Z"));
  });

  const EVERY_3_DAYS = { recurrence_interval_days: 3, recurrence_start_date: "2026-10-01" };

  it.each([
    {
      name: "same interval",
      current: EVERY_3_DAYS,
      next: { recurrence_interval_days: 3 },
    },
    {
      name: "every day written as interval 1 and as all seven weekdays is one rhythm",
      current: { recurrence_interval_days: 1, recurrence_start_date: "2026-10-01" },
      next: { recurrence_weekdays: [7, 6, 5, 4, 3, 2, 1] },
    },
    {
      name: "same weekdays in another order",
      current: { recurrence_weekdays: [1, 3, 5], recurrence_start_date: "2026-10-01" },
      next: { recurrence_weekdays: [5, 1, 3] },
    },
  ])("writes only the title when the rhythm is unchanged: $name", async ({ current, next }) => {
    const { client, lastWrite } = stubClient({
      "tasks.select": [ok(taskRow(current))],
      "tasks.update": [ok([taskRow(current)])],
    });

    const result = await updateTask(client, "p1", "m1", "t1", input(next));

    expect(result.status).toBe("ok");
    expect(lastWrite("tasks", "update")?.payload).toEqual({ title: "Nowy tytuł" });
  });

  it("starts a changed rhythm of a recurring task on today's Warsaw date and clears the due date", async () => {
    const { client, lastWrite } = stubClient({
      "tasks.select": [ok(taskRow(EVERY_3_DAYS))],
      "tasks.update": [ok([taskRow({ recurrence_interval_days: 5, recurrence_start_date: "2026-10-25" })])],
    });

    const result = await updateTask(client, "p1", "m1", "t1", input({ recurrence_interval_days: 5 }));

    expect(result.status).toBe("ok");
    expect(lastWrite("tasks", "update")?.payload).toEqual({
      title: "Nowy tytuł",
      due_date: null,
      recurrence_interval_days: 5,
      recurrence_weekdays: null,
      recurrence_start_date: "2026-10-25",
    });
  });

  it("refuses to turn the rhythm off (that is deleting the task) and writes nothing", async () => {
    const { client, writes } = stubClient({ "tasks.select": [ok(taskRow(EVERY_3_DAYS))] });

    const result = await updateTask(client, "p1", "m1", "t1", input());

    expect(result).toMatchObject({ status: "validation", error: expect.stringContaining("usuń zadanie") as unknown });
    expect(writes).toEqual([]);
  });

  it("turns an ordinary open task into a recurring one: rhythm from today, sorted weekdays, deferral and status cleared, done tasks excluded", async () => {
    const { client, lastWrite } = stubClient({
      "tasks.select": [ok(taskRow({ due_date: "2026-10-30", deferred_until: "2026-10-26", status: "partial" }))],
      "tasks.update": [(ctx) => (doneGuardApplied(ctx) ? ok([taskRow({ recurrence_weekdays: [1, 3, 5] })]) : ok([]))],
    });

    const result = await updateTask(client, "p1", "m1", "t1", input({ recurrence_weekdays: [5, 1, 3] }));

    expect(result.status).toBe("ok");
    expect(lastWrite("tasks", "update")?.payload).toEqual({
      title: "Nowy tytuł",
      recurrence_interval_days: null,
      recurrence_weekdays: [1, 3, 5],
      recurrence_start_date: "2026-10-25",
      due_date: null,
      deferred_until: null,
      status: "todo",
    });
  });

  it.each([
    {
      name: "the task is done (still there)",
      stillThere: ok({ id: "t1" }),
      expected: { status: "validation", error: expect.stringContaining("nie można zmienić w powtarzalne") as unknown },
    },
    { name: "the task was deleted in between", stillThere: ok(null), expected: { status: "not_found" } },
    {
      name: "the read that tells the two cases apart fails",
      stillThere: fail("XX000", "boom"),
      expected: { status: "unavailable", error: GENERIC_MESSAGE },
    },
  ])("does not make an ordinary task recurring when: $name", async ({ stillThere, expected }) => {
    // A done task: the guarded UPDATE matches nothing.
    const { client } = stubClient({
      "tasks.select": [ok(taskRow({ status: "done" })), stillThere],
      "tasks.update": [ok([])],
    });

    expect(await updateTask(client, "p1", "m1", "t1", input({ recurrence_interval_days: 2 }))).toMatchObject(expected);
  });

  it("edits an ordinary task: writes the title and due date only", async () => {
    const { client, lastWrite } = stubClient({
      "tasks.select": [ok(taskRow())],
      "tasks.update": [ok([taskRow({ title: "Nowy tytuł", due_date: "2026-10-30" })])],
    });

    const result = await updateTask(client, "p1", "m1", "t1", input({ due_date: "2026-10-30" }));

    expect(result.status).toBe("ok");
    expect(lastWrite("tasks", "update")?.payload).toEqual({ title: "Nowy tytuł", due_date: "2026-10-30" });
  });

  it("reports a task turned recurring in another tab as stale instead of a rhythm rule", async () => {
    const { client } = stubClient({
      "tasks.select": [ok(taskRow())],
      "tasks.update": [fail("23514", SHAPE_VIOLATION)],
    });

    const result = await updateTask(client, "p1", "m1", "t1", input());

    expect(result).toMatchObject({ status: "validation", error: expect.stringContaining("Odśwież stronę") as unknown });
  });

  it("returns not_found when the task is not in the milestone", async () => {
    const { client, writes } = stubClient({ "tasks.select": [ok(null)] });

    expect(await updateTask(client, "p1", "m1", "t1", input())).toEqual({ status: "not_found" });
    expect(writes).toEqual([]);
  });
});

describe("deleteTask", () => {
  it("returns ok when a row was deleted", async () => {
    const { client } = stubClient({ "tasks.delete": [ok([{ id: "t1" }])] });

    expect(await deleteTask(client, "p1", "m1", "t1")).toEqual({ status: "ok" });
  });

  it.each([
    { name: "no row deleted", reply: ok([]), expected: { status: "not_found" } },
    {
      name: "a validation-type database error is reported as a generic failure",
      reply: fail("23514", "Termin zadania nie moze byc pozniejszy niz data milestona"),
      expected: { status: "unavailable", error: GENERIC_MESSAGE },
    },
    {
      name: "an expired session",
      reply: fail("42501", "permission denied"),
      expected: { status: "unavailable", error: SESSION_MESSAGE },
    },
  ])("returns the right result when: $name", async ({ reply, expected }) => {
    const { client } = stubClient({ "tasks.delete": [reply] });

    expect(await deleteTask(client, "p1", "m1", "t1")).toEqual(expected);
  });

  it("returns not_found without deleting when the milestone is not in the project", async () => {
    const { client, writes } = stubClient({ "milestones.select": [ok(null)] });

    expect(await deleteTask(client, "p1", "m1", "t1")).toEqual({ status: "not_found" });
    expect(writes).toEqual([]);
  });
});
