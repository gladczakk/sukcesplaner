import { useCallback } from "react";
import type { Milestone } from "@/types";
import { NETWORK_ERROR, isRecord, readError, readFieldErrors, readJson, redirectToSignin } from "@/lib/api-client";
import {
  MILESTONE_FIELDS,
  milestoneIdSchema,
  type MilestoneFieldErrors,
  type MilestoneInput,
} from "@/lib/validation/milestone";

export type MilestoneApiSaveResult =
  | { status: "ok"; milestone: Milestone }
  | { status: "fieldErrors"; error: string; fieldErrors: MilestoneFieldErrors }
  | { status: "notFound" }
  | { status: "unauthorized" }
  | { status: "unavailable"; error: string };

export type MilestoneApiDeleteResult =
  { status: "ok" } | { status: "notFound" } | { status: "unauthorized" } | { status: "unavailable"; error: string };

async function saveMilestone(
  url: string,
  method: "POST" | "PUT" | "PATCH",
  payload: unknown,
): Promise<MilestoneApiSaveResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "unavailable", error: NETWORK_ERROR };
  }
  return readSaveResponse(response);
}

async function readSaveResponse(response: Response): Promise<MilestoneApiSaveResult> {
  if (response.status === 401) {
    redirectToSignin();
    return { status: "unauthorized" };
  }
  if (response.status === 404) return { status: "notFound" };

  const body = await readJson(response);
  if (response.status === 422) {
    return { status: "fieldErrors", error: readError(body), fieldErrors: readFieldErrors(body, MILESTONE_FIELDS) };
  }
  if (
    (response.status === 200 || response.status === 201) &&
    isRecord(body) &&
    isRecord(body.milestone) &&
    milestoneIdSchema.safeParse(body.milestone.id).success
  ) {
    return { status: "ok", milestone: body.milestone as unknown as Milestone };
  }
  return { status: "unavailable", error: readError(body) };
}

/** Single place for `fetch` calls to the milestone routes, translating responses to UI state. */
export function useMilestoneApi() {
  const createMilestone = useCallback(
    (projectId: string, input: MilestoneInput) => saveMilestone(`/api/projects/${projectId}/milestones`, "POST", input),
    [],
  );

  const updateMilestone = useCallback(
    (projectId: string, id: string, input: MilestoneInput) =>
      saveMilestone(`/api/projects/${projectId}/milestones/${id}`, "PUT", input),
    [],
  );

  const setMilestoneCompleted = useCallback(
    (projectId: string, id: string, completed: boolean) =>
      saveMilestone(`/api/projects/${projectId}/milestones/${id}`, "PATCH", { completed }),
    [],
  );

  const deleteMilestone = useCallback(async (projectId: string, id: string): Promise<MilestoneApiDeleteResult> => {
    let response: Response;
    try {
      // No body and no Content-Type: Astro's Origin check protects DELETE.
      response = await fetch(`/api/projects/${projectId}/milestones/${id}`, { method: "DELETE" });
    } catch {
      return { status: "unavailable", error: NETWORK_ERROR };
    }
    if (response.status === 204) return { status: "ok" };
    if (response.status === 401) {
      redirectToSignin();
      return { status: "unauthorized" };
    }
    if (response.status === 404) return { status: "notFound" };
    return { status: "unavailable", error: readError(await readJson(response)) };
  }, []);

  return { createMilestone, updateMilestone, setMilestoneCompleted, deleteMilestone };
}
