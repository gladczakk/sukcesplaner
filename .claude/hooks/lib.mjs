// Shared helpers for the Claude Code agent hooks (Node, no jq/bash dependency: works on Windows).
// Signal channel: exit 2 + stderr is the only combination Claude sees (PostToolUse and Stop).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
delete ENV.GREP_OPTIONS;
delete ENV.NODE_TEST_CONTEXT;

// Extensions ESLint covers in this repo (eslint.config.js: ts/tsx/astro + script .mjs; lint-staged uses ts/tsx/astro).
export const LINT_EXT = /\.(ts|tsx|mts|cts|astro|js|jsx|mjs|cjs)$/;
// Changes that can break the typecheck or the app tests.
export const CODE_CHANGE = /(\.(ts|tsx|mts|cts|astro|js|jsx|mjs|cjs)|(^|\/)(package\.json|tsconfig\.json))$/;

/** stdin payload as an object; empty, unreadable or unparsable input is just "no fields". */
export function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    raw = "";
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function git(cwd, args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: ENV,
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  return r.status === 0 ? r.stdout : "";
}

export function canon(p) {
  let r = path.resolve(p);
  try {
    r = realpathSync.native(r);
  } catch {
    /* keep resolved path */
  }
  return process.platform === "win32" ? r.toLowerCase() : r;
}

/** Top-level of the git checkout that contains `dir` ("" when it is not in a checkout). */
export function checkoutOf(dir) {
  const out = git(dir, ["rev-parse", "--show-toplevel"]).trim();
  return out ? path.resolve(out) : "";
}

/** Identity of the repository (shared by all its worktrees). */
export function repoId(root) {
  const out = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  return out ? canon(out) : "";
}

export function registryFile(sessionId) {
  const sid = String(sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return sid ? path.join(tmpdir(), "claude-hooks", `${sid}.roots`) : "";
}

/** Locate a package's JS entry from its package.json "bin" in the checkout; throws when not installed. */
export function resolveBin(root, pkg, name = pkg) {
  const pj = path.join(root, "node_modules", pkg, "package.json");
  if (!existsSync(pj)) throw new Error(`${pkg} is not installed in ${root} (run npm ci)`);
  const bin = JSON.parse(readFileSync(pj, "utf8")).bin;
  const rel = typeof bin === "string" ? bin : bin?.[name];
  if (!rel) throw new Error(`${pkg} has no "${name}" bin`);
  return path.join(root, "node_modules", pkg, rel);
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/** Run a package bin with the current Node. Never throws; failing to run counts as a failure. */
export function runBin(root, pkg, args, timeoutMs) {
  let bin;
  try {
    bin = resolveBin(root, pkg);
  } catch (e) {
    return { ok: false, output: e.message };
  }
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    env: ENV,
    encoding: "utf8",
    timeout: Math.max(1000, Math.floor(timeoutMs)),
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(ANSI, "").trim();
  const lines = output.split("\n");
  if (lines.length > 150) output = `${lines.slice(0, 150).join("\n")}\n... (${lines.length - 150} more lines)`;
  if (r.error) {
    const why = r.error.code === "ETIMEDOUT" ? `timed out after ${Math.round(timeoutMs / 1000)}s` : r.error.message;
    return { ok: false, output: `${pkg} did not finish: ${why}\n${output}`.trim() };
  }
  if (r.status !== 0 && !output) output = `${pkg} exited with code ${r.status} and no output`;
  return { ok: r.status === 0, output };
}
