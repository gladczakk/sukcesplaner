import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { logError } from "@/lib/log";
import { GENERIC_ERROR, SESSION_ERROR, readFailure } from "@/lib/services/postgrest";
import type { Milestone, MilestoneListItem } from "@/types";
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

/** Extracts N from the closing-rule message "...niezrobione zadania (N)"; null when there is no number. */
function parseOpenTaskCount(message: string): string | null {
  const open = message.lastIndexOf("(");
  const close = message.lastIndexOf(")");
  if (open === -1 || close <= open) return null;
  const digits = message.slice(open + 1, close).trim();
  return digits.length > 0 && /^\d+$/.test(digits) ? digits : null;
}

function translateError(error: PostgrestError): MilestoneFailure {
  if (error.code === "23514") {
    if (error.message.includes("Data milestona")) {
      return { status: "validation", error: DUE_DATE_ERROR, fieldErrors: { due_date: DUE_DATE_ERROR } };
    }
    if (error.message.includes("milestones_name_length")) {
      return { status: "validation", error: NAME_ERROR, fieldErrors: { name: NAME_ERROR } };
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
    return { status: "not_found" };
  }
  logError("milestones", readFailure(error));
  if (error.code === "42501") {
    return { status: "unavailable", error: SESSION_ERROR };
  }
  return { status: "unavailable", error: GENERIC_ERROR };
}

export async function listMilestones(supabase: Client, projectId: string): Promise<MilestoneListItem[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("*, tasks(count)")
    .eq("project_id", projectId)
    .order("due_date", { ascending: true })
    .order("seq", { ascending: true });
  if (error) throw readFailure(error);
  return data.map(({ tasks, ...milestone }) => ({ ...milestone, task_count: tasks.at(0)?.count ?? 0 }));
}

export async function createMilestone(
  supabase: Client,
  projectId: string,
  input: MilestoneInput,
): Promise<MilestoneResult> {
  const { data, error } = await supabase
    .from("milestones")
    .insert({ ...input, project_id: projectId })
    .select()
    .single();
  if (error) return translateError(error);
  return { status: "ok", milestone: data };
}

export async function updateMilestone(
  supabase: Client,
  projectId: string,
  id: string,
  input: MilestoneInput,
): Promise<MilestoneResult> {
  const { data, error } = await supabase
    .from("milestones")
    .update(input)
    .eq("id", id)
    .eq("project_id", projectId)
    .select();
  if (error) return translateError(error);
  const row = data.at(0);
  return row ? { status: "ok", milestone: row } : { status: "not_found" };
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
): Promise<MilestoneResult> {
  const current = await supabase.from("milestones").select().eq("id", id).eq("project_id", projectId).maybeSingle();
  if (current.error) return translateError(current.error);
  if (!current.data) return { status: "not_found" };
  if ((current.data.completed_at !== null) === completed) return { status: "ok", milestone: current.data };

  const { data, error } = await supabase
    .from("milestones")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("project_id", projectId)
    .select();
  if (error) return translateError(error);
  const row = data.at(0);
  return row ? { status: "ok", milestone: row } : { status: "not_found" };
}

export async function deleteMilestone(supabase: Client, projectId: string, id: string): Promise<MilestoneDeleteResult> {
  const { data, error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", id)
    .eq("project_id", projectId)
    .select("id");
  if (error) {
    const result = translateError(error);
    return result.status === "unavailable" ? result : { status: "unavailable", error: GENERIC_ERROR };
  }
  return data.length > 0 ? { status: "ok" } : { status: "not_found" };
}
