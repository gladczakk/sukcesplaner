import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("astro:middleware", () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ createClient }));

import { onRequest } from "@/middleware";

type Handler = (context: APIContext, next: () => Promise<Response>) => Promise<Response>;
const handler = onRequest as unknown as Handler;

// Oracle: the decisions of observability-error-signals and the verified Supabase Auth shapes. A guest is a 400
// AuthSessionMissingError; an unreachable backend is an AuthRetryableFetchError (status 0); a tampered token is 403.
const GUEST = { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" };
const OUTAGE = { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" };
const BAD_JWT = { name: "AuthApiError", status: 403, code: "bad_jwt", message: "invalid JWT" };
const OUTAGE_MESSAGE = "Usługa uwierzytelniania jest chwilowo niedostępna. Spróbuj ponownie za chwilę.";

function useAuth(user: unknown, error: unknown) {
  createClient.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error }) } });
}

function run(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const url = new URL(`http://localhost${path}`);
  const locals: Record<string, unknown> = {};
  const next = vi.fn(() => Promise.resolve(new Response("page", { status: 200 })));
  const context = {
    request: new Request(url, init),
    cookies: {},
    url,
    locals,
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
  } as unknown as APIContext;
  const response = handler(context, next);
  return { response, locals, next };
}

describe("middleware", () => {
  let consoleError: MockInstance<typeof console.error>;
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    createClient.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("guest (unchanged behaviour, silent)", () => {
    it("redirects a guest on a protected page to sign-in without logging", async () => {
      useAuth(null, GUEST);
      const { response, locals } = run("/today");
      const res = await response;

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/auth/signin");
      expect(locals.user).toBeNull();
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    });

    it("answers 401 JSON for a guest on the project API", async () => {
      useAuth(null, GUEST);
      const res = await run("/api/projects/abc", { method: "POST" }).response;

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Wymagane logowanie" });
    });

    it("treats a missing client (no configuration) as a guest", async () => {
      createClient.mockReturnValue(null);
      const { response, locals } = run("/projects");
      const res = await response;

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/auth/signin");
      expect(locals.user).toBeNull();
    });
  });

  describe("signed-in user", () => {
    it("sets locals.user and continues", async () => {
      const user = { id: "u1" };
      useAuth(user, null);
      const { response, locals, next } = run("/today");
      const res = await response;

      expect(next).toHaveBeenCalledTimes(1);
      expect(locals.user).toBe(user);
      expect(res.status).toBe(200);
    });
  });

  describe("Supabase Auth outage", () => {
    it("answers 503 text with Retry-After on a protected page and logs one error with the request id", async () => {
      useAuth(null, OUTAGE);
      const { response, locals, next } = run("/today", { headers: { "cf-ray": "ray-1" } });
      const res = await response;

      expect(res.status).toBe(503);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(res.headers.get("Retry-After")).not.toBeNull();
      expect(await res.text()).toBe(OUTAGE_MESSAGE);
      expect(next).not.toHaveBeenCalled();
      expect(locals.user).toBeNull();
      expect(consoleError).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(consoleError.mock.calls[0]?.[0] as string) as Record<string, unknown>;
      expect(entry.scope).toBe("middleware-getUser");
      expect(entry.requestId).toBe("ray-1");
      expect(entry.name).toBe("AuthRetryableFetchError");
    });

    it("answers 503 JSON on the project API", async () => {
      useAuth(null, OUTAGE);
      const res = await run("/api/projects").response;

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: OUTAGE_MESSAGE });
    });

    it("lets public routes continue as a guest and still logs the outage", async () => {
      useAuth(null, OUTAGE);
      const { response, locals, next } = run("/auth/signin");
      const res = await response;

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
      expect(locals.user).toBeNull();
      expect(consoleError).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalid session", () => {
    it("warns (not errors) and treats the visitor as a guest", async () => {
      useAuth(null, BAD_JWT);
      const { response, locals } = run("/today");
      const res = await response;

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/auth/signin");
      expect(locals.user).toBeNull();
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(consoleWarn.mock.calls[0]?.[0] as string) as Record<string, unknown>;
      expect(entry.scope).toBe("middleware-getUser");
      expect(String(entry.event)).toContain("invalid_session");
    });
  });

  describe("request id", () => {
    it("uses the cf-ray header", async () => {
      useAuth(null, GUEST);
      const { response, locals } = run("/auth/signin", { headers: { "cf-ray": "ray-42" } });
      await response;

      expect(locals.requestId).toBe("ray-42");
    });

    it("generates a UUID without cf-ray", async () => {
      useAuth(null, GUEST);
      const { response, locals } = run("/auth/signin");
      await response;

      expect(locals.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it.each([
      ["a 503 response", "/today", OUTAGE],
      ["a redirect", "/today", GUEST],
      ["a root redirect", "/", GUEST],
      ["a 401 response", "/api/projects", GUEST],
      ["the result of next()", "/auth/signin", GUEST],
    ])("sets x-request-id on %s", async (_label, path, error) => {
      useAuth(null, error);
      const res = await run(path, { headers: { "cf-ray": "ray-7" } }).response;

      expect(res.headers.get("x-request-id")).toBe("ray-7");
    });

    it("sets x-request-id even when the response headers are immutable (Response.redirect)", async () => {
      useAuth({ id: "u1" }, null);
      const url = new URL("http://localhost/auth/signin");
      const context = {
        request: new Request(url, { headers: { "cf-ray": "ray-9" } }),
        cookies: {},
        url,
        locals: {},
        redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
      } as unknown as APIContext;
      const res = await handler(context, () => Promise.resolve(Response.redirect("http://localhost/today", 302)));

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("http://localhost/today");
      expect(res.headers.get("x-request-id")).toBe("ray-9");
    });
  });
});
