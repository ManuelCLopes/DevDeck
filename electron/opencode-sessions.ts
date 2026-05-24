import { execFile, spawn } from "child_process";
import { basename } from "path";
import { createServer } from "net";
import { promisify } from "util";
import { homedir, tmpdir } from "os";
import http from "node:http";
import type { OpenCodeSessionRecord } from "../shared/opencode-sessions";

const execFileAsync = promisify(execFile);
const SERVER_HOSTNAME = "127.0.0.1";
const SERVER_START_TIMEOUT_MS = 8_000;

async function nodeFetchJson(url: string, options?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options?.method ?? "GET",
      headers: options?.headers ?? {},
    };

    if (options?.body) {
      reqOptions.headers = {
        ...reqOptions.headers,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(options.body),
      };
    }

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          // ignored
        }
        resolve({
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode ?? 0,
          json: async () => parsed,
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (options?.body) {
      req.write(options.body);
    }
    req.end();
  });
}

const fetch = nodeFetchJson;

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

function getMacosPath(): string {
  const base = process.env.PATH ?? "";
  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin"];
  const pathParts = base.split(":");
  const missing = extraPaths.filter(p => !pathParts.includes(p));
  if (missing.length > 0) {
    return [...missing, ...pathParts].join(":");
  }
  return base;
}

let withServerQueuePromise = Promise.resolve<any>(undefined);

async function withOpenCodeServer<T>(action: (baseUrl: string) => Promise<T>): Promise<T> {
  const resultPromise = withServerQueuePromise.then(async () => {
    const port = await getAvailablePort();
    const baseUrl = `http://${SERVER_HOSTNAME}:${port}`;
    const env = { ...process.env };
    if (process.platform === "darwin") {
      env.PATH = getMacosPath();
    }

    const serverProcess = spawn(
      "opencode",
      ["serve", "--hostname", SERVER_HOSTNAME, "--port", String(port)],
      {
        cwd: tmpdir(),
        detached: false,
        env,
        stdio: "pipe",
      },
    );

    let serverOutput = "";
    serverProcess.stdout?.on("data", (data) => {
      serverOutput += String(data);
    });
    serverProcess.stderr?.on("data", (data) => {
      serverOutput += String(data);
    });

    serverProcess.on("error", (err) => {
      console.error("OpenCode server process SPAWN ERROR:", err);
    });

    try {
      await waitForServer(baseUrl);
      return await action(baseUrl);
    } catch (err) {
      console.error(`OpenCode server failed to boot on port ${port}. Process output:\n${serverOutput}`);
      throw err;
    } finally {
      if (!serverProcess.killed) {
        serverProcess.kill("SIGTERM");
      }
    }
  });

  withServerQueuePromise = resultPromise.then(
    () => undefined,
    () => undefined
  );

  return resultPromise;
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
    const env = { ...process.env };
    if (process.platform === "darwin") {
      env.PATH = getMacosPath();
    }
    await execFileAsync(process.platform === "win32" ? "where" : "which", ["opencode"], { env });
    return true;
  } catch {
    return false;
  }
}
