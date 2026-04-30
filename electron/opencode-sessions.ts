import { execFile, spawn } from "child_process";
import { basename } from "path";
import { createServer } from "net";
import { promisify } from "util";
import type { OpenCodeSessionRecord } from "../shared/opencode-sessions";

const execFileAsync = promisify(execFile);
const SERVER_HOSTNAME = "127.0.0.1";
const SERVER_START_TIMEOUT_MS = 8_000;

interface OpenCodeProjectRecord {
  id: string;
  name: string | null;
  path: string | null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTimestamp(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function normalizeRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object",
    );
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.sessions)) {
      return normalizeRecordArray(record.sessions);
    }
    if (Array.isArray(record.projects)) {
      return normalizeRecordArray(record.projects);
    }
  }

  return [];
}

function inferProjectName(projectPath: string | null) {
  if (!projectPath) {
    return null;
  }

  const name = basename(projectPath);
  return name.length > 0 ? name : null;
}

function normalizeProjectRecord(rawProject: Record<string, unknown>): OpenCodeProjectRecord | null {
  const id =
    normalizeString(rawProject.id) ??
    normalizeString(rawProject.projectID) ??
    normalizeString(rawProject.projectId);

  if (!id) {
    return null;
  }

  const path =
    normalizeString(rawProject.path) ??
    normalizeString(rawProject.cwd) ??
    normalizeString(rawProject.root) ??
    normalizeString(rawProject.directory);

  const name =
    normalizeString(rawProject.name) ??
    normalizeString(rawProject.title) ??
    inferProjectName(path);

  return { id, name, path };
}

function normalizeSessionRecord(
  rawSession: Record<string, unknown>,
  projectsById: Map<string, OpenCodeProjectRecord>,
): OpenCodeSessionRecord | null {
  const id =
    normalizeString(rawSession.id) ??
    normalizeString(rawSession.sessionID) ??
    normalizeString(rawSession.sessionId);
  if (!id) {
    return null;
  }

  const projectId =
    normalizeString(rawSession.projectID) ??
    normalizeString(rawSession.projectId) ??
    normalizeString(
      rawSession.project && typeof rawSession.project === "object"
        ? (rawSession.project as Record<string, unknown>).id
        : null,
    );
  const nestedProject =
    rawSession.project && typeof rawSession.project === "object"
      ? normalizeProjectRecord(rawSession.project as Record<string, unknown>)
      : null;
  const mappedProject = projectId ? projectsById.get(projectId) ?? null : null;
  const projectPath =
    normalizeString(rawSession.path) ??
    normalizeString(rawSession.cwd) ??
    normalizeString(rawSession.directory) ??
    nestedProject?.path ??
    mappedProject?.path ??
    null;
  const projectName =
    normalizeString(rawSession.projectName) ??
    nestedProject?.name ??
    mappedProject?.name ??
    inferProjectName(projectPath);

  const timeRecord =
    rawSession.time && typeof rawSession.time === "object"
      ? (rawSession.time as Record<string, unknown>)
      : null;

  return {
    createdAt:
      normalizeTimestamp(rawSession.createdAt) ??
      normalizeTimestamp(timeRecord?.created) ??
      null,
    id,
    projectName,
    projectPath,
    title:
      normalizeString(rawSession.title) ??
      normalizeString(rawSession.name) ??
      normalizeString(rawSession.summary) ??
      id,
    updatedAt:
      normalizeTimestamp(rawSession.updatedAt) ??
      normalizeTimestamp(timeRecord?.updated) ??
      normalizeTimestamp(timeRecord?.last) ??
      null,
  };
}

async function getAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, SERVER_HOSTNAME, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate an OpenCode server port.")));
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitForServer(baseUrl: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    try {
      const response = await fetch(`${baseUrl}/global/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error("Timed out while starting the OpenCode session service.");
}

async function withOpenCodeServer<T>(action: (baseUrl: string) => Promise<T>) {
  const port = await getAvailablePort();
  const baseUrl = `http://${SERVER_HOSTNAME}:${port}`;
  const serverProcess = spawn(
    "opencode",
    ["serve", "--hostname", SERVER_HOSTNAME, "--port", String(port)],
    {
      detached: false,
      env: process.env,
      stdio: "ignore",
    },
  );

  try {
    await waitForServer(baseUrl);
    return await action(baseUrl);
  } finally {
    if (!serverProcess.killed) {
      serverProcess.kill("SIGTERM");
    }
  }
}

export async function listOpenCodeSessions() {
  return withOpenCodeServer(async (baseUrl) => {
    const [projectsResponse, sessionsResponse] = await Promise.all([
      fetch(`${baseUrl}/project`),
      fetch(`${baseUrl}/session`),
    ]);

    if (!projectsResponse.ok) {
      throw new Error(`OpenCode project list failed with ${projectsResponse.status}.`);
    }

    if (!sessionsResponse.ok) {
      throw new Error(`OpenCode session list failed with ${sessionsResponse.status}.`);
    }

    const rawProjects = normalizeRecordArray(await projectsResponse.json());
    const rawSessions = normalizeRecordArray(await sessionsResponse.json());
    const projectsById = new Map(
      rawProjects
        .map((rawProject) => normalizeProjectRecord(rawProject))
        .filter((project): project is OpenCodeProjectRecord => Boolean(project))
        .map((project) => [project.id, project]),
    );

    return rawSessions
      .map((rawSession) => normalizeSessionRecord(rawSession, projectsById))
      .filter((session): session is OpenCodeSessionRecord => Boolean(session))
      .sort((left, right) => {
        const rightTimestamp = right.updatedAt ? Date.parse(right.updatedAt) : 0;
        const leftTimestamp = left.updatedAt ? Date.parse(left.updatedAt) : 0;
        return rightTimestamp - leftTimestamp;
      });
  });
}

export async function renameOpenCodeSession(sessionId: string, title: string) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Session name is required.");
  }

  return withOpenCodeServer(async (baseUrl) => {
    const [projectsResponse, renameResponse] = await Promise.all([
      fetch(`${baseUrl}/project`),
      fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}`, {
        body: JSON.stringify({ title: trimmedTitle }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      }),
    ]);

    if (!projectsResponse.ok) {
      throw new Error(`OpenCode project list failed with ${projectsResponse.status}.`);
    }

    if (!renameResponse.ok) {
      throw new Error(`OpenCode session rename failed with ${renameResponse.status}.`);
    }

    const rawProjects = normalizeRecordArray(await projectsResponse.json());
    const projectsById = new Map(
      rawProjects
        .map((rawProject) => normalizeProjectRecord(rawProject))
        .filter((project): project is OpenCodeProjectRecord => Boolean(project))
        .map((project) => [project.id, project]),
    );
    const rawSession = await renameResponse.json();
    const normalized = normalizeSessionRecord(
      rawSession as Record<string, unknown>,
      projectsById,
    );

    if (!normalized) {
      throw new Error("OpenCode returned an invalid session payload.");
    }

    return normalized;
  });
}

export async function isOpenCodeCliAvailable() {
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "which", ["opencode"]);
    return true;
  } catch {
    return false;
  }
}
