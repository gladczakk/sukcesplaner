import { useCallback } from "react";
import type { Project } from "@/types";
import { PROJECT_FIELDS, projectIdSchema, type ProjectFieldErrors, type ProjectInput } from "@/lib/validation/project";

const SIGNIN_PATH = "/auth/signin";
const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.";
const GENERIC_ERROR = "Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.";

export type ProjectApiSaveResult =
  | { status: "ok"; project: Project }
  | { status: "fieldErrors"; error: string; fieldErrors: ProjectFieldErrors }
  | { status: "notFound" }
  | { status: "unauthorized" }
  | { status: "unavailable"; error: string };

export type ProjectApiDeleteResult =
  { status: "ok" } | { status: "notFound" } | { status: "unauthorized" } | { status: "unavailable"; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function readError(body: unknown): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : GENERIC_ERROR;
}

function readFieldErrors(body: unknown): ProjectFieldErrors {
  const result: ProjectFieldErrors = {};
  if (!isRecord(body) || !isRecord(body.fieldErrors)) return result;
  for (const field of PROJECT_FIELDS) {
    const message = body.fieldErrors[field];
    if (typeof message === "string") result[field] = message;
  }
  return result;
}

function redirectToSignin(): void {
  window.location.assign(SIGNIN_PATH);
}

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
    return { status: "fieldErrors", error: readError(body), fieldErrors: readFieldErrors(body) };
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
