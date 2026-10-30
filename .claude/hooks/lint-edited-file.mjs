// PostToolUse (Write|Edit): ESLint on the file the agent just edited, nothing else, no --fix.
// Exit 2 + stderr is the only combination Claude sees. Exit 0 = checked and clean, or nothing to check.
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { LINT_EXT, checkoutOf, readPayload, registryFile, repoId, runBin } from "./lib.mjs";

const payload = readPayload();
const input = payload.tool_input ?? {};
const given = input.file_path ?? input.notebook_path;
if (typeof given !== "string" || given === "") process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd !== "" ? payload.cwd : process.cwd();
const file = path.resolve(cwd, given);
if (!LINT_EXT.test(file) || !existsSync(file)) process.exit(0);

// Checkout of the edited file, not $CLAUDE_PROJECT_DIR (stale after EnterWorktree). Files of other
// repositories (~/.claude, other projects) are skipped; any worktree of this repository is checked.
const root = checkoutOf(path.dirname(file));
if (!root) process.exit(0);
const sessionRepo = repoId(checkoutOf(cwd) || cwd);
if (repoId(root) === "" || repoId(root) !== sessionRepo) process.exit(0);

// Register the checkout so the Stop hook sweeps it too, even when it is not the session cwd.
const registry = registryFile(payload.session_id);
if (registry) {
  try {
    mkdirSync(path.dirname(registry), { recursive: true });
    appendFileSync(registry, `${root}\n`);
  } catch {
    /* best effort: the Stop hook still sweeps the session cwd */
  }
}

const rel = path.relative(root, file).split(path.sep).join("/");
const result = runBin(root, "eslint", ["--quiet", "--no-warn-ignored", "--", rel], 28_000);
if (!result.ok) {
  process.stderr.write(`ESLint reported errors in ${rel}:\n${result.output}\n`);
  process.exit(2);
}
process.exit(0);
