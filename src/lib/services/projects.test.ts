import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { deleteProject, updateProject } from "@/lib/services/projects";
import { fail, ok, stubClient } from "@/lib/services/testing/stub-client";

// Oracle: decisions L1/L4 of observability-error-signals: an empty write is still not_found for the caller, but leaves
// a zero_rows warn entry with the project id; an expired JWT is the session message.
const SESSION_MESSAGE = "Sesja wygasła. Zaloguj się ponownie.";
const CTX = { userId: "u1", requestId: "r1" };
const INPUT = { name: "Projekt", life_area: "work", due_date: "2026-12-31" } as unknown as Parameters<
  typeof updateProject
>[2];

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

describe("project write signals", () => {
  it("logs zero_rows with the project id when the update touches no row", async () => {
    const { client } = stubClient({ "projects.update": [ok([])] }, { defaultMilestone: false });

    expect(await updateProject(client, "p1", INPUT, CTX)).toEqual({ status: "not_found" });

    expect(warnings()).toEqual([
      { level: "warn", scope: "projects", event: "zero_rows", op: "updateProject", projectId: "p1", ...CTX },
    ]);
  });

  it("logs zero_rows when a delete removes nothing", async () => {
    const { client } = stubClient({ "projects.delete": [ok([])] }, { defaultMilestone: false });

    expect(await deleteProject(client, "p1", CTX)).toEqual({ status: "not_found" });

    expect(warnings()).toEqual([
      { level: "warn", scope: "projects", event: "zero_rows", op: "deleteProject", projectId: "p1", ...CTX },
    ]);
  });

  it("maps an expired JWT (PGRST303) to the session message and logs the cause", async () => {
    const { client } = stubClient(
      { "projects.update": [fail("PGRST303", "JWT expired")] },
      { defaultMilestone: false },
    );

    expect(await updateProject(client, "p1", INPUT, CTX)).toEqual({ status: "unavailable", error: SESSION_MESSAGE });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.parse(consoleError.mock.calls[0][0])).toMatchObject({
      scope: "projects",
      message: "PGRST303: JWT expired",
      ...CTX,
    });
  });

  it("logs the same event without user and request ids when no context is passed", async () => {
    const { client } = stubClient({ "projects.delete": [ok([])] }, { defaultMilestone: false });

    await deleteProject(client, "p1");

    expect(warnings()).toEqual([
      { level: "warn", scope: "projects", event: "zero_rows", op: "deleteProject", projectId: "p1" },
    ]);
  });
});
