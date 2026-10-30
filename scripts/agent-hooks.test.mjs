// Proof for the Claude Code agent hooks in .claude/hooks (node:test, no dependencies).
// Each case feeds a PostToolUse / Stop payload to the real hook script, inside a throwaway git repo
// whose eslint / astro / vitest are marker stubs (broken marker in a file => the stub fails).
// The developer's tree is never touched. Run: npm run test:unit
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const HOOKS_DIR = path.join(import.meta.dirname, "..", ".claude", "hooks");
const SETTINGS = path.join(import.meta.dirname, "..", ".claude", "settings.json");
const LINT_HOOK = path.join(HOOKS_DIR, "lint-edited-file.mjs");
const STOP_HOOK = path.join(HOOKS_DIR, "end-of-turn.mjs");

const scratch = realpathSync.native(mkdtempSync(path.join(tmpdir(), "agent-hooks-")));
let counter = 0;
const uniq = () => `${process.pid}-${++counter}`;

after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

// Marker stubs: the real tools are slow and need the whole app; the hooks only care about exit code + output.
const STUBS = {
  eslint: `
const fs = require("node:fs");
const args = process.argv.slice(2);
if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, "eslint " + args.join(" ") + "\\n");
let bad = 0;
for (const f of args.filter((a) => !a.startsWith("--"))) {
  if (fs.readFileSync(f, "utf8").includes("LINT_BROKEN")) { console.log(f + "\\n  1:1  error  stub-rule"); bad = 1; }
}
process.exit(bad);
`,
  astro: markerWalker("astro", "TYPE_BROKEN", "error ts(2322): stub type error"),
  vitest: markerWalker("vitest", "TEST_BROKEN", "FAIL stub test"),
};

function markerWalker(tool, marker, message) {
  return `
const fs = require("node:fs");
if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, "${tool} " + process.argv.slice(2).join(" ") + "\\n");
const hits = fs.readdirSync("src", { recursive: true }).filter((f) => f.endsWith(".ts") && fs.readFileSync("src/" + f, "utf8").includes("${marker}"));
if (hits.length) { console.log(hits.map((f) => "src/" + f + ": ${message}").join("\\n")); process.exit(1); }
`;
}

function installStubs(dir) {
  for (const [name, code] of Object.entries(STUBS)) {
    const pkgDir = path.join(dir, "node_modules", name);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name, bin: { [name]: "bin.js" } }));
    writeFileSync(path.join(pkgDir, "bin.js"), code);
  }
}

function makeRepo(name) {
  const dir = path.join(scratch, `${name}-${uniq()}`);
  mkdirSync(path.join(dir, "src"), { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "hooks@test.local");
  git(dir, "config", "user.name", "hooks test");
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
  writeFileSync(path.join(dir, "src", "clean.ts"), "export const clean = 1;\n");
  writeFileSync(path.join(dir, "README.md"), "# readme\n");
  installStubs(dir);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

const write = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};

function run(script, payload, { cwd, env = {} } = {}) {
  const tmp = path.join(scratch, "tmp");
  mkdirSync(tmp, { recursive: true });
  const log = path.join(scratch, `stub-${uniq()}.log`);
  const r = spawnSync(process.execPath, [script], {
    cwd: cwd ?? scratch,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp, STUB_LOG: log, ...env, NODE_TEST_CONTEXT: "" },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls };
}

const edit = (cwd, file, extra = {}) => ({
  session_id: `s-${uniq()}`,
  cwd,
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path: file },
  ...extra,
});

describe("PostToolUse hook: lint-edited-file.mjs", () => {
  let repo;
  before(() => {
    repo = makeRepo("main");
  });

  test("broken file: exit 2, stderr names the file and the problem, only that file is linted", () => {
    write(repo, "src/broken.ts", "// LINT_BROKEN\n");
    const r = run(LINT_HOOK, edit(repo, path.join(repo, "src", "broken.ts")), { cwd: repo });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /src\/broken\.ts/);
    assert.match(r.stderr, /stub-rule/);
    assert.equal(r.stdout, "");
    assert.deepEqual(r.calls, ["eslint --quiet --no-warn-ignored -- src/broken.ts"]);
  });

  test("clean file: exit 0 and silent", () => {
    const r = run(LINT_HOOK, edit(repo, path.join(repo, "src", "clean.ts")), { cwd: repo });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
    assert.equal(r.stdout, "");
    assert.equal(r.calls.length, 1);
  });

  test("uncovered type (README.md): exit 0 without running the linter", () => {
    const r = run(LINT_HOOK, edit(repo, path.join(repo, "README.md")), { cwd: repo });
    assert.equal(r.status, 0);
    assert.deepEqual(r.calls, []);
  });

  test("nonexistent file: exit 0", () => {
    const r = run(LINT_HOOK, edit(repo, path.join(repo, "src", "nope.ts")), { cwd: repo });
    assert.equal(r.status, 0);
    assert.deepEqual(r.calls, []);
  });

  test("empty, unparsable or path-less payloads: exit 0", () => {
    for (const payload of [
      "{}",
      "not json",
      "",
      "[]",
      JSON.stringify({ cwd: repo, tool_name: "Edit", tool_input: {} }),
      JSON.stringify({ cwd: repo, tool_name: "Edit" }),
      JSON.stringify({ cwd: repo, tool_input: { file_path: 5 } }),
    ]) {
      const r = run(LINT_HOOK, payload, { cwd: repo });
      assert.equal(r.status, 0, `payload ${JSON.stringify(payload)}: ${r.stderr}`);
      assert.deepEqual(r.calls, []);
    }
  });

  test("relative path resolves against the payload cwd", () => {
    write(repo, "src/rel-broken.ts", "// LINT_BROKEN\n");
    const r = run(LINT_HOOK, edit(repo, "src/rel-broken.ts"), { cwd: scratch });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /src\/rel-broken\.ts/);
  });

  test("checkout comes from the edited file, not from CLAUDE_PROJECT_DIR", () => {
    const other = makeRepo("other");
    write(other, "src/broken.ts", "// LINT_BROKEN\n");
    // Session in `repo`, variable names another checkout that holds a broken file: the edit is clean.
    const clean = run(LINT_HOOK, edit(repo, path.join(repo, "src", "clean.ts")), {
      cwd: repo,
      env: { CLAUDE_PROJECT_DIR: other },
    });
    assert.equal(clean.status, 0);
    // A file of a different repository (~/.claude, another project) is skipped even when broken.
    const foreign = run(LINT_HOOK, edit(repo, path.join(other, "src", "broken.ts")), { cwd: repo });
    assert.equal(foreign.status, 0);
    assert.deepEqual(foreign.calls, []);
  });

  test("no silent success: linter not installed -> exit 2", () => {
    const bare = makeRepo("nolint");
    rmSync(path.join(bare, "node_modules", "eslint"), { recursive: true });
    const r = run(LINT_HOOK, edit(bare, path.join(bare, "src", "clean.ts")), { cwd: bare });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /eslint is not installed/);
  });
});

describe("Stop hook: end-of-turn.mjs", () => {
  const stop = (cwd, extra = {}) => ({ session_id: `s-${uniq()}`, cwd, hook_event_name: "Stop", ...extra });

  test("no changes (Q&A turn): exit 0 and no check runs", () => {
    const repo = makeRepo("stop-none");
    const r = run(STOP_HOOK, stop(repo), { cwd: repo });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
    assert.deepEqual(r.calls, []);
  });

  test("only a skipped type changed (README.md): exit 0, nothing runs", () => {
    const repo = makeRepo("stop-md");
    write(repo, "README.md", "# changed\n");
    const r = run(STOP_HOOK, stop(repo), { cwd: repo });
    assert.equal(r.status, 0);
    assert.deepEqual(r.calls, []);
  });

  test("clean change: lint, typecheck and tests run, exit 0", () => {
    const repo = makeRepo("stop-clean");
    write(repo, "src/clean.ts", "export const clean = 2;\n");
    const r = run(STOP_HOOK, stop(repo), { cwd: repo });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      r.calls.map((c) => c.split(" ")[0]),
      ["eslint", "astro", "vitest"],
    );
    assert.match(r.calls[1], /^astro check$/);
  });

  test("edit that bypassed the per-edit hook (written straight to disk): blocks and names the file", () => {
    const repo = makeRepo("stop-bypass");
    write(repo, "src/clean.ts", "// LINT_BROKEN (rewritten through a shell command)\n");
    write(repo, "src/brand-new.ts", "// LINT_BROKEN\n");
    const r = run(STOP_HOOK, stop(repo), { cwd: repo });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Fix these before you finish/);
    assert.match(r.stderr, /src\/clean\.ts/);
    assert.match(r.stderr, /src\/brand-new\.ts/);
    assert.equal(r.stdout, "");
  });

  test("type error blocks with the typechecker output", () => {
    const repo = makeRepo("stop-type");
    write(repo, "src/clean.ts", "// TYPE_BROKEN\n");
    const r = run(STOP_HOOK, stop(repo), { cwd: repo });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Typecheck \(astro check\) fails/);
    assert.match(r.stderr, /src\/clean\.ts/);
  });

  test("failing app test blocks with the test output", () => {
    const repo = makeRepo("stop-test");
    write(repo, "src/clean.ts", "// TEST_BROKEN\n");
    const r = run(STOP_HOOK, stop(repo), { cwd: repo });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /App tests \(vitest run\) fail/);
  });

  test("retry flag set (stop_hook_active / loop_count): exit 0 even though the error remains", () => {
    const repo = makeRepo("stop-loop");
    write(repo, "src/clean.ts", "// LINT_BROKEN\n");
    for (const extra of [{ stop_hook_active: true }, { loop_count: 1 }]) {
      const r = run(STOP_HOOK, stop(repo, extra), { cwd: repo });
      assert.equal(r.status, 0);
      assert.deepEqual(r.calls, []);
    }
    // Control: without the flag the same tree blocks.
    assert.equal(run(STOP_HOOK, stop(repo), { cwd: repo }).status, 2);
  });

  test("empty or unparsable payload does not crash the hook (falls back to process cwd)", () => {
    const repo = makeRepo("stop-empty");
    for (const payload of ["{}", "not json", ""]) {
      const r = run(STOP_HOOK, payload, { cwd: repo });
      assert.equal(r.status, 0, r.stderr);
    }
  });

  test("not a git checkout: exit 0 with a visible message, not silence", () => {
    const plain = path.join(scratch, `plain-${uniq()}`);
    mkdirSync(plain, { recursive: true });
    const r = run(STOP_HOOK, stop(plain), { cwd: plain });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /systemMessage/);
    assert.match(r.stdout, /nothing checked/);
  });

  test("no silent success: typechecker not installed -> exit 2", () => {
    const repo = makeRepo("stop-noastro");
    rmSync(path.join(repo, "node_modules", "astro"), { recursive: true });
    write(repo, "src/clean.ts", "export const clean = 3;\n");
    const r = run(STOP_HOOK, stop(repo), { cwd: repo });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /astro is not installed/);
  });

  test("sibling worktree edited during the session is swept at end of turn", () => {
    const repo = makeRepo("wt-main");
    const wt = path.join(scratch, `wt-sibling-${uniq()}`);
    git(repo, "worktree", "add", "-q", wt, "-b", `wt-${uniq()}`);
    installStubs(wt);
    const sid = `s-${uniq()}`;

    // Control: before any edit in the worktree, the session checkout alone is clean.
    assert.equal(run(STOP_HOOK, { session_id: sid, cwd: repo }, { cwd: repo }).status, 0);

    // The per-edit hook (cwd = main checkout) registers the worktree the file lives in...
    const reg = run(LINT_HOOK, edit(repo, path.join(wt, "src", "clean.ts"), { session_id: sid }), { cwd: repo });
    assert.equal(reg.status, 0);
    // ...then a shell command breaks the file behind its back.
    write(wt, "src/clean.ts", "// LINT_BROKEN\n");
    const r = run(STOP_HOOK, { session_id: sid, cwd: repo }, { cwd: repo });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /clean\.ts/);
    assert.ok(r.stderr.toLowerCase().includes(path.basename(wt).toLowerCase()), r.stderr);
  });
});

describe("settings.json wiring", () => {
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  const entries = Object.entries(settings.hooks).flatMap(([event, groups]) =>
    groups.flatMap((g) => g.hooks.map((h) => ({ event, matcher: g.matcher, ...h }))),
  );

  test("registers one per-edit hook (Write|Edit) and one Stop hook, timeouts in seconds", () => {
    assert.deepEqual(entries.map((e) => e.event).sort(), ["PostToolUse", "Stop"]);
    assert.equal(entries.find((e) => e.event === "PostToolUse").matcher, "Write|Edit");
    for (const e of entries) {
      assert.equal(e.type, "command");
      assert.ok(
        Number.isInteger(e.timeout) && e.timeout >= 1 && e.timeout <= 300,
        `timeout ${e.timeout} looks like ms`,
      );
    }
  });

  test("every command script exists", () => {
    for (const e of entries) {
      const name = /\.claude\/hooks\/([\w.-]+\.mjs)/.exec(e.command)?.[1];
      assert.ok(name && existsSync(path.join(HOOKS_DIR, name)), `missing script for: ${e.command}`);
    }
  });

  const bashCandidates =
    process.platform === "win32"
      ? [path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe")]
      : ["bash"];
  const bash = bashCandidates.find((b) => b === "bash" || existsSync(b));

  test("every command reaches its script from a subdirectory of a checkout when CLAUDE_PROJECT_DIR is stale", (t) => {
    if (!bash) return t.skip("Git Bash not found: the harness shell is unavailable on this machine");
    const repo = makeRepo("wiring");
    cpSync(HOOKS_DIR, path.join(repo, ".claude", "hooks"), { recursive: true });
    assert.ok(readdirSync(path.join(repo, ".claude", "hooks")).length >= 3);
    for (const e of entries) {
      const r = spawnSync(bash, ["-c", e.command], {
        cwd: path.join(repo, "src"),
        input: "{}",
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: path.join(scratch, "does-not-exist") },
      });
      assert.equal(r.status, 0, `${e.event}: ${r.stderr}${r.stdout}`);
    }
  });
});
