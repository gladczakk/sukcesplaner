import type { AstroCookies } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const cookiesStub = {} as unknown as AstroCookies;

describe("createClient", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.resetModules();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.doUnmock("astro:env/server");
    vi.restoreAllMocks();
  });

  it("returns null and logs the missing configuration once per isolate", async () => {
    vi.doMock("astro:env/server", () => ({ SUPABASE_URL: undefined, SUPABASE_KEY: undefined }));
    const { createClient } = await import("@/lib/supabase");

    expect(createClient(new Headers(), cookiesStub)).toBeNull();
    expect(createClient(new Headers(), cookiesStub)).toBeNull();

    expect(consoleError).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(consoleError.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(entry.scope).toBe("supabase-config");
    expect(entry.level).toBe("error");
  });

  it("logs when only one of the two variables is missing", async () => {
    vi.doMock("astro:env/server", () => ({ SUPABASE_URL: "http://localhost:54321", SUPABASE_KEY: undefined }));
    const { createClient } = await import("@/lib/supabase");

    expect(createClient(new Headers(), cookiesStub)).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("returns a client and logs nothing when configured", async () => {
    vi.doMock("astro:env/server", () => ({ SUPABASE_URL: "http://localhost:54321", SUPABASE_KEY: "anon-key" }));
    const { createClient } = await import("@/lib/supabase");

    expect(createClient(new Headers(), cookiesStub)).not.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
