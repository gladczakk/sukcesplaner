import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/projects", "/today"];
const PROTECTED_API_ROUTES = ["/api/projects"];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(route + "/");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname } = context.url;

  // The root has no page: it only sends people on to the app (or to sign-in).
  if (pathname === "/") {
    return context.redirect(context.locals.user ? "/today" : "/auth/signin");
  }

  if (!context.locals.user) {
    if (PROTECTED_API_ROUTES.some((route) => matchesRoute(pathname, route))) {
      return new Response(JSON.stringify({ error: "Wymagane logowanie" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (PROTECTED_ROUTES.some((route) => matchesRoute(pathname, route))) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
