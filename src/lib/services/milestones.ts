import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { logError, logWarn, type LogContext } from "@/lib/log";
import { GENERIC_ERROR, SESSION_ERROR, notFound, readFailure } from "@/lib/services/postgrest";
import { plural } from "@/lib/format";
import type { Milestone, MilestoneListItem, TaskStatus } from "@/types";
import type { MilestoneFieldErrors, MilestoneInput } from "@/lib/validation/milestone";

type Client = SupabaseClient<Database>;

export type MilestoneResult =
  | { status: "ok"; milestone: Milestone }
  | { status: "validation"; error: string; fieldErrors: MilestoneFieldErrors }
  | { status: "not_found" }
  | { status: "unavailable"; error: string };

export type MilestoneDeleteResult =
  { status: "ok" } | { status: "not_found" } | { status: "unavailable"; error: string };

type MilestoneFailure = Exclude<MilestoneResult, { status: "ok" }>;

const DUE_DATE_ERROR = "Data milestona nie może być późniejsza niż termin projektu";
const NAME_ERROR = "Nazwa milestona musi mieć od 1 do 200 znaków";

/** Extracts the trailing "(N)" from trigger messages ("...niezrobione zadania (N)", "...pozniejszym terminem (N)"); null when there is no number. */
function parseOpenTaskCount(message: string): string | null {
  const open = message.lastIndexOf("(");
  const close = message.lastIndexOf(")");
  if (open === -1 || close <= open) return null;
  const digits = message.slice(open + 1, close).trim();
  return digits.length > 0 && /^\d+$/.test(digits) ? digits : null;
}

function translateError(error: PostgrestError, ctx?: LogContext): MilestoneFailure {
  if (error.code === "23514") {
    if (error.message.includes("Data milestona")) {
      return { status: "validation", error: DUE_DATE_ERROR, fieldErrors: { due_date: DUE_DATE_ERROR } };
    }
    if (error.message.includes("milestones_name_length")) {
      return { status: "validation", error: NAME_ERROR, fieldErrors: { name: NAME_ERROR } };
    }
    if (error.message.includes("Nie mozna przesunac daty milestona")) {
      const count = parseOpenTaskCount(error.message);
      const message =
        count === null
          ? "Nie można ustawić tej daty: zadania mają późniejszy termin"
          : `Nie można ustawić tej daty: późniejszy termin ma ${count} ${plural(Number(count), ["zadanie", "zadania", "zadań"])}`;
      return { status: "validation", error: message, fieldErrors: { due_date: message } };
    }
    if (error.message.includes("Milestone nie moze zostac zamkniety")) {
      const count = parseOpenTaskCount(error.message);
      const message =
        count === null
          ? "Nie można zamknąć milestona: ma niezrobione zadania"
          : `Nie można zamknąć milestona: ma niezrobione zadania (${count})`;
      return { status: "validation", error: message, fieldErrors: {} };
    }
  }
  if (error.code === "23503") {
    const constraint = /constraint "([^"]+)"/.exec(error.message)?.[1];
    return notFound("milestones", constraint ? `fk_violation:${constraint}` : "fk_violation", ctx ?? {});
  }
  logError("milestones", readFailure(error), ctx);
  // 42501: RLS/permission; PGRST301/PGRST303: the JWT is missing, invalid or expired.
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST303") {
    return { status: "unavailable", error: SESSION_ERROR };
  }
  return { status: "unavailable", error: GENERIC_ERROR };
}

export async function listMilestones(supabase: Client, projectId: string): Promise<MilestoneListItem[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("*, tasks(*)")
    .eq("project_id", projectId)
    .order("due_date", { ascending: true })
    .order("seq", { ascending: true })
    .order("due_date", { referencedTable: "tasks", ascending: true, nullsFirst: false })
    .order("created_at", { referencedTable: "tasks", ascending: true });
  if (error) throw readFailure(error);
  return data.map((milestone) => {
    const tasks = milestone.tasks.map((task) => ({ ...task, status: task.status as TaskStatus }));
    return { ...milestone, tasks, task_count: tasks.length };
  });
}

export async function createMilestone(
  supabase: Client,
  projectId: string,
  input: MilestoneInput,
  ctx?: LogContext,
): Promise<MilestoneResult> {
  const log: LogContext = { ...ctx, op: "createMilestone", projectId };
  const { data, error } = await supabase
    .from("milestones")
    .insert({ ...input, project_id: projectId })
    .select()
    .single();
  if (error) return translateError(error, log);
  return { status: "ok", milestone: data };
}

export async function updateMilestone(
  supabase: Client,
  projectId: string,
  id: string,
  input: MilestoneInput,
  ctx?: LogContext,
): Promise<MilestoneResult> {
  const log: LogContext = { ...ctx, op: "updateMilestone", projectId, milestoneId: id };
  const { data, error } = await supabase
    .from("milestones")
    .update(input)
    .eq("id", id)
    .eq("project_id", projectId)
    .select();
  if (error) return translateError(error, log);
  const row = data.at(0);
  return row ? { status: "ok", milestone: row } : notFound("milestones", "zero_rows", log);
}

/**
 * Idempotent: when the milestone is already in the requested state nothing is written, so the original
 * `completed_at` survives and the closing rule (which fires on NULL -> value) is not bypassed by re-closing.
 */
export async function setMilestoneCompleted(
  supabase: Client,
  projectId: string,
  id: string,
  completed: boolean,
  ctx?: LogContext,
): Promise<MilestoneResult> {
  const log: LogContext = { ...ctx, op: "setMilestoneCompleted", projectId, milestoneId: id };
  const current = await supabase.from("milestones").select().eq("id", id).eq("project_id", projectId).maybeSingle();
  if (current.error) return translateError(current.error, log);
  if (!current.data) return notFound("milestones", "target_not_found", log);
  if ((current.data.completed_at !== null) === completed) return { status: "ok", milestone: current.data };

  // Conditional on the state we just read, so a concurrent request cannot overwrite `completed_at`.
  const update = supabase
    .from("milestones")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("project_id", projectId);
  const { data, error } = await (
    completed ? update.is("completed_at", null) : update.not("completed_at", "is", null)
  ).select();
  if (error) return translateError(error, log);
  const row = data.at(0);
  if (row) return { status: "ok", milestone: row };

  // No row matched: someone changed the state between our read and write, so report the current state.
  const latest = await supabase.from("milestones").select().eq("id", id).eq("project_id", projectId).maybeSingle();
  if (latest.error) return translateError(latest.error, log);
  // Lost race: the result is unchanged; the log says how the re-read compares with the request (no row content).
  const raceLog: LogContext = { ...log, step: completed ? "close" : "reopen" };
  if (!latest.data) {
    logWarn("milestones", "lost_race:deleted", raceLog);
    return { status: "not_found" };
  }
  const matches = (latest.data.completed_at !== null) === completed;
  logWarn("milestones", matches ? "lost_race:matches_request" : "lost_race:opposite", raceLog);
  return { status: "ok", milestone: latest.data };
}

export async function deleteMilestone(
  supabase: Client,
  projectId: string,
  id: string,
  ctx?: LogContext,
): Promise<MilestoneDeleteResult> {
  const log: LogContext = { ...ctx, op: "deleteMilestone", projectId, milestoneId: id };
  const { data, error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", id)
    .eq("project_id", projectId)
    .select("id");
  if (error) {
    const result = translateError(error, log);
    return result.status === "unavailable" ? result : { status: "unavailable", error: GENERIC_ERROR };
  }
  return data.length > 0 ? { status: "ok" } : notFound("milestones", "zero_rows", log);
}
