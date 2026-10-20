import type { APIRoute } from "astro";
import { errorResponse, json } from "@/lib/api";
import { moveOccurrenceToTomorrow } from "@/lib/services/tasks";
import { createClient } from "@/lib/supabase";
import { todayInWarsaw, tomorrowInWarsaw } from "@/lib/today";
import { milestoneIdSchema } from "@/lib/validation/milestone";
import { projectIdSchema } from "@/lib/validation/project";
import { taskIdSchema } from "@/lib/validation/task";

export const prerender = false;

const PROJECT_NOT_FOUND = "Nie znaleziono projektu";
const MILESTONE_NOT_FOUND = "Nie znaleziono milestona";
const TASK_NOT_FOUND = "Nie znaleziono zadania";

// No body: the server decides both days, so the client cannot move an occurrence to any other date.
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const milestoneId = milestoneIdSchema.safeParse(params.milestoneId);
  if (!milestoneId.success) return errorResponse(404, MILESTONE_NOT_FOUND);
  const id = taskIdSchema.safeParse(params.taskId);
  if (!id.success) return errorResponse(404, TASK_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const now = new Date();
  const result = await moveOccurrenceToTomorrow(
    supabase,
    projectId.data,
    milestoneId.data,
    id.data,
    todayInWarsaw(now),
    tomorrowInWarsaw(now),
  );
  switch (result.status) {
    case "ok":
      return json({ task: result.task }, 201);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, TASK_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};
