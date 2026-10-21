import type { APIRoute } from "astro";
import { errorResponse, json, readJsonBody } from "@/lib/api";
import { deleteTask, setTaskDeferral, setTaskStatus, updateTask, type TaskResult } from "@/lib/services/tasks";
import { createClient } from "@/lib/supabase";
import { tomorrowInWarsaw } from "@/lib/today";
import { milestoneIdSchema } from "@/lib/validation/milestone";
import { projectIdSchema } from "@/lib/validation/project";
import {
  flattenTaskErrors,
  taskDeferralSchema,
  taskIdSchema,
  taskCreateSchema,
  taskStatusSchema,
} from "@/lib/validation/task";

export const prerender = false;

const PROJECT_NOT_FOUND = "Nie znaleziono projektu";
const MILESTONE_NOT_FOUND = "Nie znaleziono milestona";
const TASK_NOT_FOUND = "Nie znaleziono zadania";

export const PUT: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const milestoneId = milestoneIdSchema.safeParse(params.milestoneId);
  if (!milestoneId.success) return errorResponse(404, MILESTONE_NOT_FOUND);
  const id = taskIdSchema.safeParse(params.taskId);
  if (!id.success) return errorResponse(404, TASK_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = taskCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(422, "Popraw zaznaczone pola", flattenTaskErrors(parsed.error));
  }

  const result = await updateTask(supabase, projectId.data, milestoneId.data, id.data, parsed.data);
  switch (result.status) {
    case "ok":
      return json({ task: result.task }, 200);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, TASK_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const milestoneId = milestoneIdSchema.safeParse(params.milestoneId);
  if (!milestoneId.success) return errorResponse(404, MILESTONE_NOT_FOUND);
  const id = taskIdSchema.safeParse(params.taskId);
  if (!id.success) return errorResponse(404, TASK_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;
  const isObject = typeof body === "object" && body !== null && !Array.isArray(body);
  if (isObject && "status" in body && "deferred" in body) {
    return errorResponse(422, "Podaj albo status, albo przeniesienie.");
  }

  let result: TaskResult;
  if (isObject && "deferred" in body) {
    const parsed = taskDeferralSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(422, parsed.error.issues.at(0)?.message ?? "Nieprawidłowe dane");
    }
    const until = parsed.data.deferred === "tomorrow" ? tomorrowInWarsaw() : null;
    result = await setTaskDeferral(supabase, projectId.data, milestoneId.data, id.data, until);
  } else {
    const parsed = taskStatusSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(422, parsed.error.issues.at(0)?.message ?? "Nieprawidłowe dane");
    }
    result = await setTaskStatus(supabase, projectId.data, milestoneId.data, id.data, parsed.data.status);
  }
  switch (result.status) {
    case "ok":
      return json({ task: result.task }, 200);
    case "validation":
      return errorResponse(422, result.error, result.fieldErrors);
    case "not_found":
      return errorResponse(404, TASK_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
  const projectId = projectIdSchema.safeParse(params.id);
  if (!projectId.success) return errorResponse(404, PROJECT_NOT_FOUND);
  const milestoneId = milestoneIdSchema.safeParse(params.milestoneId);
  if (!milestoneId.success) return errorResponse(404, MILESTONE_NOT_FOUND);
  const id = taskIdSchema.safeParse(params.taskId);
  if (!id.success) return errorResponse(404, TASK_NOT_FOUND);

  const supabase = createClient(request.headers, cookies);
  if (!supabase) return errorResponse(500, "Aplikacja nie jest poprawnie skonfigurowana");

  const result = await deleteTask(supabase, projectId.data, milestoneId.data, id.data);
  switch (result.status) {
    case "ok":
      return new Response(null, { status: 204 });
    case "not_found":
      return errorResponse(404, TASK_NOT_FOUND);
    case "unavailable":
      return errorResponse(500, result.error);
  }
};
