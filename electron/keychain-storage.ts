import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Thin wrapper around macOS Keychain generic passwords via the `security`
 * CLI. Extracted from the pattern in electron/github-auth.ts so new
 * credential stores (starting with Jira) don't re-derive it. Every
 * caller must still provide its own file-based fallback for non-macOS
 * platforms and tests — see electron/jira/jira-auth.ts.
 */
export interface KeychainGenericPasswordRef {
  account: string;
  service: string;
}

export function isKeychainPlatformAvailable(): boolean {
  return process.platform === "darwin";
}

export async function readKeychainGenericPassword(
  ref: KeychainGenericPasswordRef,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-a",
      ref.account,
      "-s",
      ref.service,
      "-w",
    ]);

    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function saveKeychainGenericPassword(
  ref: KeychainGenericPasswordRef,
  secret: string,
): Promise<void> {
  await execFileAsync("security", [
    "add-generic-password",
    "-a",
    ref.account,
    "-s",
    ref.service,
    "-w",
    secret,
    "-U",
  ]);
}

export async function deleteKeychainGenericPassword(
  ref: KeychainGenericPasswordRef,
): Promise<void> {
  try {
    await execFileAsync("security", [
      "delete-generic-password",
      "-a",
      ref.account,
      "-s",
      ref.service,
    ]);
  } catch {
    // Ignore missing-keychain-entry failures.
  }
}
