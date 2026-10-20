import { useCallback } from "react";
import type { Task, TaskStatus } from "@/types";
import { NETWORK_ERROR, isRecord, readError, readFieldErrors, readJson, redirectToSignin } from "@/lib/api-client";
import {
  TASK_FIELDS,
  taskIdSchema,
  type TaskCreateInput,
  type TaskFieldErrors,
  type TaskInput,
} from "@/lib/validation/task";

export type TaskApiSaveResult =
  | { status: "ok"; task: Task }
  | { status: "fieldErrors"; error: string; fieldErrors: TaskFieldErrors }
  | { status: "notFound" }
  | { status: "unauthorized" }
  | { status: "unavailable"; error: string };

export type TaskApiDeleteResult =
  { status: "ok" } | { status: "notFound" } | { status: "unauthorized" } | { status: "unavailable"; error: string };

/** Input of the task form; an empty or null `due_date` clears the due date. */
export type TaskApiInput = Omit<TaskInput, "due_date"> & { due_date: string | null };
/** Input of the create form; adds the rhythm (`recurrence_interval_days` or `recurrence_weekdays`, both null = no repeat). */
export type TaskApiCreateInput = Omit<TaskCreateInput, "due_date"> & { due_date: string | null };

function tasksUrl(projectId: string, milestoneId: string, taskId?: string): string {
  const base = `/api/projects/${projectId}/milestones/${milestoneId}/tasks`;
  return taskId ? `${base}/${taskId}` : base;
}

async function saveTask(url: string, method: "POST" | "PUT" | "PATCH", payload: unknown): Promise<TaskApiSaveResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "unavailable", error: NETWORK_ERROR };
  }
  return readSaveResponse(response);
}

async function readSaveResponse(response: Response): Promise<TaskApiSaveResult> {
  if (response.status === 401) {
    redirectToSignin();
    return { status: "unauthorized" };
  }
  if (response.status === 404) return { status: "notFound" };

  const body = await readJson(response);
  if (response.status === 422) {
    return { status: "fieldErrors", error: readError(body), fieldErrors: readFieldErrors(body, TASK_FIELDS) };
  }
  if (
    (response.status === 200 || response.status === 201) &&
    isRecord(body) &&
    isRecord(body.task) &&
    taskIdSchema.safeParse(body.task.id).success
  ) {
    return { status: "ok", task: body.task as unknown as Task };
  }
  return { status: "unavailable", error: readError(body) };
}

/** Single place for `fetch` calls to the task routes, translating responses to UI state. */
export function useTaskApi() {
  const createTask = useCallback(
    (projectId: string, milestoneId: string, input: TaskApiCreateInput) =>
      saveTask(tasksUrl(projectId, milestoneId), "POST", input),
    [],
  );

  const updateTask = useCallback(
    (projectId: string, milestoneId: string, taskId: string, input: TaskApiInput) =>
      saveTask(tasksUrl(projectId, milestoneId, taskId), "PUT", input),
    [],
  );

  const setTaskStatus = useCallback(
    (projectId: string, milestoneId: string, taskId: string, status: TaskStatus) =>
      saveTask(tasksUrl(projectId, milestoneId, taskId), "PATCH", { status }),
    [],
  );

  const setTaskDeferral = useCallback(
    (projectId: string, milestoneId: string, taskId: string, deferred: "tomorrow" | null) =>
      saveTask(tasksUrl(projectId, milestoneId, taskId), "PATCH", { deferred }),
    [],
  );

  const completeOccurrence = useCallback(
    (projectId: string, milestoneId: string, taskId: string) =>
      saveTask(`${tasksUrl(projectId, milestoneId, taskId)}/occurrences`, "POST", {}),
    [],
  );

  const moveOccurrence = useCallback(
    (projectId: string, milestoneId: string, taskId: string) =>
      saveTask(`${tasksUrl(projectId, milestoneId, taskId)}/occurrences/move`, "POST", {}),
    [],
  );

  const deleteTask = useCallback(
    async (projectId: string, milestoneId: string, taskId: string): Promise<TaskApiDeleteResult> => {
      let response: Response;
      try {
        // No body and no Content-Type: Astro's Origin check protects DELETE.
        response = await fetch(tasksUrl(projectId, milestoneId, taskId), { method: "DELETE" });
      } catch {
        return { status: "unavailable", error: NETWORK_ERROR };
      }
      if (response.status === 204) return { status: "ok" };
      if (response.status === 401) {
        redirectToSignin();
        return { status: "unauthorized" };
      }
      if (response.status === 404) return { status: "notFound" };
      return { status: "unavailable", error: readError(await readJson(response)) };
    },
    [],
  );

  return { createTask, updateTask, setTaskStatus, setTaskDeferral, completeOccurrence, moveOccurrence, deleteTask };
}
