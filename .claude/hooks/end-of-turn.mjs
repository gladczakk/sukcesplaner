// Stop: sweep everything this turn changed before the agent finishes, one retry.
// ESLint on every changed/new file (catches files rewritten through a shell command), then the
// whole-project typecheck (astro check) and the app tests (vitest run, ~2 s). E2E stays in CI.
// Exit 2 + stderr sends the agent back once; stop_hook_active (Cursor: loop_count) lets it finish.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CODE_CHANGE, LINT_EXT, checkoutOf, git, readPayload, registryFile, runBin } from "./lib.mjs";

const payload = readPayload();
if (payload.stop_hook_active === true || Number(payload.loop_count) > 0) process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd !== "" ? payload.cwd : process.cwd();
const registry = registryFile(payload.session_id);

const roots = new Set();
const own = checkoutOf(cwd);
if (own) roots.add(own);
if (registry && existsSync(registry)) {
  for (const line of readFileSync(registry, "utf8").split("\n")) {
    const r = line.trim();
    if (r && existsSync(r)) roots.add(path.resolve(r));
  }
}
if (roots.size === 0) {
  // Not silent: the user sees why nothing was checked.
  process.stdout.write(
    `${JSON.stringify({ systemMessage: `end-of-turn.mjs: no git checkout at ${cwd}, nothing checked.` })}\n`,
  );
  process.exit(0);
}

const deadline = Date.now() + 105_000; // the hook timeout in settings.json is 120 s
const left = () => deadline - Date.now();

let report = "";
for (const root of roots) {
  const changed = [
    ...new Set([
      ...git(root, ["diff", "--name-only", "-z", "HEAD"]).split("\0"),
      ...git(root, ["ls-files", "-z", "-o", "--exclude-standard"]).split("\0"),
    ]),
  ].filter(Boolean);
  if (changed.length === 0) continue; // a Q&A turn: nothing to check here

  const lintable = changed.filter((f) => LINT_EXT.test(f) && existsSync(path.join(root, f)));
  if (lintable.length > 0) {
    const r = runBin(root, "eslint", ["--quiet", "--no-warn-ignored", ...lintable], Math.min(40_000, left()));
    if (!r.ok) report += `\nESLint errors in changed files (${root}):\n${r.output}\n`;
  }
  if (changed.some((f) => CODE_CHANGE.test(f))) {
    const t = runBin(root, "astro", ["check"], Math.min(50_000, left()));
    if (!t.ok) report += `\nTypecheck (astro check) fails (${root}):\n${t.output}\n`;
    const u = runBin(root, "vitest", ["run"], Math.min(20_000, left()));
    if (!u.ok) report += `\nApp tests (vitest run) fail (${root}):\n${u.output}\n`;
  }
}

if (report) {
  process.stderr.write(`Fix these before you finish:${report}`);
  process.exit(2);
}
// Green: the registered checkouts are clean, start the next turn with an empty registry.
if (registry) {
  try {
    writeFileSync(registry, "");
  } catch {
    /* nothing to clear */
  }
}
process.exit(0);
