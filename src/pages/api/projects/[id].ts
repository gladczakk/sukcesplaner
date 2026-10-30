import type { APIRoute } from "astro";
import { errorResponse, json, readJsonBody } from "@/lib/api";
import { logContextFrom } from "@/lib/log";
import { deleteProject, updateProject } from "@/lib/services/projects";
import { createClient } from "@/lib/supabase";
import { flattenProjectErrors, projectIdSchema, projectInputSchema } from "@/lib/validation/project";

export const prerender = false;

const NOT_FOUND = "Nie znaleziono projektu";

export const PUT: APIRoute = async ({ request, cookies, params, locals }) => {
  const id = projectIdSchema.safeParse(params.id);
  if (!id.success) return errorResponse(404, NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = projectInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(422, "Popraw zaznaczone pola", flattenProjectErrors(parsed.error));
  }

  const result = await updateProject(supabase, id.data, parsed.data, logContextFrom(locals));
  switch (result.status) {
    case "ok":
      return json({ project: result.project }, 200);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};

export const DELETE: APIRoute = async ({ request, cookies, params, locals }) => {
  const id = projectIdSchema.safeParse(params.id);
  if (!id.success) return errorResponse(404, NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const result = await deleteProject(supabase, id.data, logContextFrom(locals));
  switch (result.status) {
    case "ok":
      return new Response(null, { status: 204 });
    case "not_found":
      return errorResponse(404, NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};
