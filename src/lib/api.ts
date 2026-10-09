export interface ApiError {
  error: string;
  fieldErrors?: Partial<Record<string, string>>;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, error: string, fieldErrors?: ApiError["fieldErrors"]): Response {
  const body: ApiError = fieldErrors ? { error, fieldErrors } : { error };
  return json(body, status);
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

/**
 * Requires `Content-Type: application/json` (the main CSRF guard for routes with a body, since Astro's
 * origin check skips JSON) and parses the body.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: errorResponse(415, "Wymagany nagłówek Content-Type: application/json") };
  }
  try {
    return { ok: true, body: (await request.json()) as unknown };
  } catch {
    return { ok: false, response: errorResponse(400, "Nieprawidłowy JSON w treści żądania") };
  }
}
