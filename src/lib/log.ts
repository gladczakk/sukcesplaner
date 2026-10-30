/**
 * Server-side structured log. Every entry is one JSON line, so the real cause (stack, `cause` chain, PostgREST code,
 * details, hint) stays in the Workers logs for diagnosis while user-facing responses stay generic. No PII: only the
 * allow-listed context keys are copied, passwords, e-mails and IPs are never logged.
 */
export interface LogContext {
  userId?: string;
  requestId?: string;
  projectId?: string;
  milestoneId?: string;
  taskId?: string;
  op?: string;
  step?: string;
}

const CONTEXT_KEYS = ["userId", "requestId", "projectId", "milestoneId", "taskId", "op", "step"] as const;
const MAX_CAUSE_DEPTH = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readStatus(source: Record<string, unknown>): number | string | undefined {
  const value = source.status;
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

function isErrorLike(value: unknown): value is Record<string, unknown> {
  return value instanceof Error || (isRecord(value) && typeof value.message === "string");
}

function describeValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value) as string | undefined; // undefined for undefined/functions/symbols
    return json ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    const value = key === "status" ? readStatus(source) : readString(source, key);
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

function causeChain(error: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  let current = isRecord(error) ? error.cause : undefined;
  while (current !== undefined && current !== null && chain.length < MAX_CAUSE_DEPTH) {
    if (isErrorLike(current)) {
      chain.push({
        name: readString(current, "name") ?? "Error",
        message: readString(current, "message") ?? "",
        ...pick(current, ["code", "status", "details", "hint"]),
      });
      current = current.cause;
    } else {
      chain.push({ name: "NonError", message: describeValue(current) });
      break;
    }
  }
  return chain;
}

function describeError(error: unknown): Record<string, unknown> {
  if (!isErrorLike(error)) return { name: "NonError", message: describeValue(error) };
  const entry: Record<string, unknown> = {
    name: readString(error, "name") ?? "Error",
    message: readString(error, "message") ?? "",
    ...pick(error, ["stack", "status", "code", "details", "hint"]),
  };
  const cause = causeChain(error);
  if (cause.length > 0) entry.cause = cause;
  return entry;
}

function contextFields(ctx: LogContext | undefined): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!ctx) return fields;
  for (const key of CONTEXT_KEYS) {
    const value = ctx[key];
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

export function logError(scope: string, error: unknown, ctx?: LogContext): void {
  const entry = { level: "error", scope, ...describeError(error), ...contextFields(ctx) };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(entry));
}

/** A notable event that is not an exception (e.g. a rejected sign-in). */
export function logWarn(scope: string, event: string, ctx?: LogContext): void {
  const entry = { level: "warn", scope, event, ...contextFields(ctx) };
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify(entry));
}

export function logContextFrom(locals: { user?: { id: string } | null; requestId?: string }): LogContext {
  const ctx: LogContext = {};
  if (locals.user?.id !== undefined) ctx.userId = locals.user.id;
  if (locals.requestId !== undefined) ctx.requestId = locals.requestId;
  return ctx;
}
