import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { JiraAuthCapabilities, JiraConnectionCredentials } from "../../shared/jira";
import { getDevDeckUserDataPath } from "../user-data-path";
import {
  deleteKeychainGenericPassword,
  isKeychainPlatformAvailable,
  readKeychainGenericPassword,
  saveKeychainGenericPassword,
} from "../keychain-storage";

/**
 * Jira credential storage — mirrors electron/github-auth.ts's
 * Keychain/file split. Phase 2 supports a single active Jira connection
 * (docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 3.2: "Connect a
 * Jira Cloud account", singular); the schema and this module's shape
 * both allow more later without a rewrite.
 *
 * The stored secret is the whole credentials object (base URL + account
 * email + API token) JSON-encoded, not just the token — Jira Cloud's
 * API-token auth needs all three to build the Basic auth header.
 */

const JIRA_CREDENTIAL_ACCOUNT = "default";
const JIRA_CREDENTIAL_SERVICE = "com.manuelclopes.devdeck.jira";

function getJiraCredentialFallbackPath(): string {
  const explicitPath = process.env.DEVDECK_JIRA_CREDENTIAL_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  return path.join(getDevDeckUserDataPath(), "jira-credentials.json");
}

function shouldUseKeychainStorage(): boolean {
  const storageMode = process.env.DEVDECK_JIRA_STORAGE?.trim().toLowerCase();
  if (storageMode === "file") {
    return false;
  }
  if (storageMode === "keychain") {
    return true;
  }

  return isKeychainPlatformAvailable();
}

function parseStoredCredentials(raw: string): JiraConnectionCredentials | null {
  try {
    const parsed = JSON.parse(raw) as Partial<JiraConnectionCredentials>;
    if (
      typeof parsed.baseUrl === "string" &&
      typeof parsed.accountEmail === "string" &&
      typeof parsed.apiToken === "string"
    ) {
      return {
        accountEmail: parsed.accountEmail,
        apiToken: parsed.apiToken,
        baseUrl: parsed.baseUrl,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function readStoredJiraCredentials(): Promise<JiraConnectionCredentials | null> {
  if (shouldUseKeychainStorage()) {
    const raw = await readKeychainGenericPassword({
      account: JIRA_CREDENTIAL_ACCOUNT,
      service: JIRA_CREDENTIAL_SERVICE,
    });
    return raw ? parseStoredCredentials(raw) : null;
  }

  try {
    const raw = await readFile(getJiraCredentialFallbackPath(), "utf8");
    return parseStoredCredentials(raw);
  } catch {
    return null;
  }
}

export async function saveStoredJiraCredentials(
  credentials: JiraConnectionCredentials,
): Promise<void> {
  const serialized = JSON.stringify(credentials);

  if (shouldUseKeychainStorage()) {
    await saveKeychainGenericPassword(
      { account: JIRA_CREDENTIAL_ACCOUNT, service: JIRA_CREDENTIAL_SERVICE },
      serialized,
    );
    return;
  }

  const fallbackPath = getJiraCredentialFallbackPath();
  await mkdir(path.dirname(fallbackPath), { recursive: true });
  await writeFile(fallbackPath, serialized, { encoding: "utf8", mode: 0o600 });
}

export async function clearStoredJiraCredentials(): Promise<void> {
  if (shouldUseKeychainStorage()) {
    await deleteKeychainGenericPassword({
      account: JIRA_CREDENTIAL_ACCOUNT,
      service: JIRA_CREDENTIAL_SERVICE,
    });
    return;
  }

  await rm(getJiraCredentialFallbackPath(), { force: true });
}

export function getJiraAuthCapabilities(): JiraAuthCapabilities {
  return {
    storageBackend: shouldUseKeychainStorage() ? "keychain" : "file",
  };
}
