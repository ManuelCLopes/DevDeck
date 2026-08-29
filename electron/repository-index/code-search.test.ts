import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchRepositoryText, searchWithNodeFallback } from "./code-search";

function createFixtureTree(): string {
  const root = mkdtempSync(join(tmpdir(), "devdeck-code-search-"));
  writeFileSync(join(root, "cache.ts"), "export function loadCache() {\n  // ENG-123 caching fix\n}\n");
  writeFileSync(join(root, "unrelated.ts"), "export const nothing = 1;\n");
  mkdirSync(join(root, "node_modules", "some-dep"), { recursive: true });
  writeFileSync(join(root, "node_modules", "some-dep", "index.js"), "// ENG-123 should never be found here\n");
  writeFileSync(join(root, ".env"), "SECRET=ENG-123\n");
  return root;
}

test("searchRepositoryText (real ripgrep) finds matches in real files and excludes denied paths", async () => {
  const root = createFixtureTree();
  try {
    const matches = await searchRepositoryText(root, "ENG-123");
    const filePaths = matches.map((match) => match.filePath);

    assert.ok(filePaths.some((path) => path.endsWith("cache.ts")));
    assert.ok(!filePaths.some((path) => path.includes("node_modules")));
    assert.ok(!filePaths.some((path) => path.includes(".env")));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("searchRepositoryText (real ripgrep) excludes a denied directory nested below the repository root", async () => {
  const root = createFixtureTree();
  mkdirSync(join(root, "packages", "app", "secrets"), { recursive: true });
  writeFileSync(
    join(root, "packages", "app", "secrets", "token.txt"),
    "TOKEN=ENG-123\n",
  );
  try {
    const matches = await searchRepositoryText(root, "ENG-123");
    const filePaths = matches.map((match) => match.filePath);

    // A denied pattern like "secrets/**" contains a slash, which
    // gitignore-style globs (ripgrep's -g) root at the search directory
    // by default — this nested secrets/ must still be excluded, not
    // just a top-level one.
    assert.ok(!filePaths.some((path) => path.includes("secrets")));
    assert.ok(filePaths.some((path) => path.endsWith("cache.ts")));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("searchRepositoryText rejects a nonexistent repository path", async () => {
  await assert.rejects(() => searchRepositoryText("/does/not/exist", "anything"));
});

test("searchWithNodeFallback finds matches, skips denied paths, and is case-insensitive", () => {
  const root = createFixtureTree();
  try {
    const matches = searchWithNodeFallback(root, "eng-123", {});
    const filePaths = matches.map((match) => match.filePath);

    assert.ok(filePaths.includes("cache.ts"));
    assert.ok(!filePaths.some((path) => path.includes("node_modules")));
    assert.ok(!filePaths.includes(".env"));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("searchWithNodeFallback respects maxMatches and maxMatchesPerFile", () => {
  const root = mkdtempSync(join(tmpdir(), "devdeck-code-search-"));
  try {
    const lines = Array.from({ length: 10 }, () => "needle here").join("\n");
    writeFileSync(join(root, "many-matches.ts"), lines);

    const matches = searchWithNodeFallback(root, "needle", { maxMatchesPerFile: 3 });
    assert.equal(matches.length, 3);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
