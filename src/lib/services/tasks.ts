import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { logError, logWarn, type LogContext } from "@/lib/log";
import { GENERIC_ERROR, SESSION_ERROR, readFailure } from "@/lib/services/postgrest";
import { todayInWarsaw } from "@/lib/today";
import type { Task, TaskStatus } from "@/types";
import type { TaskCreateInput, TaskField, TaskFieldErrors } from "@/lib/validation/task";

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
  "Zadanie powtarzalne nie ma własnego terminu i nie można go oznaczyć jako zrobione ani przenieść. Odhacz jego wystąpienie na liście Dziś.";
const RECURRENCE_START_ERROR = "Termin milestona jest wcześniejszy niż dziś — powtarzanie nie miałoby kiedy się zacząć";
const RECURRENCE_INTERVAL_ERROR = "Podaj liczbę dni od 2 do 30";
const RECURRENCE_WEEKDAYS_ERROR = "Wybierz co najmniej jeden dzień tygodnia";
const ONE_RHYTHM_ERROR = "Wybierz jeden rytm: co X dni albo dni tygodnia";
const DISABLE_RECURRENCE_ERROR = "Aby wyłączyć powtarzanie, usuń zadanie.";
const STALE_TASK_ERROR = "To zadanie zostało w międzyczasie zmienione na powtarzalne. Odśwież stronę.";
const DONE_TO_RECURRING_ERROR = "Zrobionego zadania nie można zmienić w powtarzalne.";
const OCCURRENCE_ERROR = "To wystąpienie nie jest dziś aktualne. Odśwież stronę.";
const MOVE_ERROR = "Tego wystąpienia nie można przenieść na jutro. Odśwież stronę.";
const OCCURRENCE_DONE_ERROR = "To wystąpienie jest już zrobione. Odśwież stronę.";
const OCCURRENCE_MOVED_ERROR = "To wystąpienie zostało już przeniesione na jutro. Odśwież stronę.";

function toTask(row: TaskRow): Task {
  return { ...row, status: row.status as TaskStatus };
}

/** Logs why an empty result became `not_found` (the caller still just sees `not_found`). */
function notFound(event: string, ctx: LogContext): { status: "not_found" } {
  logWarn("tasks", event, ctx);
  return { status: "not_found" };
}

/** `rhythmField` is the field a start-date error is shown on: the rhythm the task being written has. */
function translateError(
  error: PostgrestError,
  rhythmField: Extract<TaskField, "recurrence_interval_days" | "recurrence_weekdays"> = "recurrence_interval_days",
  ctx?: LogContext,
): TaskFailure {
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
        fieldErrors: { [rhythmField]: RECURRENCE_START_ERROR },
      };
    }
    if (error.message.includes("tasks_recurrence_weekdays_check")) {
      return {
        status: "validation",
        error: RECURRENCE_WEEKDAYS_ERROR,
        fieldErrors: { recurrence_weekdays: RECURRENCE_WEEKDAYS_ERROR },
      };
    }
    if (error.message.includes("tasks_recurrence_one_rhythm_check")) {
      return { status: "validation", error: ONE_RHYTHM_ERROR, fieldErrors: {} };
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
    const constraint = /constraint "([^"]+)"/.exec(error.message)?.[1];
    return notFound(constraint ? `fk_violation:${constraint}` : "fk_violation", ctx ?? {});
  }
  logError("tasks", readFailure(error), ctx);
  // 42501: RLS/permission; PGRST301/PGRST303: the JWT is missing, invalid or expired.
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST303") {
    return { status: "unavailable", error: SESSION_ERROR };
  }
  return { status: "unavailable", error: GENERIC_ERROR };
}

/** Reads the milestone scoped to its project; the task writes below are only reached for a milestone of that project. */
async function findMilestone(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  ctx: LogContext,
): Promise<{ status: "found" } | TaskFailure> {
  const { data, error } = await supabase
    .from("milestones")
    .select("id")
    .eq("id", milestoneId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return translateError(error, undefined, ctx);
  return data ? { status: "found" } : notFound("parent_not_found", ctx);
}

export async function createTask(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  input: TaskCreateInput,
  ctx?: LogContext,
): Promise<TaskResult> {
  const log: LogContext = { ...ctx, op: "createTask", projectId, milestoneId };
  const milestone = await findMilestone(supabase, projectId, milestoneId, log);
  if (milestone.status !== "found") return milestone;

  // The rhythm (interval or weekdays) starts today (Warsaw date, set here so a task added just after midnight gets the right day).
  const hasWeekdays = input.recurrence_weekdays !== null;
  const hasRhythm = input.recurrence_interval_days !== null || hasWeekdays;
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...input,
      milestone_id: milestoneId,
      recurrence_start_date: hasRhythm ? todayInWarsaw() : null,
    })
    .select();
  if (error) return translateError(error, hasWeekdays ? "recurrence_weekdays" : "recurrence_interval_days", log);
  const row = data.at(0);
  return row ? { status: "ok", task: toTask(row) } : notFound("zero_rows", log);
}

function sameRhythm(
  task: Pick<TaskRow, "recurrence_interval_days" | "recurrence_weekdays">,
  input: Pick<TaskCreateInput, "recurrence_interval_days" | "recurrence_weekdays">,
): boolean {
  // "Codziennie" is both interval 1 and all seven weekdays (same label, same days), so those count as one rhythm.
  const key = (interval: number | null, days: number[] | null) => {
    if (interval === 1 || days?.length === 7) return "daily";
    if (interval !== null) return `every:${interval}`;
    return days === null ? "none" : `days:${[...days].sort((a, b) => a - b).join(",")}`;
  };
  return (
    key(task.recurrence_interval_days, task.recurrence_weekdays) ===
    key(input.recurrence_interval_days, input.recurrence_weekdays)
  );
}

/**
 * Edits a task, including its rhythm. A changed rhythm starts today (Warsaw); switching an ordinary task to a rhythm
 * clears its due date, deferral and status in the same UPDATE (the table checks validate the final row).
 * Turning a rhythm off is not an update: the caller deletes the task instead.
 */
export async function updateTask(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  input: TaskCreateInput,
  ctx?: LogContext,
): Promise<TaskResult> {
  const log: LogContext = { ...ctx, op: "updateTask", projectId, milestoneId, taskId };
  const milestone = await findMilestone(supabase, projectId, milestoneId, log);
  if (milestone.status !== "found") return milestone;

  const existing = await supabase.from("tasks").select().eq("id", taskId).eq("milestone_id", milestoneId).maybeSingle();
  if (existing.error) return translateError(existing.error, undefined, log);
  if (!existing.data) return notFound("target_not_found", log);
  const current = existing.data;

  const wasRecurring = current.recurrence_interval_days !== null || current.recurrence_weekdays !== null;
  const hasWeekdays = input.recurrence_weekdays !== null;
  const hasRhythm = input.recurrence_interval_days !== null || hasWeekdays;
  const rhythmField = hasWeekdays ? "recurrence_weekdays" : "recurrence_interval_days";
  const rhythm = {
    recurrence_interval_days: input.recurrence_interval_days,
    // Stored ascending (as the form sends it), whatever order the caller used.
    recurrence_weekdays:
      input.recurrence_weekdays === null ? null : [...input.recurrence_weekdays].sort((x, y) => x - y),
  };

  if (wasRecurring && !hasRhythm) {
    return { status: "validation", error: DISABLE_RECURRENCE_ERROR, fieldErrors: {} };
  }

  // One UPDATE per case; `onlyOpen` adds `status <> 'done'` so a done task is never silently reopened.
  async function write(patch: Partial<TaskRow>, onlyOpen = false): Promise<TaskResult> {
    const query = supabase.from("tasks").update(patch).eq("id", taskId).eq("milestone_id", milestoneId);
    const { data, error } = await (onlyOpen ? query.neq("status", "done") : query).select();
    if (error) return translateError(error, rhythmField, log);
    const row = data.at(0);
    if (row) return { status: "ok", task: toTask(row) };
    // With `onlyOpen` an empty result is resolved by the caller (done vs deleted), so it is not logged here.
    return onlyOpen ? { status: "not_found" } : notFound("zero_rows", log);
  }

  if (wasRecurring && sameRhythm(current, input)) return write({ title: input.title });
  if (wasRecurring) {
    return write({ title: input.title, due_date: null, ...rhythm, recurrence_start_date: todayInWarsaw() });
  }
  if (!hasRhythm) {
    const plain = await write({ title: input.title, due_date: input.due_date });
    // The task was read as ordinary; the shape check firing now means another tab made it recurring in between.
    if (plain.status === "validation" && plain.error === RECURRING_STATE_ERROR) {
      return { status: "validation", error: STALE_TASK_ERROR, fieldErrors: {} };
    }
    return plain;
  }

  const result = await write(
    {
      title: input.title,
      ...rhythm,
      recurrence_start_date: todayInWarsaw(),
      due_date: null,
      deferred_until: null,
      status: "todo",
    },
    true,
  );
  // The task was read above, so no updated row means it is done (or deleted in between).
  if (result.status !== "not_found") return result;
  const stillThere = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("milestone_id", milestoneId)
    .maybeSingle();
  if (stillThere.error) return translateError(stillThere.error, undefined, log);
  if (!stillThere.data) return notFound("zero_rows", log);
  return { status: "validation", error: DONE_TO_RECURRING_ERROR, fieldErrors: {} };
}

export async function setTaskStatus(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  status: TaskStatus,
  ctx?: LogContext,
): Promise<TaskResult> {
  const log: LogContext = { ...ctx, op: "setTaskStatus", projectId, milestoneId, taskId };
  const milestone = await findMilestone(supabase, projectId, milestoneId, log);
  if (milestone.status !== "found") return milestone;

  const { data, error } = await supabase
    .from("tasks")
    .update({ status, deferred_until: null })
    .eq("id", taskId)
    .eq("milestone_id", milestoneId)
    .select();
  if (error) return translateError(error, undefined, log);
  const row = data.at(0);
  return row ? { status: "ok", task: toTask(row) } : notFound("zero_rows", log);
}

/** Sets or clears `deferred_until`; a done task cannot be deferred (a status change clears the deferral in `setTaskStatus`). */
export async function setTaskDeferral(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  until: string | null,
  ctx?: LogContext,
): Promise<TaskResult> {
  const log: LogContext = { ...ctx, op: "setTaskDeferral", projectId, milestoneId, taskId };
  const milestone = await findMilestone(supabase, projectId, milestoneId, log);
  if (milestone.status !== "found") return milestone;

  const base = supabase
    .from("tasks")
    .update({ deferred_until: until })
    .eq("id", taskId)
    .eq("milestone_id", milestoneId);
  const { data, error } = await (until === null ? base : base.neq("status", "done")).select();
  if (error) return translateError(error, undefined, log);
  const row = data.at(0);
  if (row) return { status: "ok", task: toTask(row) };
  if (until === null) return notFound("zero_rows", log);

  const existing = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("milestone_id", milestoneId)
    .maybeSingle();
  if (existing.error) return translateError(existing.error, undefined, log);
  if (!existing.data) return notFound("zero_rows", log);
  return { status: "validation", error: DONE_DEFERRAL_ERROR, fieldErrors: {} };
}

/** Marks the occurrence of a recurring task on `date` as done; a repeated mark (double click) counts as success. */
export async function completeOccurrence(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  date: string,
  ctx?: LogContext,
): Promise<TaskResult> {
  const log: LogContext = { ...ctx, op: "completeOccurrence", projectId, milestoneId, taskId };
  const milestone = await findMilestone(supabase, projectId, milestoneId, log);
  if (milestone.status !== "found") return milestone;

  const existing = await supabase.from("tasks").select().eq("id", taskId).eq("milestone_id", milestoneId).maybeSingle();
  if (existing.error) return translateError(existing.error, undefined, log);
  if (!existing.data) return notFound("target_not_found", log);

  const { error } = await supabase.from("task_occurrences").insert({ task_id: taskId, occurrence_date: date });
  if (error?.code === "23505") {
    // A repeat of the same mark is a success; a day already moved away is not "done".
    const row = await supabase
      .from("task_occurrences")
      .select("state")
      .eq("task_id", taskId)
      .eq("occurrence_date", date)
      .maybeSingle();
    if (row.error) return translateError(row.error, undefined, log);
    if (row.data?.state === "moved") {
      return { status: "validation", error: OCCURRENCE_MOVED_ERROR, fieldErrors: {} };
    }
    return { status: "ok", task: toTask(existing.data) };
  }
  if (error) {
    if (error.code === "23514" && error.message.includes("Wystapienie")) {
      return { status: "validation", error: OCCURRENCE_ERROR, fieldErrors: {} };
    }
    return translateError(error, undefined, log);
  }
  return { status: "ok", task: toTask(existing.data) };
}

/**
 * Moves today's occurrence of a recurring task to `tomorrow` (one-time, enforced by the database);
 * a repeated move to the same day (double click) counts as success.
 */
export async function moveOccurrenceToTomorrow(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  today: string,
  tomorrow: string,
  ctx?: LogContext,
): Promise<TaskResult> {
  const log: LogContext = { ...ctx, op: "moveOccurrenceToTomorrow", projectId, milestoneId, taskId };
  const milestone = await findMilestone(supabase, projectId, milestoneId, log);
  if (milestone.status !== "found") return milestone;

  const existing = await supabase.from("tasks").select().eq("id", taskId).eq("milestone_id", milestoneId).maybeSingle();
  if (existing.error) return translateError(existing.error, undefined, log);
  if (!existing.data) return notFound("target_not_found", log);

  const { error } = await supabase
    .from("task_occurrences")
    .insert({ task_id: taskId, occurrence_date: today, state: "moved", moved_to: tomorrow });
  if (!error) return { status: "ok", task: toTask(existing.data) };

  if (error.code === "23505") {
    const row = await supabase
      .from("task_occurrences")
      .select("state, moved_to")
      .eq("task_id", taskId)
      .eq("occurrence_date", today)
      .maybeSingle();
    if (row.error) return translateError(row.error, undefined, log);
    if (row.data?.state === "moved" && row.data.moved_to === tomorrow) {
      return { status: "ok", task: toTask(existing.data) };
    }
    if (row.data?.state === "done") {
      return { status: "validation", error: OCCURRENCE_DONE_ERROR, fieldErrors: {} };
    }
    return { status: "validation", error: MOVE_ERROR, fieldErrors: {} };
  }
  if (error.code === "23514") {
    // Move-specific trigger messages and the moved_* constraints have their own wording; the common
    // rejections keep "Wystapienie" and the existing translation.
    if (
      error.message.includes("Przeniesienie wystapienia") ||
      error.message.includes("task_occurrences_moved_to_check") ||
      error.message.includes("task_occurrences_moved_shape")
    ) {
      return { status: "validation", error: MOVE_ERROR, fieldErrors: {} };
    }
    if (error.message.includes("Wystapienie")) {
      return { status: "validation", error: OCCURRENCE_ERROR, fieldErrors: {} };
    }
  }
  return translateError(error, undefined, log);
}

export async function deleteTask(
  supabase: Client,
  projectId: string,
  milestoneId: string,
  taskId: string,
  ctx?: LogContext,
): Promise<TaskDeleteResult> {
  const log: LogContext = { ...ctx, op: "deleteTask", projectId, milestoneId, taskId };
  const milestone = await findMilestone(supabase, projectId, milestoneId, log);
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
    const result = translateError(error, undefined, log);
    return result.status === "unavailable" ? result : { status: "unavailable", error: GENERIC_ERROR };
  }
  return data.length > 0 ? { status: "ok" } : notFound("zero_rows", log);
}
