import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_IGNORE_RULES, IgnoreRules, isLikelyBinaryContent } from "./ignore-rules";

test("IgnoreRules matches dotenv-style prefix patterns", () => {
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored(".env"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored(".env.local"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("src/.env.production"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("environment.ts"), false);
});

test("IgnoreRules matches extension suffix patterns", () => {
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("keys/server.pem"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("id_rsa.key"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("cert.jks"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("readme.md"), false);
});

test("IgnoreRules matches denied directories at any depth", () => {
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("node_modules/lodash/index.js"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("packages/app/node_modules/react/index.js"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("secrets/prod.json"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("credentials/aws.json"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored(".git/HEAD"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("dist/bundle.js"), true);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("build/output.js"), true);
});

test("IgnoreRules does not ignore ordinary source files", () => {
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("src/index.ts"), false);
  assert.equal(DEFAULT_IGNORE_RULES.isIgnored("client/src/App.tsx"), false);
});

test("IgnoreRules.hash is deterministic for the same pattern set regardless of order", () => {
  const a = new IgnoreRules(["a", "b", "c"]);
  const b = new IgnoreRules(["c", "a", "b"]);
  assert.equal(a.hash(), b.hash());
});

test("IgnoreRules.hash differs when the pattern set differs", () => {
  const a = new IgnoreRules(["a", "b"]);
  const b = new IgnoreRules(["a", "b", "c"]);
  assert.notEqual(a.hash(), b.hash());
});

test("isLikelyBinaryContent detects a NUL byte and passes through plain text", () => {
  assert.equal(isLikelyBinaryContent(Buffer.from("hello\0world")), true);
  assert.equal(isLikelyBinaryContent(Buffer.from("hello world, no nulls here")), false);
});
