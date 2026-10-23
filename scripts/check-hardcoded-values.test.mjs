// Guards the two hand-maintained lists of files under the hard-coded value check:
// DEFAULT_FILES in check-hardcoded-values.mjs and the lint-staged glob in package.json must name the same files.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const script = readFileSync(new URL("./check-hardcoded-values.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function defaultFiles() {
  const block = /const DEFAULT_FILES = \[([\s\S]*?)\];/.exec(script);
  assert.ok(block, "DEFAULT_FILES array not found in check-hardcoded-values.mjs");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function lintStagedFiles() {
  const key = Object.keys(pkg["lint-staged"]).find((glob) =>
    pkg["lint-staged"][glob].some((cmd) => cmd.includes("check-hardcoded-values")),
  );
  assert.ok(key, "no lint-staged entry runs check-hardcoded-values.mjs");
  const braces = /^(.*)\{(.*)\}$/.exec(key);
  assert.ok(braces, `lint-staged glob is not a brace glob: ${key}`);
  // Bracket characters are escaped in the glob (`\[id\]`) so micromatch reads them literally; DEFAULT_FILES holds the plain path.
  return braces[2].split(",").map((part) => (braces[1] + part).replaceAll("\\", ""));
}

test("lint-staged glob and DEFAULT_FILES list the same files", () => {
  assert.deepEqual([...lintStagedFiles()].sort(), [...defaultFiles()].sort());
});

test("every file in DEFAULT_FILES exists", () => {
  for (const file of defaultFiles()) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} is listed but missing`);
  }
});
