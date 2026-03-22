import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearStoredGitHubToken,
  getGitHubAuthCapabilities,
  readStoredGitHubToken,
  saveStoredGitHubToken,
} from "./github-auth";

test("GitHub token storage falls back to file mode when configured", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-github-auth-"));
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  process.env.DEVDECK_GITHUB_TOKEN_PATH = join(tempDirectory, "github-token.json");

  await clearStoredGitHubToken();
  assert.equal(await readStoredGitHubToken(), null);

  await saveStoredGitHubToken("test-token");
  assert.equal(await readStoredGitHubToken(), "test-token");

  await clearStoredGitHubToken();
  assert.equal(await readStoredGitHubToken(), null);

  delete process.env.DEVDECK_GITHUB_STORAGE;
  delete process.env.DEVDECK_GITHUB_TOKEN_PATH;
  await rm(tempDirectory, { force: true, recursive: true });
});

test("GitHub auth capabilities follow the configured OAuth client id", () => {
  delete process.env.DEVDECK_GITHUB_CLIENT_ID;
  process.env.DEVDECK_GITHUB_STORAGE = "file";
  assert.deepEqual(getGitHubAuthCapabilities(), {
    deviceFlowAvailable: false,
    deviceFlowReason:
      "This build does not include a GitHub OAuth client ID yet. Use a personal access token or configure DEVDECK_GITHUB_CLIENT_ID for device-flow sign-in.",
    storageBackend: "file",
  });

  process.env.DEVDECK_GITHUB_CLIENT_ID = "client-id";
  assert.deepEqual(getGitHubAuthCapabilities(), {
    deviceFlowAvailable: true,
    deviceFlowReason: null,
    storageBackend: "file",
  });

  delete process.env.DEVDECK_GITHUB_STORAGE;
  delete process.env.DEVDECK_GITHUB_CLIENT_ID;
});
