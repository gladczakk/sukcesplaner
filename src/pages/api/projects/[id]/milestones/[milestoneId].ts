import type { APIRoute } from "astro";
import { errorResponse, json, readJsonBody } from "@/lib/api";
import { deleteMilestone, setMilestoneCompleted, updateMilestone } from "@/lib/services/milestones";
import { createClient } from "@/lib/supabase";
import {
  flattenMilestoneErrors,
  milestoneCompletionSchema,
  milestoneIdSchema,
  milestoneInputSchema,
} from "@/lib/validation/milestone";
import { projectIdSchema } from "@/lib/validation/project";

export const prerender = false;

const PROJECT_NOT_FOUND = "Nie znaleziono projektu";
const MILESTONE_NOT_FOUND = "Nie znaleziono milestona";

export const PUT: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const id = milestoneIdSchema.safeParse(params.milestoneId);
  if (!id.success) return errorResponse(404, MILESTONE_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = milestoneInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(422, "Popraw zaznaczone pola", flattenMilestoneErrors(parsed.error));
  }

  const result = await updateMilestone(supabase, projectId.data, id.data, parsed.data);
  switch (result.status) {
    case "ok":
      return json({ milestone: result.milestone }, 200);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, MILESTONE_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const id = milestoneIdSchema.safeParse(params.milestoneId);
  if (!id.success) return errorResponse(404, MILESTONE_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = milestoneCompletionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(422, parsed.error.issues.at(0)?.message ?? "Nieprawidłowe dane");
  }

  const result = await setMilestoneCompleted(supabase, projectId.data, id.data, parsed.data.completed);
  switch (result.status) {
    case "ok":
      return json({ milestone: result.milestone }, 200);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, MILESTONE_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const id = milestoneIdSchema.safeParse(params.milestoneId);
  if (!id.success) return errorResponse(404, MILESTONE_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const result = await deleteMilestone(supabase, projectId.data, id.data);
  switch (result.status) {
    case "ok":
      return new Response(null, { status: 204 });
    case "not_found":
      return errorResponse(404, MILESTONE_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};
