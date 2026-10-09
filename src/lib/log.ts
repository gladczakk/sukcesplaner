/**
 * Server-side error log. Keeps the real cause (e.g. PostgREST code + message) out of user-facing responses while
 * still leaving it in the Workers logs for diagnosis after deploy.
 */
export function logError(scope: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`[${scope}] ${detail}`);
}
