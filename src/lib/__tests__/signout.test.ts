import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ createClient }));

import { POST } from "@/pages/api/auth/signout";

function run(locals: Record<string, unknown> = {}) {
  const context = {
    request: new Request("http://localhost/api/auth/signout", { method: "POST" }),
    cookies: {},
    locals,
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
  } as unknown as APIContext;
  return POST(context) as Promise<Response>;
}

describe("POST /api/auth/signout", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    createClient.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a signOut error with the request id and still redirects to sign-in", async () => {
    const signOut = vi
      .fn()
      .mockResolvedValue({ error: { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 } });
    createClient.mockReturnValue({ auth: { signOut } });

    const response = await run({ requestId: "req-1" });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(consoleError).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(consoleError.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(entry.scope).toBe("auth-signout");
    expect(entry.requestId).toBe("req-1");
    expect(entry.name).toBe("AuthRetryableFetchError");
  });

  it("logs nothing when signOut succeeds", async () => {
    createClient.mockReturnValue({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } });

    const response = await run({ requestId: "req-2" });

    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("only redirects when there is no client (the client factory logs that itself)", async () => {
    createClient.mockReturnValue(null);

    const response = await run();

    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
