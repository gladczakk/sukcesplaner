// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, json } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  let body = null;
  let text = "";
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json();
  } else if (contentType.includes("text/html")) {
    text = await response.text();
  }
  return { status: response.status, location: response.headers.get("location") ?? "", body, text };
}

// Project API steps share the id of the project created in the "create succeeds" step.
let projectId = "";
let projectDeleted = false;
const otherProjectId = "00000000-0000-4000-8000-000000000000";
const validProject = { name: "Smoke project", description: "", life_area: "dom", due_date: "2099-12-31" };

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  // Astro swallows SSR errors of React islands (page stays 200, island missing), so assert the island's form is there.
  ["signin page renders", () => request("/auth/signin"), { status: 200, bodyIncludes: 'action="/api/auth/signin"' }],
  ["signup page renders", () => request("/auth/signup"), { status: 200, bodyIncludes: 'action="/api/auth/signup"' }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["projects page redirects anonymous user", () => request("/projects"), { status: 302, location: "/auth/signin" }],
  [
    "project API rejects anonymous user",
    () => request("/api/projects", { method: "POST", json: validProject }),
    { status: 401, bodyEquals: { error: "Wymagane logowanie" } },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/projects" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  // Island SSR errors leave the page at 200, so assert the empty state and the island's trigger button.
  [
    "projects page renders empty state",
    () => request("/projects"),
    { status: 200, bodyIncludes: "Nie masz jeszcze projektów." },
  ],
  ["projects page renders add button", () => request("/projects"), { status: 200, bodyIncludes: "Dodaj projekt" }],
  [
    "project create rejects empty name",
    () => request("/api/projects", { method: "POST", json: { ...validProject, name: "" } }),
    { status: 422, bodyEquals: { "fieldErrors.name": "Podaj nazwę projektu" } },
  ],
  [
    "project create succeeds",
    async () => {
      const result = await request("/api/projects", { method: "POST", json: validProject });
      projectId = result.body?.project?.id ?? "";
      return result;
    },
    { status: 201, bodyField: "project.id" },
  ],
  ["project page renders", () => request(`/projects/${projectId}`), { status: 200, bodyIncludes: "Smoke project" }],
  [
    "project page renders edit island",
    () => request(`/projects/${projectId}`),
    { status: 200, bodyIncludes: "Edytuj" },
  ],
  [
    "project page renders delete island",
    () => request(`/projects/${projectId}`),
    { status: 200, bodyIncludes: "Usuń projekt…" },
  ],
  [
    "project update succeeds",
    () => request(`/api/projects/${projectId}`, { method: "PUT", json: { ...validProject, name: "Smoke project 2" } }),
    { status: 200, bodyEquals: { "project.name": "Smoke project 2" } },
  ],
  [
    "project update of unknown id returns 404",
    () => request(`/api/projects/${otherProjectId}`, { method: "PUT", json: validProject }),
    { status: 404 },
  ],
  [
    "project delete succeeds",
    async () => {
      const result = await request(`/api/projects/${projectId}`, { method: "DELETE" });
      if (result.status === 204) projectDeleted = true;
      return result;
    },
    { status: 204 },
  ],
  [
    "deleted project page returns 404",
    () => request(`/projects/${projectId}`),
    { status: 404, bodyIncludes: "Nie znaleziono projektu" },
  ],
  [
    "project repeated delete returns 404",
    () => request(`/api/projects/${projectId}`, { method: "DELETE" }),
    { status: 404 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

function readPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

// A location ending in "=" is a prefix (e.g. "?error="); every other location must match exactly.
function locationMatches(expected, actual) {
  return expected.endsWith("=") ? actual.startsWith(expected) : actual === expected;
}

function matches(expected, actual) {
  return (
    actual.status === expected.status &&
    (expected.location === undefined || locationMatches(expected.location, actual.location)) &&
    (expected.bodyField === undefined || readPath(actual.body, expected.bodyField) !== undefined) &&
    (expected.bodyEquals === undefined ||
      Object.entries(expected.bodyEquals).every(([path, value]) => readPath(actual.body, path) === value)) &&
    (expected.bodyIncludes === undefined || actual.text.includes(expected.bodyIncludes))
  );
}

function describeExpected(expected) {
  const detail =
    expected.location ??
    expected.bodyField ??
    (expected.bodyEquals ? JSON.stringify(expected.bodyEquals) : undefined) ??
    expected.bodyIncludes ??
    "";
  return `${expected.status} ${detail}`;
}

// After a failed step the project created earlier would stay behind; remove it while the session still exists.
async function cleanupProject() {
  if (!projectId || projectDeleted) return;
  try {
    await request(`/api/projects/${projectId}`, { method: "DELETE" });
    projectDeleted = true;
    console.log("      cleaned up the smoke project");
  } catch {
    console.log("      could not clean up the smoke project");
  }
}

let failed = 0;
for (const [name, run, expected] of steps) {
  let actual;
  try {
    actual = await run();
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}  -> threw ${error instanceof Error ? error.message : String(error)}`);
    await cleanupProject();
    continue;
  }
  const ok = matches(expected, actual);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${describeExpected(expected)}`);
    await cleanupProject();
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
