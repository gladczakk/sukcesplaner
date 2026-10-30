import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/db/database.types";

export type Client = SupabaseClient<Database>;
export type Op = "select" | "insert" | "update" | "delete";
export interface Reply {
  data: unknown;
  error: PostgrestError | null;
}
export interface Ctx {
  payload: unknown;
  neq: [string, unknown][];
  is: [string, unknown][];
  not: [string, string, unknown][];
}
export type Responder = Reply | ((ctx: Ctx) => Reply);
export interface Write {
  table: string;
  op: Op;
  payload: unknown;
  neq: [string, unknown][];
  is: [string, unknown][];
  not: [string, string, unknown][];
}
export interface Call {
  table: string;
  op: Op;
  eq: [string, unknown][];
}

export const ok = (data: unknown): Reply => ({ data, error: null });
export const fail = (code: string, message: string): Reply => ({
  data: null,
  error: { code, message, details: "", hint: "", name: "PostgrestError" } as PostgrestError,
});

export const MILESTONE_FOUND = ok({ id: "m1" });

export interface StubOptions {
  /** When true (default, used by the task tests) an unprogrammed `milestones.select` always finds milestone `m1`. */
  defaultMilestone?: boolean;
}

/**
 * Stub of the Supabase query builder: every chained call returns the same builder, awaiting it (or `maybeSingle` /
 * `single`) takes the next programmed reply for `table.operation`. Writes are recorded with the `neq`/`is`/`not`
 * filters applied to them, every call (reads included) with its `eq` filters.
 */
export function stubClient(queues: Partial<Record<`${string}.${Op}`, Responder[]>> = {}, options: StubOptions = {}) {
  const defaultMilestone = options.defaultMilestone ?? true;
  const remaining = { ...queues };
  const writes: Write[] = [];
  const calls: Call[] = [];

  function from(table: string) {
    let op: Op = "select";
    let payload: unknown;
    const neq: [string, unknown][] = [];
    const is: [string, unknown][] = [];
    const not: [string, string, unknown][] = [];
    const eq: [string, unknown][] = [];
    const run = () => {
      calls.push({ table, op, eq: [...eq] });
      if (op !== "select") writes.push({ table, op, payload, neq: [...neq], is: [...is], not: [...not] });
      const key = `${table}.${op}` as const;
      const keepDefault = defaultMilestone && key === "milestones.select";
      const queue = remaining[key] ?? (keepDefault ? [MILESTONE_FOUND] : []);
      const next = queue.shift();
      if (next === undefined) throw new Error(`stub: no reply programmed for ${key}`);
      remaining[key] = queue.length > 0 || keepDefault ? queue : undefined;
      return Promise.resolve(
        typeof next === "function" ? next({ payload, neq: [...neq], is: [...is], not: [...not] }) : next,
      );
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
      eq: (column: string, value: unknown) => {
        eq.push([column, value]);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        neq.push([column, value]);
        return builder;
      },
      is: (column: string, value: unknown) => {
        is.push([column, value]);
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        not.push([column, operator, value]);
        return builder;
      },
      maybeSingle: run,
      single: run,
      then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
    };
    return builder;
  }

  return {
    client: { from } as unknown as Client,
    writes,
    calls,
    lastWrite: (table: string, op: Op) => writes.filter((write) => write.table === table && write.op === op).at(-1),
  };
}
