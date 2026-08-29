import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearStoredJiraCredentials,
  getJiraAuthCapabilities,
  readStoredJiraCredentials,
  saveStoredJiraCredentials,
} from "./jira-auth";

test("Jira credential storage falls back to file mode when configured", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-jira-auth-"));
  process.env.DEVDECK_JIRA_STORAGE = "file";
  process.env.DEVDECK_JIRA_CREDENTIAL_PATH = join(tempDirectory, "jira-credentials.json");

  try {
    await clearStoredJiraCredentials();
    assert.equal(await readStoredJiraCredentials(), null);

    const credentials = {
      accountEmail: "dev@example.com",
      apiToken: "token-123",
      baseUrl: "https://example.atlassian.net",
    };
    await saveStoredJiraCredentials(credentials);
    assert.deepEqual(await readStoredJiraCredentials(), credentials);

    await clearStoredJiraCredentials();
    assert.equal(await readStoredJiraCredentials(), null);
  } finally {
    delete process.env.DEVDECK_JIRA_STORAGE;
    delete process.env.DEVDECK_JIRA_CREDENTIAL_PATH;
    await rm(tempDirectory, { force: true, recursive: true });
  }
});

test("readStoredJiraCredentials returns null for a malformed credential file", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "devdeck-jira-auth-"));
  process.env.DEVDECK_JIRA_STORAGE = "file";
  process.env.DEVDECK_JIRA_CREDENTIAL_PATH = join(tempDirectory, "jira-credentials.json");

  try {
    await saveStoredJiraCredentials({
      accountEmail: "dev@example.com",
      apiToken: "token",
      baseUrl: "https://example.atlassian.net",
    });
    // Overwrite with valid JSON that is missing a required field.
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(process.env.DEVDECK_JIRA_CREDENTIAL_PATH as string, JSON.stringify({ baseUrl: "x" })),
    );

    assert.equal(await readStoredJiraCredentials(), null);
  } finally {
    delete process.env.DEVDECK_JIRA_STORAGE;
    delete process.env.DEVDECK_JIRA_CREDENTIAL_PATH;
    await rm(tempDirectory, { force: true, recursive: true });
  }
});

test("Jira auth capabilities report file storage outside macOS or when forced", () => {
  process.env.DEVDECK_JIRA_STORAGE = "file";
  assert.deepEqual(getJiraAuthCapabilities(), { storageBackend: "file" });
  delete process.env.DEVDECK_JIRA_STORAGE;
});
