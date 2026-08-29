import test from "node:test";
import assert from "node:assert/strict";
import { resolveEvidenceFilePath } from "./evidence-paths";

test("resolveEvidenceFilePath joins a repository-relative path onto the repository's absolute path", () => {
  assert.equal(
    resolveEvidenceFilePath("/Users/dev/code/devdeck", "./cache.ts"),
    "/Users/dev/code/devdeck/cache.ts",
  );
});

test("resolveEvidenceFilePath tolerates a trailing slash on the repository path", () => {
  assert.equal(
    resolveEvidenceFilePath("/Users/dev/code/devdeck/", "src/index.ts"),
    "/Users/dev/code/devdeck/src/index.ts",
  );
});

test("resolveEvidenceFilePath returns null when the repository path is unresolved", () => {
  assert.equal(resolveEvidenceFilePath(undefined, "./cache.ts"), null);
});

test("resolveEvidenceFilePath returns null when there is no file path", () => {
  assert.equal(resolveEvidenceFilePath("/Users/dev/code/devdeck", null), null);
});
