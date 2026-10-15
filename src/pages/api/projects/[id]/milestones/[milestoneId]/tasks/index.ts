import type { APIRoute } from "astro";
import { errorResponse, json, readJsonBody } from "@/lib/api";
import { createTask } from "@/lib/services/tasks";
import { createClient } from "@/lib/supabase";
import { milestoneIdSchema } from "@/lib/validation/milestone";
import { projectIdSchema } from "@/lib/validation/project";
import { flattenTaskErrors, taskInputSchema } from "@/lib/validation/task";

export const prerender = false;

const PROJECT_NOT_FOUND = "Nie znaleziono projektu";
const MILESTONE_NOT_FOUND = "Nie znaleziono milestona";

export const POST: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const milestoneId = milestoneIdSchema.safeParse(params.milestoneId);
  if (!milestoneId.success) return errorResponse(404, MILESTONE_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = taskInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(422, "Popraw zaznaczone pola", flattenTaskErrors(parsed.error));
  }

  const result = await createTask(supabase, projectId.data, milestoneId.data, parsed.data);
  switch (result.status) {
    case "ok":
      return json({ task: result.task }, 201);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, MILESTONE_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};
