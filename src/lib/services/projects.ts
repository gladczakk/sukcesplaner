import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { logError } from "@/lib/log";
import { LIFE_AREAS, type LifeArea, type Project } from "@/types";
import type { ProjectFieldErrors, ProjectInput } from "@/lib/validation/project";

type Client = SupabaseClient<Database>;

export type ProjectCreateResult =
  | { status: "ok"; project: Project }
  | { status: "validation"; error: string; fieldErrors: ProjectFieldErrors }
  | { status: "unavailable"; error: string };

export type ProjectMutationResult = ProjectCreateResult | { status: "not_found" };

export type ProjectDeleteResult = { status: "ok" } | { status: "not_found" } | { status: "unavailable"; error: string };

const GENERIC_ERROR = "Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.";
const SESSION_ERROR = "Sesja wygasła. Zaloguj się ponownie.";
const DUE_DATE_ERROR = "Termin projektu nie może być wcześniejszy niż data istniejącego milestona";

function isLifeArea(value: string): value is LifeArea {
  return (LIFE_AREAS as readonly string[]).includes(value);
}

/** Runtime guard narrowing the generated `life_area: string` to `LifeArea`. */
function toProject(row: Database["public"]["Tables"]["projects"]["Row"]): Project {
  if (!isLifeArea(row.life_area)) {
    throw new Error(`Unexpected life_area value: ${row.life_area}`);
  }
  return { ...row, life_area: row.life_area };
}

function readFailure(error: PostgrestError): Error {
  return new Error(`${error.code}: ${error.message}`);
}

function translateError(error: PostgrestError): Exclude<ProjectCreateResult, { status: "ok" }> {
  if (error.code === "23514") {
    if (error.message.includes("Termin projektu")) {
      return { status: "validation", error: DUE_DATE_ERROR, fieldErrors: { due_date: DUE_DATE_ERROR } };
    }
    if (error.message.includes("projects_name_length")) {
      const message = "Nazwa projektu musi mieć od 1 do 200 znaków";
      return { status: "validation", error: message, fieldErrors: { name: message } };
    }
    if (error.message.includes("projects_life_area_check")) {
      const message = "Wybierz obszar życia";
      return { status: "validation", error: message, fieldErrors: { life_area: message } };
    }
  }
  logError("projects", readFailure(error));
  if (error.code === "42501") {
    return { status: "unavailable", error: SESSION_ERROR };
  }
  return { status: "unavailable", error: GENERIC_ERROR };
}

export async function listProjects(supabase: Client): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select()
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw readFailure(error);
  return data.map(toProject);
}

export async function getProject(supabase: Client, id: string): Promise<Project | null> {
  const { data, error } = await supabase.from("projects").select().eq("id", id).maybeSingle();
  if (error) throw readFailure(error);
  return data ? toProject(data) : null;
}

export async function getProjectCounts(
  supabase: Client,
  projectId: string,
): Promise<{ milestones: number; tasks: number }> {
  const [milestones, tasks] = await Promise.all([
    supabase.from("milestones").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase
      .from("tasks")
      .select("id, milestones!inner(project_id)", { count: "exact", head: true })
      .eq("milestones.project_id", projectId),
  ]);
  if (milestones.error) throw readFailure(milestones.error);
  if (tasks.error) throw readFailure(tasks.error);

  return { milestones: milestones.count ?? 0, tasks: tasks.count ?? 0 };
}

export async function createProject(supabase: Client, input: ProjectInput): Promise<ProjectCreateResult> {
  const { data, error } = await supabase.from("projects").insert(input).select().single();
  if (error) return translateError(error);
  return { status: "ok", project: toProject(data) };
}

export async function updateProject(supabase: Client, id: string, input: ProjectInput): Promise<ProjectMutationResult> {
  const { data, error } = await supabase.from("projects").update(input).eq("id", id).select();
  if (error) return translateError(error);
  const row = data.at(0);
  return row ? { status: "ok", project: toProject(row) } : { status: "not_found" };
}

export async function deleteProject(supabase: Client, id: string): Promise<ProjectDeleteResult> {
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) {
    const result = translateError(error);
    return result.status === "unavailable" ? result : { status: "unavailable", error: GENERIC_ERROR };
  }
  return data.length > 0 ? { status: "ok" } : { status: "not_found" };
}
