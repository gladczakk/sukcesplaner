import type { APIRoute } from "astro";
import { errorResponse, json, readJsonBody } from "@/lib/api";
import { logContextFrom } from "@/lib/log";
import { createProject } from "@/lib/services/projects";
import { createClient } from "@/lib/supabase";
import { flattenProjectErrors, projectInputSchema } from "@/lib/validation/project";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = projectInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(422, "Popraw zaznaczone pola", flattenProjectErrors(parsed.error));
  }

  const result = await createProject(supabase, parsed.data, logContextFrom(locals));
  switch (result.status) {
    case "ok":
      return json({ project: result.project }, 201);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};
