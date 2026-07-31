import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOpenCodeUsageRows } from "./opencode-usage";

test("normalizeOpenCodeUsageRows parses model metadata and token totals", () => {
  const records = normalizeOpenCodeUsageRows([
    {
      cacheReadTokens: 40,
      cacheWriteTokens: 5,
      cost: 0.12,
      createdAt: 1785540000000,
      directory: "/tmp/repo",
      inputTokens: 100,
      modelJson: '{"id":"big-pickle","providerID":"opencode"}',
      opencodeAgent: "build",
      outputTokens: 20,
      projectId: "project-1",
      reasoningTokens: 10,
      sessionId: "ses_1",
      title: "Build feature",
      updatedAt: 1785540001000,
    },
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0]?.model, "big-pickle");
  assert.equal(records[0]?.provider, "opencode");
  assert.equal(records[0]?.totalTokens, 175);
  assert.equal(records[0]?.updatedAt, "2026-07-31T23:20:01.000Z");
});

test("normalizeOpenCodeUsageRows drops rows without session ids", () => {
  const records = normalizeOpenCodeUsageRows([
    {
      inputTokens: 100,
    },
  ]);

  assert.equal(records.length, 0);
});
