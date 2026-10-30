import type { APIRoute } from "astro";
import { logContextFrom, logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      logError("auth-signout", error, logContextFrom(context.locals));
    }
  }
  return context.redirect("/auth/signin");
};
