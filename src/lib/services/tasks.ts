import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { logError } from "@/lib/log";
import { GENERIC_ERROR, SESSION_ERROR, readFailure } from "@/lib/services/postgrest";
import { todayInWarsaw } from "@/lib/today";
import type { Task, TaskStatus } from "@/types";
import type { TaskCreateInput, TaskFieldErrors, TaskInput } from "@/lib/validation/task";

type Client = SupabaseClient<Database>;
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

export type TaskResult =
  | { status: "ok"; task: Task }
  | { status: "validation"; error: string; fieldErrors: TaskFieldErrors }
  | { status: "not_found" }
  | { status: "unavailable"; error: string };

export type TaskDeleteResult = { status: "ok" } | { status: "not_found" } | { status: "unavailable"; error: string };

type TaskFailure = Exclude<TaskResult, { status: "ok" }>;

const DUE_DATE_ERROR = "Termin zadania nie może być późniejszy niż data milestona";
const TITLE_ERROR = "Tytuł zadania musi mieć od 1 do 200 znaków";
const CLOSED_MILESTONE_ERROR =
  "Nie można dodać niezrobionego zadania do zamkniętego milestona. Otwórz milestone ponownie.";

const DONE_DEFERRAL_ERROR = "Zrobionego zadania nie można przenieść na jutro.";
const RECURRING_STATE_ERROR =
  "Zadania powtarzalnego nie można oznaczyć jako zrobione ani przenieść. Odhacz jego wystąpienie na liście Dziś.";
const RECURRENCE_START_ERROR = "Termin milestona jest wcześniejszy niż dziś — powtarzanie nie miałoby kiedy się zacząć";
const RECURRENCE_INTERVAL_ERROR = "Podaj liczbę dni od 2 do 30";

function toTask(row: TaskRow): Task {
  return { ...row, status: row.status as TaskStatus };
}

function translateError(error: PostgrestError): TaskFailure {
  if (error.code === "23514") {
    if (error.message.includes("Termin zadania")) {
      return { status: "validation", error: DUE_DATE_ERROR, fieldErrors: { due_date: DUE_DATE_ERROR } };
    }
    if (error.message.includes("Zamkniety milestone")) {
      return { status: "validation", error: CLOSED_MILESTONE_ERROR, fieldErrors: {} };
    }
    if (error.message.includes("tasks_title_length")) {
      return { status: "validation", error: TITLE_ERROR, fieldErrors: { title: TITLE_ERROR } };
    }
    if (error.message.includes("tasks_recurrence_shape")) {
      return { status: "validation", error: RECURRING_STATE_ERROR, fieldErrors: {} };
    }
    if (error.message.includes("Powtarzanie zadania")) {
      return {
        status: "validation",
        error: RECURRENCE_START_ERROR,
        fieldErrors: { recurrence_interval_days: RECURRENCE_START_ERROR },
      };
    }
    if (error.message.includes("tasks_recurrence_interval_check")) {
      return {
        status: "validation",
        error: RECURRENCE_INTERVAL_ERROR,
        fieldErrors: { recurrence_interval_days: RECURRENCE_INTERVAL_ERROR },
      };
    }
  }
  if (error.code === "23503") {
    return { status: "not_found" };
  }
  logError("tasks", readFailure(error));
  if (error.code === "42501") {
    return { status: "unavailable", error: SESSION_ERROR };
  }
  return { status: "unavailable", error: GENERIC_ERROR };
}

/** Reads the milestone scoped to its project; the task writes below are only reached for a milestone of that project. */
async function findMilestone(
  supabase: Client,
  projectId: string,
  milestoneId: string,
): Promise<{ status: "found" } | TaskFailure> {
  const { data, error } = await supabase
    .from("milestones")
    .select("id")
    .eq("id", milestoneId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return translateError(error);
  return data ? { status: "found" } : { status: "not_found" };
}

export async function createTask(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  input: TaskCreateInput,
): Promise<TaskResult> {
  const milestone = await findMilestone(supabase, projectId, milestoneId);
  if (milestone.status !== "found") return milestone;

  // The rhythm starts today (Warsaw date, set here so a task added just after midnight gets the right day).
  const interval = input.recurrence_interval_days;
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...input,
      milestone_id: milestoneId,
      recurrence_start_date: interval === null ? null : todayInWarsaw(),
    })
    .select();
  if (error) return translateError(error);
  const row = data.at(0);
  return row ? { status: "ok", task: toTask(row) } : { status: "not_found" };
}

export async function updateTask(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  input: TaskInput,
): Promise<TaskResult> {
  const milestone = await findMilestone(supabase, projectId, milestoneId);
  if (milestone.status !== "found") return milestone;

  const { data, error } = await supabase
    .from("tasks")
    .update(input)
    .eq("id", taskId)
    .eq("milestone_id", milestoneId)
    .select();
  if (error) return translateError(error);
  const row = data.at(0);
  return row ? { status: "ok", task: toTask(row) } : { status: "not_found" };
}

export async function setTaskStatus(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  status: TaskStatus,
): Promise<TaskResult> {
  const milestone = await findMilestone(supabase, projectId, milestoneId);
  if (milestone.status !== "found") return milestone;

  const { data, error } = await supabase
    .from("tasks")
    .update({ status, deferred_until: null })
    .eq("id", taskId)
    .eq("milestone_id", milestoneId)
    .select();
  if (error) return translateError(error);
  const row = data.at(0);
  return row ? { status: "ok", task: toTask(row) } : { status: "not_found" };
}

/** Sets or clears `deferred_until`; a done task cannot be deferred (a status change clears the deferral in `setTaskStatus`). */
export async function setTaskDeferral(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  until: string | null,
): Promise<TaskResult> {
  const milestone = await findMilestone(supabase, projectId, milestoneId);
  if (milestone.status !== "found") return milestone;

  const base = supabase
    .from("tasks")
    .update({ deferred_until: until })
    .eq("id", taskId)
    .eq("milestone_id", milestoneId);
  const { data, error } = await (until === null ? base : base.neq("status", "done")).select();
  if (error) return translateError(error);
  const row = data.at(0);
  if (row) return { status: "ok", task: toTask(row) };
  if (until === null) return { status: "not_found" };

  const existing = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("milestone_id", milestoneId)
    .maybeSingle();
  if (existing.error) return translateError(existing.error);
  if (!existing.data) return { status: "not_found" };
  return { status: "validation", error: DONE_DEFERRAL_ERROR, fieldErrors: {} };
}

export async function deleteTask(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
): Promise<TaskDeleteResult> {
  const milestone = await findMilestone(supabase, projectId, milestoneId);
  if (milestone.status === "not_found") return milestone;
  if (milestone.status === "unavailable") return milestone;
  if (milestone.status === "validation") return { status: "unavailable", error: GENERIC_ERROR };

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("milestone_id", milestoneId)
    .select("id");
  if (error) {
    const result = translateError(error);
    return result.status === "unavailable" ? result : { status: "unavailable", error: GENERIC_ERROR };
  }
  return data.length > 0 ? { status: "ok" } : { status: "not_found" };
}
