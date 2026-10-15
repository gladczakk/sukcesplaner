/** Response/error helpers shared by the browser-side API hooks (`use-project-api`, `use-milestone-api`). */

const SIGNIN_PATH = "/auth/signin";

export const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.";
export const GENERIC_ERROR = "Nie udało się wykonać operacji. Spróbuj ponownie za chwilę.";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function readError(body: unknown): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : GENERIC_ERROR;
}

/** Picks the string messages of the given `fields` out of the `fieldErrors` object of a 422 body. */
export function readFieldErrors<F extends string>(body: unknown, fields: readonly F[]): Partial<Record<F, string>> {
  const result: Partial<Record<F, string>> = {};
  if (!isRecord(body) || !isRecord(body.fieldErrors)) return result;
  for (const field of fields) {
    const message = body.fieldErrors[field];
    if (typeof message === "string") result[field] = message;
  }
  return result;
}

export function redirectToSignin(): void {
  window.location.assign(SIGNIN_PATH);
}
