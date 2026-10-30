import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Database } from "@/db/database.types";
import { logError } from "@/lib/log";

let configMissingLogged = false;

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Once per isolate: a missing configuration is the same on every request, one entry is enough to see it.
    if (!configMissingLogged) {
      configMissingLogged = true;
      logError("supabase-config", new Error("SUPABASE_URL or SUPABASE_KEY is not set"));
    }
    return null;
  }
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
