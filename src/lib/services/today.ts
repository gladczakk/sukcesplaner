import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { logError } from "@/lib/log";
import { readFailure } from "@/lib/services/postgrest";
import type { TaskStatus, TaskTargetProject, TodayDeferredTask, TodayMilestone, TodayTask, TodayView } from "@/types";

type Client = SupabaseClient<Database>;

/** Reads the embedded project of a milestone row without a cast; PostgREST returns an object, an array is tolerated. */
function readEmbeddedProject(value: unknown): { id: string; name: string } | null {
  const candidate: unknown = Array.isArray(value) ? value.at(0) : value;
  if (typeof candidate !== "object" || candidate === null) return null;
  const id: unknown = Reflect.get(candidate, "id");
  const name: unknown = Reflect.get(candidate, "name");
  return typeof id === "string" && typeof name === "string" ? { id, name } : null;
}

/**
 * Reads the open tasks of the nearest milestones, the milestones ready to close and the deferred tasks; SQL order is kept.
 * The generated RPC types mark every column non-null, but the task columns are NULL on 'milestone' rows;
 * rows are therefore read by `kind` and the task columns only on 'task' rows.
 */
export async function getToday(supabase: Client, today: string): Promise<TodayView> {
  const { data, error } = await supabase.rpc("today_list", { p_today: today });
  if (error) throw readFailure(error);

  const view: TodayView = { tasks: [], milestones: [], deferred: [] };
  for (const row of data) {
    if (row.kind === "task") {
      const task: TodayTask = {
        id: row.task_id,
        title: row.task_title,
        due_date: row.task_due_date,
        status: row.task_status as TaskStatus,
        project: { id: row.project_id, name: row.project_name },
        milestone: { id: row.milestone_id, name: row.milestone_name, due_date: row.milestone_due_date },
      };
      view.tasks.push(task);
    } else if (row.kind === "milestone") {
      const milestone: TodayMilestone = {
        id: row.milestone_id,
        name: row.milestone_name,
        due_date: row.milestone_due_date,
        project: { id: row.project_id, name: row.project_name },
      };
      view.milestones.push(milestone);
    } else if (row.kind === "deferred") {
      const task: TodayDeferredTask = {
        id: row.task_id,
        title: row.task_title,
        due_date: row.task_due_date,
        status: row.task_status as TaskStatus,
        project: { id: row.project_id, name: row.project_name },
        milestone: { id: row.milestone_id, name: row.milestone_name, due_date: row.milestone_due_date },
        deferred_until: row.task_deferred_until,
      };
      view.deferred.push(task);
    } else {
      logError("today-list", new Error(`Unknown today_list kind: ${row.kind}`));
    }
  }
  return view;
}

/**
 * Reads the projects that have an open milestone, with those milestones ordered `due_date, seq` — the same order
 * `today_list` uses to pick the nearest one. Projects are ordered by their nearest milestone.
 */
export async function getTaskTargets(supabase: Client): Promise<TaskTargetProject[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("id, name, due_date, project_id, projects(id, name)")
    .is("completed_at", null)
    .order("due_date", { ascending: true })
    .order("seq", { ascending: true });
  if (error) throw readFailure(error);

  const targets = new Map<string, TaskTargetProject>();
  for (const row of data) {
    const project = readEmbeddedProject(row.projects);
    if (!project) {
      logError("today-task-targets", new Error(`Milestone ${row.id} came without its project`));
      continue;
    }
    const target = targets.get(row.project_id) ?? { id: project.id, name: project.name, milestones: [] };
    target.milestones.push({ id: row.id, name: row.name, due_date: row.due_date });
    targets.set(row.project_id, target);
  }
  return [...targets.values()];
}
