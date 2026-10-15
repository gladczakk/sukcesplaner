import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { readFailure } from "@/lib/services/postgrest";
import type { TaskStatus, TodayMilestone, TodayTask, TodayView } from "@/types";

type Client = SupabaseClient<Database>;

/** Reads the open tasks of the nearest milestones, the milestones ready to close and the deferred count; SQL order is kept. */
export async function getToday(supabase: Client, today: string): Promise<TodayView> {
  const { data, error } = await supabase.rpc("today_list", { p_today: today });
  if (error) throw readFailure(error);

  const view: TodayView = { tasks: [], milestones: [], deferredCount: 0 };
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
      view.deferredCount += 1;
    }
  }
  return view;
}
