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
// Milestone API steps share ids and the first completed_at across steps.
let milestoneA = "";
let milestoneB = "";
let completedAt = "";
let taskId = "";
let recurringTaskId = "";
let termTaskId = "";
let weekdaysTaskId = "";
let weekdaysTodayId = "";
let weekdaysOtherId = "";
let pastMilestoneId = "";
const recurringDueDateError = "Zadanie powtarzalne nie ma własnego terminu";
const recurrenceDaysError = "Podaj liczbę dni od 2 do 30";
const recurrenceStartError = "Termin milestona jest wcześniejszy niż dziś — powtarzanie nie miałoby kiedy się zacząć";
const weekdaysEmptyError = "Wybierz co najmniej jeden dzień tygodnia";
const weekdaysInvalidError = "Podaj dni tygodnia jako liczby od 1 do 7, bez powtórzeń";
const oneRhythmError = "Wybierz jeden rytm: co X dni albo dni tygodnia";
const recurringStateError =
  "Zadanie powtarzalne nie ma własnego terminu i nie można go oznaczyć jako zrobione ani przenieść. Odhacz jego wystąpienie na liście Dziś.";
const warsawParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Today's date in Warsaw as YYYY-MM-DD, like `todayInWarsaw` in src/lib/today.ts.
function warsawToday() {
  const parts = warsawParts.formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
// Short day labels indexed by ISO weekday - 1 (Monday first), like `WEEKDAYS` in src/lib/weekdays.ts.
const weekdayShorts = ["pn", "wt", "śr", "cz", "pt", "so", "nd"];

// ISO weekday (1 = Monday .. 7 = Sunday) of today's Warsaw date.
function warsawIsoWeekday() {
  const day = new Date(`${warsawToday()}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// Rhythm label of a weekday set: the chosen days in Monday-first order, like `formatRecurrence`.
function weekdaysLabel(days) {
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => weekdayShorts[day - 1])
    .join(", ");
}

// Weekday routines for the /today steps: one that includes today (and a day that is never today), one that never does.
// Both sets are derived from today's weekday, so the steps pass on every day of the week.
const todayWeekday = warsawIsoWeekday();
const todayRoutineDays = [todayWeekday, ((todayWeekday + 2) % 7) + 1];
const otherRoutineDays = [(todayWeekday % 7) + 1, ((todayWeekday + 1) % 7) + 1];
const todayRoutineTitle = "Dni dziś smoke";
const otherRoutineTitle = "Dni poza smoke";
const todayRoutineLabel = weekdaysLabel(todayRoutineDays);
const moveRoutineTitle = "Przeniesienie dziś smoke";
let moveRoutineId = "";
let moveDailyId = "";
let movePlainId = "";
const closedMilestoneTaskError =
  "Nie można dodać niezrobionego zadania do zamkniętego milestona. Otwórz milestone ponownie.";
const taskDateError = "Termin zadania nie może być późniejszy niż data milestona";
const milestoneBeforeTaskError = "Nie można ustawić tej daty: późniejszy termin ma 1 zadanie";
const milestoneDateError = "Data milestona nie może być późniejsza niż termin projektu";

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  // Astro swallows SSR errors of React islands (page stays 200, island missing), so assert the island's form is there.
  ["signin page renders", () => request("/auth/signin"), { status: 200, bodyIncludes: 'action="/api/auth/signin"' }],
  ["signup page renders", () => request("/auth/signup"), { status: 200, bodyIncludes: 'action="/api/auth/signup"' }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["projects page redirects anonymous user", () => request("/projects"), { status: 302, location: "/auth/signin" }],
  ["today page redirects anonymous user", () => request("/today"), { status: 302, location: "/auth/signin" }],
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
    { status: 302, location: "/today" },
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
    "today page renders empty state",
    () => request("/today"),
    {
      status: 200,
      // The second text is rendered only by the add-task island in its disabled state.
      bodyIncludes: ["Na dziś nic do zrobienia.", "Najpierw dodaj projekt z otwartym milestonem"],
      bodyExcludes: "pozycj",
    },
  ],
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
  [
    "milestone create rejects empty name",
    () =>
      request(`/api/projects/${projectId}/milestones`, { method: "POST", json: { name: "", due_date: "2099-12-31" } }),
    { status: 422, bodyField: "fieldErrors.name" },
  ],
  [
    "milestone create rejects date after project due date",
    () =>
      request(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        json: { name: "Alfa smoke", due_date: "2100-01-01" },
      }),
    { status: 422, bodyEquals: { "fieldErrors.due_date": milestoneDateError } },
  ],
  [
    "milestone create succeeds",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        json: { name: "Alfa smoke", due_date: "2099-12-31" },
      });
      milestoneA = result.body?.milestone?.id ?? "";
      return result;
    },
    { status: 201, bodyField: "milestone.id" },
  ],
  [
    "milestone create on the same day succeeds",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        json: { name: "Beta smoke", due_date: "2099-12-31" },
      });
      milestoneB = result.body?.milestone?.id ?? "";
      return result;
    },
    { status: 201, bodyField: "milestone.id" },
  ],
  // Island SSR errors leave the page at 200, so assert text rendered by the milestone islands and the row order.
  [
    "project page renders milestone list",
    () => request(`/projects/${projectId}`),
    {
      status: 200,
      bodyIncludes: ["Dodaj milestone", "Zamknij milestone"],
      bodyOrder: ["Alfa smoke", "Beta smoke"],
    },
  ],
  [
    "milestone rename succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, {
        method: "PUT",
        json: { name: "Gamma smoke", due_date: "2099-12-31" },
      }),
    { status: 200, bodyEquals: { "milestone.name": "Gamma smoke" } },
  ],
  [
    "milestone update rejects date after project due date",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, {
        method: "PUT",
        json: { name: "Gamma smoke", due_date: "2100-01-01" },
      }),
    { status: 422, bodyEquals: { "fieldErrors.due_date": milestoneDateError } },
  ],
  [
    "milestone close succeeds",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones/${milestoneA}`, {
        method: "PATCH",
        json: { completed: true },
      });
      completedAt = result.body?.milestone?.completed_at ?? "";
      return result;
    },
    { status: 200, bodyField: "milestone.completed_at" },
  ],
  [
    "milestone repeated close keeps completed_at",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones/${milestoneA}`, {
        method: "PATCH",
        json: { completed: true },
      });
      const sameCompletedAt = completedAt !== "" && result.body?.milestone?.completed_at === completedAt;
      return { ...result, body: { ...result.body, sameCompletedAt } };
    },
    { status: 200, bodyEquals: { sameCompletedAt: true } },
  ],
  [
    "project page renders closed milestone",
    () => request(`/projects/${projectId}`),
    { status: 200, bodyIncludes: ["Otwórz ponownie", "zamknięty"] },
  ],
  [
    "milestone reopen succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, { method: "PATCH", json: { completed: false } }),
    { status: 200, bodyEquals: { "milestone.completed_at": null } },
  ],
  [
    "milestone repeated reopen succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, { method: "PATCH", json: { completed: false } }),
    { status: 200, bodyEquals: { "milestone.completed_at": null } },
  ],
  [
    "project page renders reopened milestone",
    () => request(`/projects/${projectId}`),
    // The renamed milestone's own action sits between its name and Beta's name only when it is open again.
    { status: 200, bodyOrder: ["Gamma smoke", "Zamknij milestone Gamma smoke", "Beta smoke"] },
  ],
  [
    "task create rejects empty title",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "", due_date: null },
      }),
    { status: 422, bodyEquals: { "fieldErrors.title": "Podaj tytuł zadania" } },
  ],
  [
    "task create rejects date after milestone date",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Zadanie smoke", due_date: "2100-01-01" },
      }),
    { status: 422, bodyEquals: { "fieldErrors.due_date": taskDateError } },
  ],
  [
    "task create succeeds",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Zadanie smoke", due_date: "2099-12-30" },
      });
      taskId = result.body?.task?.id ?? "";
      return result;
    },
    { status: 201, bodyField: "task.id", bodyEquals: { "task.status": "todo", "task.due_date": "2099-12-30" } },
  ],
  // Island SSR errors leave the page at 200, so assert the task island's button and the task row order.
  [
    "project page renders task list",
    () => request(`/projects/${projectId}`),
    {
      status: 200,
      bodyIncludes: ["Dodaj zadanie", "Zadanie smoke"],
      bodyOrder: ["Gamma smoke", "Zadanie smoke"],
    },
  ],
  // Equal milestone dates: the nearest one is decided by seq, so Gamma (created first) wins and Beta stays out.
  [
    "today page lists the open task of the nearest milestone",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: [
        "Zadanie smoke",
        "Gamma smoke",
        "1 pozycja",
        "Zrobione: Zadanie smoke",
        "Na jutro: Zadanie smoke",
        "Dodaj zadanie",
      ],
      // Row-only texts: the project and milestone names also sit in the add-task island props, ahead of the list.
      bodyOrder: ["Zadanie smoke", "Zrobione: Zadanie smoke"],
      // Without the empty-state text the add-task island got targets, so getTaskTargets returned the project.
      // The add-task island serializes every milestone name into its props, so a bare "Beta smoke" is always in the HTML;
      // a Beta list row would carry its close button instead.
      bodyExcludes: [
        "Zamknij milestone Beta smoke",
        "milestone do zamknięcia",
        "Najpierw dodaj projekt z otwartym milestonem",
      ],
    },
  ],
  [
    "task defer to tomorrow succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { deferred: "tomorrow" },
      }),
    { status: 200, bodyField: "task.deferred_until" },
  ],
  [
    "task status change clears the deferral",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { status: "partial" },
      }),
    { status: 200, bodyEquals: { "task.status": "partial", "task.deferred_until": null } },
  ],
  [
    "task defer to tomorrow again succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { deferred: "tomorrow" },
      }),
    { status: 200, bodyField: "task.deferred_until" },
  ],
  [
    "today page lists the deferred task with a restore action",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: ["Na dziś nic do zrobienia.", "Przeniesione na później: 1", "Przywróć na dziś: Zadanie smoke"],
      bodyExcludes: ["Zrobione: Zadanie smoke"],
    },
  ],
  [
    "task deferral clear succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { deferred: null },
      }),
    { status: 200, bodyEquals: { "task.deferred_until": null } },
  ],
  [
    "today page shows the task actions of a partial task",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: [
        "Zrobione: Zadanie smoke",
        "Częściowo: Zadanie smoke",
        "Na jutro: Zadanie smoke",
        "· częściowo",
        'aria-pressed="true"',
      ],
      bodyExcludes: ["Przeniesione na później"],
    },
  ],
  [
    "task defer with an unknown value is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { deferred: "yesterday" },
      }),
    { status: 422, bodyEquals: { error: 'Podaj przeniesienie: "tomorrow" albo null' } },
  ],
  [
    "task status together with deferral is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { status: "todo", deferred: "tomorrow" },
      }),
    { status: 422, bodyEquals: { error: "Podaj albo status, albo przeniesienie." } },
  ],
  [
    "milestone close rejected while it has an open task",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, { method: "PATCH", json: { completed: true } }),
    { status: 422, bodyEquals: { error: "Nie można zamknąć milestona: ma niezrobione zadania (1)" } },
  ],
  [
    "task status done succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { status: "done" },
      }),
    { status: 200, bodyEquals: { "task.status": "done" } },
  ],
  [
    "task defer of a done task is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { deferred: "tomorrow" },
      }),
    { status: 422, bodyEquals: { error: "Zrobionego zadania nie można przenieść na jutro." } },
  ],
  [
    "today page shows the milestone ready to close",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: [
        "Gamma smoke",
        "1 pozycja · 1 milestone do zamknięcia",
        "Wszystkie zadania zrobione",
        "Zamknij milestone Gamma smoke",
      ],
      bodyExcludes: ["Zadanie smoke"],
    },
  ],
  [
    "milestone close succeeds once its tasks are done",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, { method: "PATCH", json: { completed: true } }),
    { status: 200, bodyField: "milestone.completed_at" },
  ],
  [
    "today page moves on to the next milestone",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: [
        "Beta smoke",
        "1 pozycja · 1 milestone do zamknięcia",
        "Wszystkie zadania zrobione",
        "Zamknij milestone Beta smoke",
      ],
      bodyExcludes: ["Gamma smoke"],
    },
  ],
  [
    "project page renders closed milestone task list",
    () => request(`/projects/${projectId}`),
    { status: 200, bodyIncludes: ["Otwórz milestone, aby dodać zadanie.", "Edytuj zadanie Zadanie smoke"] },
  ],
  [
    "task create in closed milestone is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Zadanie smoke 3", due_date: null },
      }),
    { status: 422, bodyEquals: { error: closedMilestoneTaskError } },
  ],
  [
    "task reverted to todo in closed milestone is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PATCH",
        json: { status: "todo" },
      }),
    { status: 422, bodyEquals: { error: closedMilestoneTaskError } },
  ],
  [
    "milestone date before a task due date is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, {
        method: "PUT",
        json: { name: "Gamma smoke", due_date: "2099-12-29" },
      }),
    { status: 422, bodyEquals: { "fieldErrors.due_date": milestoneBeforeTaskError } },
  ],
  [
    "done task in closed milestone can be edited",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PUT",
        json: { title: "Zadanie smoke 2", due_date: null },
      }),
    { status: 200, bodyEquals: { "task.title": "Zadanie smoke 2", "task.due_date": null } },
  ],
  [
    "milestone reopen after task steps succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, { method: "PATCH", json: { completed: false } }),
    { status: 200, bodyEquals: { "milestone.completed_at": null } },
  ],
  [
    "task update rejects date after milestone date",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, {
        method: "PUT",
        json: { title: "Zadanie smoke 2", due_date: "2100-01-01" },
      }),
    { status: 422, bodyEquals: { "fieldErrors.due_date": taskDateError } },
  ],
  [
    "task create rejects a title of only spaces",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "   ", due_date: null },
      }),
    { status: 422, bodyEquals: { "fieldErrors.title": "Podaj tytuł zadania" } },
  ],
  [
    "task under another milestone of the same project returns 404",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneB}/tasks/${taskId}`, {
        method: "PATCH",
        json: { status: "done" },
      }),
    { status: 404 },
  ],
  [
    "task status of unknown id returns 404",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${otherProjectId}`, {
        method: "PATCH",
        json: { status: "done" },
      }),
    { status: 404 },
  ],
  [
    "task delete succeeds",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "task repeated delete returns 404",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${taskId}`, { method: "DELETE" }),
    { status: 404 },
  ],
  // Recurring tasks (rhythm): the start date is today's Warsaw date, set by the server.
  [
    "recurring task create succeeds",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Rutyna smoke", due_date: null, recurrence_interval_days: 3 },
      });
      recurringTaskId = result.body?.task?.id ?? "";
      return result;
    },
    {
      status: 201,
      bodyEquals: {
        "task.title": "Rutyna smoke",
        "task.recurrence_interval_days": 3,
        "task.recurrence_start_date": warsawToday(),
        "task.due_date": null,
        "task.status": "todo",
      },
    },
  ],
  [
    "recurring task create rejects a due date",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Rutyna smoke 2", due_date: "2099-12-30", recurrence_interval_days: 2 },
      }),
    { status: 422, bodyEquals: { "fieldErrors.due_date": recurringDueDateError } },
  ],
  [
    "recurring task create rejects a rhythm over 30 days",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Rutyna smoke 2", due_date: null, recurrence_interval_days: 31 },
      }),
    { status: 422, bodyEquals: { "fieldErrors.recurrence_interval_days": recurrenceDaysError } },
  ],
  // The past-dated milestone would become the nearest one of the project, so it is deleted right after the check.
  [
    "milestone dated in the past is created",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        json: { name: "Przeszły smoke", due_date: "2000-01-01" },
      });
      pastMilestoneId = result.body?.milestone?.id ?? "";
      return result;
    },
    { status: 201, bodyField: "milestone.id" },
  ],
  [
    "recurring task create in a past-dated milestone is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${pastMilestoneId}/tasks`, {
        method: "POST",
        json: { title: "Rutyna smoke przeszła", due_date: null, recurrence_interval_days: 2 },
      }),
    { status: 422, bodyEquals: { "fieldErrors.recurrence_interval_days": recurrenceStartError } },
  ],
  [
    "milestone dated in the past is deleted",
    () => request(`/api/projects/${projectId}/milestones/${pastMilestoneId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "recurring task status done is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${recurringTaskId}`, {
        method: "PATCH",
        json: { status: "done" },
      }),
    { status: 422, bodyEquals: { error: recurringStateError } },
  ],
  [
    "recurring task update with only a title keeps the rhythm",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${recurringTaskId}`, {
        method: "PUT",
        json: { title: "Rutyna smoke 3" },
      }),
    {
      status: 200,
      bodyEquals: {
        "task.title": "Rutyna smoke 3",
        "task.recurrence_interval_days": 3,
        "task.recurrence_start_date": warsawToday(),
      },
    },
  ],
  // Weekday rhythm (Wednesday + Friday): the whole block, including its cleanup, sits before any /today step, so the
  // weekday of the day the smoke runs cannot change the counts asserted there.
  [
    "weekdays task create succeeds",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Dni smoke", due_date: null, recurrence_weekdays: [3, 5] },
      });
      weekdaysTaskId = result.body?.task?.id ?? "";
      return result;
    },
    {
      status: 201,
      bodyEquals: {
        "task.title": "Dni smoke",
        "task.recurrence_weekdays.0": 3,
        "task.recurrence_weekdays.1": 5,
        "task.recurrence_interval_days": null,
        "task.recurrence_start_date": warsawToday(),
        "task.is_recurring": true,
        "task.due_date": null,
        "task.status": "todo",
      },
    },
  ],
  [
    "weekdays task create rejects weekdays together with an interval",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Dni smoke 2", due_date: null, recurrence_interval_days: 2, recurrence_weekdays: [3, 5] },
      }),
    { status: 422, bodyEquals: { "fieldErrors.recurrence_weekdays": oneRhythmError } },
  ],
  [
    "weekdays task create rejects an empty list",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Dni smoke 2", due_date: null, recurrence_weekdays: [] },
      }),
    { status: 422, bodyEquals: { "fieldErrors.recurrence_weekdays": weekdaysEmptyError } },
  ],
  [
    "weekdays task create rejects a day over 7",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Dni smoke 2", due_date: null, recurrence_weekdays: [8] },
      }),
    { status: 422, bodyEquals: { "fieldErrors.recurrence_weekdays": weekdaysInvalidError } },
  ],
  [
    "weekdays task create rejects a duplicated day",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Dni smoke 2", due_date: null, recurrence_weekdays: [3, 3] },
      }),
    { status: 422, bodyEquals: { "fieldErrors.recurrence_weekdays": weekdaysInvalidError } },
  ],
  [
    "weekdays task create rejects a due date",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Dni smoke 2", due_date: "2099-12-30", recurrence_weekdays: [3, 5] },
      }),
    { status: 422, bodyEquals: { "fieldErrors.due_date": recurringDueDateError } },
  ],
  [
    "weekdays task status done is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${weekdaysTaskId}`, {
        method: "PATCH",
        json: { status: "done" },
      }),
    { status: 422, bodyEquals: { error: recurringStateError } },
  ],
  [
    "weekdays task update with only a title keeps the weekdays",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${weekdaysTaskId}`, {
        method: "PUT",
        json: { title: "Dni smoke 2" },
      }),
    {
      status: 200,
      bodyEquals: {
        "task.title": "Dni smoke 2",
        "task.recurrence_weekdays.0": 3,
        "task.recurrence_weekdays.1": 5,
        "task.recurrence_start_date": warsawToday(),
      },
    },
  ],
  // The label is server-rendered, the edit button comes from the island, and a recurring task has no status select.
  [
    "project page renders the weekdays task label without a status select",
    () => request(`/projects/${projectId}`),
    {
      status: 200,
      bodyIncludes: ["Dni smoke 2", "śr, pt", "Edytuj zadanie Dni smoke 2"],
      bodyExcludes: ["Status zadania Dni smoke 2"],
    },
  ],
  [
    "weekdays task delete succeeds",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${weekdaysTaskId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  // Island SSR errors leave the page at 200: the rhythm label is server-rendered, the edit button comes from the island,
  // and a recurring task must not render the status select.
  [
    "project page renders the recurring task without a status select",
    () => request(`/projects/${projectId}`),
    {
      status: 200,
      bodyIncludes: ["Rutyna smoke 3", "co 3 dni", "Edytuj zadanie Rutyna smoke 3"],
      bodyExcludes: ["Status zadania Rutyna smoke 3"],
    },
  ],
  // The routine is a list row (no island): its title and rhythm are visible row text. It sits above a task with an own date.
  [
    "task with a due date is created next to the routine",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Zadanie smoke term", due_date: "2099-12-30" },
      });
      termTaskId = result.body?.task?.id ?? "";
      return result;
    },
    { status: 201, bodyField: "task.id" },
  ],
  [
    "today page lists the routine above the dated task",
    () => request("/today"),
    {
      status: 200,
      // The routine title occurs only in its row; the task title also occurs later in its island props, so a reversed order fails.
      bodyIncludes: ["Rutyna smoke 3", "co 3 dni", "2 pozycje", "Zadanie smoke term"],
      bodyOrder: ["Rutyna smoke 3", "Zadanie smoke term"],
      bodyExcludes: ["milestone do zamknięcia"],
    },
  ],
  [
    "dated task next to the routine is deleted",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${termTaskId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "today page shows a milestone with only a routine as ready to close",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: [
        "Rutyna smoke 3",
        "co 3 dni",
        "2 pozycje · 1 milestone do zamknięcia",
        "Wszystkie zadania zrobione",
        "Zamknij milestone Gamma smoke",
      ],
      bodyOrder: ["Rutyna smoke 3", "Wszystkie zadania zrobione"],
    },
  ],
  [
    "milestone with only a routine closes",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, { method: "PATCH", json: { completed: true } }),
    { status: 200, bodyField: "milestone.completed_at" },
  ],
  [
    "today page drops the routine of a closed milestone",
    () => request("/today"),
    { status: 200, bodyIncludes: ["Beta smoke", "1 pozycja"], bodyExcludes: ["Rutyna smoke 3"] },
  ],
  [
    "milestone with a routine reopens",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}`, { method: "PATCH", json: { completed: false } }),
    { status: 200, bodyEquals: { "milestone.completed_at": null } },
  ],
  [
    "today page brings the routine back after reopening",
    () => request("/today"),
    { status: 200, bodyIncludes: ["Rutyna smoke 3", "co 3 dni"] },
  ],
  // Occurrence done: only the routine row is a task island here (Beta/Gamma rows carry the close button), so the
  // routine's island must render just "Zrobione" and none of the plain-task actions.
  [
    "today page renders the routine island with only the done action",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: ['aria-label="Zrobione: Rutyna smoke 3"', "co 3 dni"],
      bodyExcludes: ['aria-label="Częściowo:', 'aria-label="Na jutro:'],
    },
  ],
  [
    "routine occurrence of an unknown task returns 404",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${otherProjectId}/occurrences`, {
        method: "POST",
      }),
    { status: 404 },
  ],
  [
    "routine occurrence is marked done",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${recurringTaskId}/occurrences`, {
        method: "POST",
      }),
    { status: 201, bodyEquals: { "task.title": "Rutyna smoke 3" } },
  ],
  [
    "routine occurrence marked twice still succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${recurringTaskId}/occurrences`, {
        method: "POST",
      }),
    { status: 201, bodyEquals: { "task.title": "Rutyna smoke 3" } },
  ],
  // The title also sits in the island props, so its absence proves the row is gone; the milestone is now ready to close.
  [
    "today page drops the routine once its occurrence is done",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: ["1 pozycja · 1 milestone do zamknięcia", "Zamknij milestone Gamma smoke"],
      bodyExcludes: ["Rutyna smoke 3", 'aria-label="Zrobione: Rutyna smoke 3"'],
    },
  ],
  [
    "plain task next to the finished routine is created",
    async () => {
      const result = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Zadanie smoke plain", due_date: "2099-12-30" },
      });
      termTaskId = result.body?.task?.id ?? "";
      return result;
    },
    { status: 201, bodyField: "task.id" },
  ],
  [
    "today page keeps three actions on the plain task",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: [
        'aria-label="Zrobione: Zadanie smoke plain"',
        'aria-label="Częściowo: Zadanie smoke plain"',
        'aria-label="Na jutro: Zadanie smoke plain"',
      ],
      bodyExcludes: ["Rutyna smoke 3"],
    },
  ],
  [
    "plain task next to the finished routine is deleted",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${termTaskId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  // Move to tomorrow: the milestone is due in 2099, so tomorrow always fits. The routines are created and deleted here,
  // with no row-count assertions. A weekday routine of today moves (tomorrow is not one of its days: the days are
  // today and three days on); a routine of all seven days has a rhythm day tomorrow, so the database refuses.
  [
    "move routines are created",
    async () => {
      const moving = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: moveRoutineTitle, due_date: null, recurrence_weekdays: todayRoutineDays },
      });
      moveRoutineId = moving.body?.task?.id ?? "";
      const daily = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Codzienna smoke przeniesienie", due_date: null, recurrence_weekdays: [1, 2, 3, 4, 5, 6, 7] },
      });
      moveDailyId = daily.body?.task?.id ?? "";
      const plain = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: "Zwykłe smoke przeniesienie", due_date: null },
      });
      movePlainId = plain.body?.task?.id ?? "";
      return {
        ...moving,
        status: moving.status === 201 && daily.status === 201 && plain.status === 201 ? 201 : 0,
      };
    },
    { status: 201 },
  ],
  [
    "routine occurrence of today is moved to tomorrow",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${moveRoutineId}/occurrences/move`, {
        method: "POST",
      }),
    { status: 201, bodyEquals: { "task.title": moveRoutineTitle } },
  ],
  [
    "routine occurrence moved twice still succeeds",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${moveRoutineId}/occurrences/move`, {
        method: "POST",
      }),
    { status: 201, bodyEquals: { "task.title": moveRoutineTitle } },
  ],
  // The title also sits in the island props, so its absence proves the row is gone.
  [
    "today page drops the routine once its occurrence is moved",
    () => request("/today"),
    { status: 200, bodyExcludes: [moveRoutineTitle] },
  ],
  [
    "daily routine occurrence cannot be moved to tomorrow",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${moveDailyId}/occurrences/move`, {
        method: "POST",
      }),
    { status: 422, bodyField: "error" },
  ],
  [
    "routine occurrence move of an unknown task returns 404",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${otherProjectId}/occurrences/move`, {
        method: "POST",
      }),
    { status: 404 },
  ],
  [
    "occurrence move of a non-recurring task is rejected",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${movePlainId}/occurrences/move`, {
        method: "POST",
      }),
    { status: 422, bodyField: "error" },
  ],
  [
    "move routines are deleted",
    async () => {
      const moving = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${moveRoutineId}`, {
        method: "DELETE",
      });
      const daily = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${moveDailyId}`, {
        method: "DELETE",
      });
      const plain = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${movePlainId}`, {
        method: "DELETE",
      });
      return { ...moving, status: moving.status === 204 && daily.status === 204 && plain.status === 204 ? 204 : 0 };
    },
    { status: 204 },
  ],
  [
    "weekday routines are created for today and for other days",
    async () => {
      const today = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: todayRoutineTitle, due_date: null, recurrence_weekdays: todayRoutineDays },
      });
      weekdaysTodayId = today.body?.task?.id ?? "";
      const other = await request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks`, {
        method: "POST",
        json: { title: otherRoutineTitle, due_date: null, recurrence_weekdays: otherRoutineDays },
      });
      weekdaysOtherId = other.body?.task?.id ?? "";
      return { ...today, status: today.status === 201 && other.status === 201 ? 201 : 0 };
    },
    { status: 201 },
  ],
  // The routine title sits in its row ahead of the label and the island, and again in the island props, so the order
  // proves the row and the aria-label proves the island rendered; the other routine's title must not occur at all.
  [
    "today page lists the weekday routine of today and hides the other one",
    () => request("/today"),
    {
      status: 200,
      bodyIncludes: [todayRoutineTitle, todayRoutineLabel, `aria-label="Zrobione: ${todayRoutineTitle}"`],
      bodyOrder: [todayRoutineTitle, todayRoutineLabel, `aria-label="Zrobione: ${todayRoutineTitle}"`],
      bodyExcludes: [otherRoutineTitle],
    },
  ],
  [
    "weekday routine occurrence is marked done",
    () =>
      request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${weekdaysTodayId}/occurrences`, {
        method: "POST",
      }),
    { status: 201, bodyEquals: { "task.title": todayRoutineTitle } },
  ],
  [
    "today page drops the weekday routine once its occurrence is done",
    () => request("/today"),
    { status: 200, bodyExcludes: [todayRoutineTitle, otherRoutineTitle] },
  ],
  [
    "weekday routine of today is deleted",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${weekdaysTodayId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "weekday routine of other days is deleted",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${weekdaysOtherId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "recurring task delete succeeds",
    () => request(`/api/projects/${projectId}/milestones/${milestoneA}/tasks/${recurringTaskId}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "milestone create in unknown project returns 404",
    () =>
      request(`/api/projects/${otherProjectId}/milestones`, {
        method: "POST",
        json: { name: "Delta smoke", due_date: "2099-12-31" },
      }),
    { status: 404 },
  ],
  [
    "milestone update of unknown id returns 404",
    () =>
      request(`/api/projects/${projectId}/milestones/${otherProjectId}`, {
        method: "PUT",
        json: { name: "Delta smoke", due_date: "2099-12-31" },
      }),
    { status: 404 },
  ],
  [
    "milestone delete succeeds",
    () => request(`/api/projects/${projectId}/milestones/${milestoneB}`, { method: "DELETE" }),
    { status: 204 },
  ],
  [
    "milestone repeated delete returns 404",
    () => request(`/api/projects/${projectId}/milestones/${milestoneB}`, { method: "DELETE" }),
    { status: 404 },
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
    (expected.bodyIncludes === undefined ||
      [expected.bodyIncludes].flat().every((part) => actual.text.includes(part))) &&
    (expected.bodyOrder === undefined || includesInOrder(actual.text, expected.bodyOrder)) &&
    (expected.bodyExcludes === undefined || [expected.bodyExcludes].flat().every((part) => !actual.text.includes(part)))
  );
}

// Every fragment must occur in the text, each after the previous one.
function includesInOrder(text, parts) {
  let from = 0;
  for (const part of parts) {
    const index = text.indexOf(part, from);
    if (index === -1) return false;
    from = index + part.length;
  }
  return true;
}

function describeExpected(expected) {
  const detail =
    expected.location ??
    expected.bodyField ??
    (expected.bodyEquals ? JSON.stringify(expected.bodyEquals) : undefined) ??
    (expected.bodyIncludes ? [expected.bodyIncludes].flat().join(" + ") : undefined) ??
    (expected.bodyOrder ? expected.bodyOrder.join(" < ") : undefined) ??
    "";
  const excludes = expected.bodyExcludes ? ` (without ${[expected.bodyExcludes].flat().join(" + ")})` : "";
  return `${expected.status} ${detail}${excludes}`;
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
