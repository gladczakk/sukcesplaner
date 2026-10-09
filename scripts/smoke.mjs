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
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    body = await response.json();
  }
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

// Project API steps share the id of the project created in the "create succeeds" step.
let projectId = "";
const otherProjectId = "00000000-0000-4000-8000-000000000000";
const validProject = { name: "Smoke project", description: "", life_area: "dom", due_date: "2099-12-31" };

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "project API rejects anonymous user",
    () => request("/api/projects", { method: "POST", json: validProject }),
    { status: 401 },
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
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  [
    "project create rejects empty name",
    () => request("/api/projects", { method: "POST", json: { ...validProject, name: "" } }),
    { status: 422, bodyField: "fieldErrors.name" },
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
  [
    "project update succeeds",
    () => request(`/api/projects/${projectId}`, { method: "PUT", json: { ...validProject, name: "Smoke project 2" } }),
    { status: 200, bodyField: "project.id" },
  ],
  [
    "project update of unknown id returns 404",
    () => request(`/api/projects/${otherProjectId}`, { method: "PUT", json: validProject }),
    { status: 404 },
  ],
  ["project delete succeeds", () => request(`/api/projects/${projectId}`, { method: "DELETE" }), { status: 204 }],
  [
    "project repeated delete returns 404",
    () => request(`/api/projects/${projectId}`, { method: "DELETE" }),
    { status: 404 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.bodyField === undefined ||
      expected.bodyField.split(".").reduce((value, key) => value?.[key], actual.body) !== undefined);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? expected.bodyField ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
