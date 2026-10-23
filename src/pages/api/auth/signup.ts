import type { APIRoute } from "astro";
import { toAuthErrorCode } from "@/lib/auth-errors";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signup?error=unavailable");
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    logError("auth-signup", error);
    return context.redirect(`/auth/signup?error=${toAuthErrorCode(error)}`);
  }

  return context.redirect("/auth/confirm-email");
};
