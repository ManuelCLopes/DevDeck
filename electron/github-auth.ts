import { execFile } from "child_process";
import { homedir } from "os";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  fetchGitHubViewer,
  GitHubApiError,
} from "./github-api";

const execFileAsync = promisify(execFile);

const GITHUB_DEVICE_SCOPE = "repo read:org";
const GITHUB_TOKEN_ACCOUNT = "default";
const GITHUB_TOKEN_SERVICE = "com.manuelclopes.devdeck.github";

interface GitHubDeviceCodeResponse {
  device_code: string;
  expires_in: number;
  interval: number;
  user_code: string;
  verification_uri: string;
}

interface GitHubDeviceAccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  interval?: number;
  token_type?: string;
}

export interface GitHubAuthCapabilities {
  deviceFlowAvailable: boolean;
  deviceFlowReason: string | null;
  storageBackend: "file" | "keychain";
}

export interface GitHubDeviceAuthSession {
  deviceCode: string;
  expiresAt: string;
  intervalSeconds: number;
  userCode: string;
  verificationUri: string;
}

export interface GitHubDeviceAuthPollResult {
  intervalSeconds?: number;
  message: string;
  status: "complete" | "error" | "pending";
  viewerLogin?: string;
}

export interface GitHubTokenSaveResult {
  viewerLogin: string;
}

function getGitHubTokenFallbackPath() {
  const explicitPath = process.env.DEVDECK_GITHUB_TOKEN_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  return path.join(getDevDeckUserDataPath(), "github-token.json");
}

function getGitHubOAuthClientId() {
  return process.env.DEVDECK_GITHUB_CLIENT_ID?.trim() || null;
}

function getDevDeckUserDataPath() {
  const explicitPath = process.env.DEVDECK_USER_DATA_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  const homeDirectory = homedir();
  if (process.platform === "darwin") {
    return path.join(homeDirectory, "Library", "Application Support", "DevDeck");
  }

  return path.join(homeDirectory, ".devdeck");
}

function shouldUseKeychainStorage() {
  const storageMode = process.env.DEVDECK_GITHUB_STORAGE?.trim().toLowerCase();
  if (storageMode === "file") {
    return false;
  }

  if (storageMode === "keychain") {
    return true;
  }

  return process.platform === "darwin";
}

async function githubOAuthRequest<T>(
  pathname: string,
  body: URLSearchParams,
) {
  const response = await fetch(`https://github.com${pathname}`, {
    body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    const errorText = (await response.text()).trim();
    throw new Error(
      errorText || `GitHub OAuth request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

async function readStoredGitHubTokenFromKeychain() {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-a",
      GITHUB_TOKEN_ACCOUNT,
      "-s",
      GITHUB_TOKEN_SERVICE,
      "-w",
    ]);

    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function saveStoredGitHubTokenToKeychain(token: string) {
  await execFileAsync("security", [
    "add-generic-password",
    "-a",
    GITHUB_TOKEN_ACCOUNT,
    "-s",
    GITHUB_TOKEN_SERVICE,
    "-w",
    token,
    "-U",
  ]);
}

async function clearStoredGitHubTokenFromKeychain() {
  try {
    await execFileAsync("security", [
      "delete-generic-password",
      "-a",
      GITHUB_TOKEN_ACCOUNT,
      "-s",
      GITHUB_TOKEN_SERVICE,
    ]);
  } catch {
    // Ignore missing-keychain-entry failures.
  }
}

async function readStoredGitHubTokenFromFile() {
  try {
    const tokenFileText = await readFile(getGitHubTokenFallbackPath(), "utf8");
    const tokenFile = JSON.parse(tokenFileText) as { token?: string };
    return tokenFile.token?.trim() || null;
  } catch {
    return null;
  }
}

async function saveStoredGitHubTokenToFile(token: string) {
  const fallbackPath = getGitHubTokenFallbackPath();
  await mkdir(path.dirname(fallbackPath), { recursive: true });
  await writeFile(
    fallbackPath,
    JSON.stringify({ token }, null, 2),
    { encoding: "utf8", mode: 0o600 },
  );
}

async function clearStoredGitHubTokenFromFile() {
  await rm(getGitHubTokenFallbackPath(), { force: true });
}

export async function readStoredGitHubToken() {
  if (shouldUseKeychainStorage()) {
    return readStoredGitHubTokenFromKeychain();
  }

  return readStoredGitHubTokenFromFile();
}

export async function saveStoredGitHubToken(token: string) {
  if (shouldUseKeychainStorage()) {
    await saveStoredGitHubTokenToKeychain(token);
    return;
  }

  await saveStoredGitHubTokenToFile(token);
}

export async function clearStoredGitHubToken() {
  if (shouldUseKeychainStorage()) {
    await clearStoredGitHubTokenFromKeychain();
    return;
  }

  await clearStoredGitHubTokenFromFile();
}

export function getGitHubAuthCapabilities(): GitHubAuthCapabilities {
  const deviceFlowAvailable = Boolean(getGitHubOAuthClientId());

  return {
    deviceFlowAvailable,
    deviceFlowReason: deviceFlowAvailable
      ? null
      : "This build does not include a GitHub OAuth client ID yet. Use a personal access token or configure DEVDECK_GITHUB_CLIENT_ID for device-flow sign-in.",
    storageBackend: shouldUseKeychainStorage() ? "keychain" : "file",
  };
}

export async function validateAndStoreGitHubToken(
  token: string,
): Promise<GitHubTokenSaveResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("Enter a GitHub access token.");
  }

  try {
    const viewer = await fetchGitHubViewer(normalizedToken);
    await saveStoredGitHubToken(normalizedToken);

    return { viewerLogin: viewer.login };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 401) {
      throw new Error("GitHub rejected that token. Check its scopes and try again.");
    }

    throw new Error("DevDeck could not validate that GitHub token.");
  }
}

export async function startGitHubDeviceAuth(): Promise<GitHubDeviceAuthSession> {
  const clientId = getGitHubOAuthClientId();
  if (!clientId) {
    throw new Error(
      "This build does not have a GitHub OAuth client ID configured yet.",
    );
  }

  const response = await githubOAuthRequest<GitHubDeviceCodeResponse>(
    "/login/device/code",
    new URLSearchParams({
      client_id: clientId,
      scope: GITHUB_DEVICE_SCOPE,
    }),
  );

  return {
    deviceCode: response.device_code,
    expiresAt: new Date(Date.now() + response.expires_in * 1000).toISOString(),
    intervalSeconds: response.interval,
    userCode: response.user_code,
    verificationUri: response.verification_uri,
  };
}

export async function pollGitHubDeviceAuth(
  deviceCode: string,
): Promise<GitHubDeviceAuthPollResult> {
  const clientId = getGitHubOAuthClientId();
  if (!clientId) {
    return {
      message: "GitHub OAuth is not configured for this build.",
      status: "error",
    };
  }

  const response = await githubOAuthRequest<GitHubDeviceAccessTokenResponse>(
    "/login/oauth/access_token",
    new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  );

  if (response.access_token) {
    const viewer = await fetchGitHubViewer(response.access_token);
    await saveStoredGitHubToken(response.access_token);

    return {
      message: `Connected GitHub as ${viewer.login}.`,
      status: "complete",
      viewerLogin: viewer.login,
    };
  }

  switch (response.error) {
    case "authorization_pending":
      return {
        intervalSeconds: response.interval,
        message: "Waiting for GitHub authorization to finish.",
        status: "pending",
      };
    case "slow_down":
      return {
        intervalSeconds: response.interval,
        message: "GitHub asked DevDeck to slow down polling.",
        status: "pending",
      };
    case "access_denied":
      return {
        message: "GitHub authorization was canceled.",
        status: "error",
      };
    case "expired_token":
    case "token_expired":
      return {
        message: "That GitHub device code expired. Start the sign-in flow again.",
        status: "error",
      };
    default:
      return {
        message:
          response.error_description ||
          "GitHub sign-in could not be completed.",
        status: "error",
      };
  }
}
