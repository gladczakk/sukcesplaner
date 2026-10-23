import type { APIRoute } from "astro";
import { toAuthErrorCode } from "@/lib/auth-errors";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";
import { authCredentialsSchema } from "@/lib/validation/auth";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = authCredentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    return context.redirect("/auth/signin?error=invalid_input");
  }
  const { email, password } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=unavailable");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logError(`auth-signin:${error.code ?? "no-code"}`, error);
    return context.redirect(`/auth/signin?error=${toAuthErrorCode(error)}`);
  }

  return context.redirect("/today");
};
