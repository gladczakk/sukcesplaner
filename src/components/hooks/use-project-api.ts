import { useCallback } from "react";
import type { Project } from "@/types";
import { PROJECT_FIELDS, projectIdSchema, type ProjectFieldErrors, type ProjectInput } from "@/lib/validation/project";
import { NETWORK_ERROR, isRecord, readError, readFieldErrors, readJson, redirectToSignin } from "@/lib/api-client";

export type ProjectApiSaveResult =
  | { status: "ok"; project: Project }
  | { status: "fieldErrors"; error: string; fieldErrors: ProjectFieldErrors }
  | { status: "notFound" }
  | { status: "unauthorized" }
  | { status: "unavailable"; error: string };

export type ProjectApiDeleteResult =
  { status: "ok" } | { status: "notFound" } | { status: "unauthorized" } | { status: "unavailable"; error: string };

async function saveProject(url: string, method: "POST" | "PUT", input: ProjectInput): Promise<ProjectApiSaveResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { status: "unavailable", error: NETWORK_ERROR };
  }

  if (response.status === 401) {
    redirectToSignin();
    return { status: "unauthorized" };
  }
  if (response.status === 404) return { status: "notFound" };

  const body = await readJson(response);
  if (response.status === 422) {
    return { status: "fieldErrors", error: readError(body), fieldErrors: readFieldErrors(body, PROJECT_FIELDS) };
  }
  if (
    (response.status === 200 || response.status === 201) &&
    isRecord(body) &&
    isRecord(body.project) &&
    projectIdSchema.safeParse(body.project.id).success
  ) {
    return { status: "ok", project: body.project as unknown as Project };
  }
  return { status: "unavailable", error: readError(body) };
}

/** Single place for `fetch` calls to the project routes, translating responses to UI state. */
export function useProjectApi() {
  const createProject = useCallback((input: ProjectInput) => saveProject("/api/projects", "POST", input), []);

  const updateProject = useCallback(
    (id: string, input: ProjectInput) => saveProject(`/api/projects/${id}`, "PUT", input),
    [],
  );

  const deleteProject = useCallback(async (id: string): Promise<ProjectApiDeleteResult> => {
    let response: Response;
    try {
      // No body and no Content-Type: Astro's Origin check protects DELETE.
      response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
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

  return { createProject, updateProject, deleteProject };
}
