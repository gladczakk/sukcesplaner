import { defineMiddleware } from "astro:middleware";
import { errorResponse } from "@/lib/api";
import { classifyAuthError } from "@/lib/auth-health";
import { logError, logWarn } from "@/lib/log";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/projects", "/today"];
const PROTECTED_API_ROUTES = ["/api/projects"];
const OUTAGE_MESSAGE = "Usługa uwierzytelniania jest chwilowo niedostępna. Spróbuj ponownie za chwilę.";

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(route + "/");
}

/** Sets `x-request-id`; responses with immutable headers (e.g. `Response.redirect`) are re-created with it. */
function withRequestId(response: Response, requestId: string): Response {
  try {
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error; // only the immutable-headers TypeError is expected here
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestId = context.request.headers.get("cf-ray") ?? crypto.randomUUID();
  context.locals.requestId = requestId;
  const ctx = { requestId };

  const supabase = createClient(context.request.headers, context.cookies);
  let outage = false;

  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    const health = classifyAuthError(error);
    context.locals.user = health === "none" ? (user ?? null) : null;

    if (health === "outage") {
      outage = true;
      logError("middleware-getUser", error, ctx);
    } else if (health === "invalid_session") {
      const code = (error as { code?: unknown } | null)?.code;
      logWarn("middleware-getUser", typeof code === "string" ? `invalid_session:${code}` : "invalid_session", ctx);
    }
  } else {
    context.locals.user = null;
  }

  const { pathname } = context.url;

  // The root has no page: it only sends people on to the app (or to sign-in).
  if (pathname === "/") {
    return withRequestId(context.redirect(context.locals.user ? "/today" : "/auth/signin"), requestId);
  }

  const isProtectedApi = PROTECTED_API_ROUTES.some((route) => matchesRoute(pathname, route));
  const isProtectedPage = PROTECTED_ROUTES.some((route) => matchesRoute(pathname, route));

  // An Auth outage is not "signed out": answer 503 instead of bouncing a possibly valid session to sign-in.
  if (outage && (isProtectedApi || isProtectedPage)) {
    const response = isProtectedApi
      ? errorResponse(503, OUTAGE_MESSAGE)
      : new Response(OUTAGE_MESSAGE, {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" },
        });
    return withRequestId(response, requestId);
  }

  if (!context.locals.user) {
    if (isProtectedApi) {
      return withRequestId(
        new Response(JSON.stringify({ error: "Wymagane logowanie" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
        requestId,
      );
    }
    if (isProtectedPage) {
      return withRequestId(context.redirect("/auth/signin"), requestId);
    }
  }

  return withRequestId(await next(), requestId);
});
