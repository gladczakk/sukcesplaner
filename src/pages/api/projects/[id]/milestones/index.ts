import type { APIRoute } from "astro";
import { errorResponse, json, readJsonBody } from "@/lib/api";
import { createMilestone } from "@/lib/services/milestones";
import { createClient } from "@/lib/supabase";
import { flattenMilestoneErrors, milestoneInputSchema } from "@/lib/validation/milestone";
import { projectIdSchema } from "@/lib/validation/project";

export const prerender = false;

const NOT_FOUND = "Nie znaleziono projektu";

export const POST: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = milestoneInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(422, "Popraw zaznaczone pola", flattenMilestoneErrors(parsed.error));
  }

  const result = await createMilestone(supabase, projectId.data, parsed.data);
  switch (result.status) {
    case "ok":
      return json({ milestone: result.milestone }, 201);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};
