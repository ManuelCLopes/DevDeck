import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import {
  DEFAULT_AGENT_RUN_HISTORY_LIMIT,
  DEFAULT_TASK_TRACE_HISTORY_LIMIT,
  DEFAULT_TOKEN_USAGE_HISTORY_LIMIT,
  mergeAgentRuns,
  mergeTaskTraceEntries,
  mergeTokenUsageEvents,
  normalizeAgentTelemetrySnapshot,
  type AgentTelemetrySnapshot,
} from "../shared/agent-telemetry";
import { getDevDeckUserDataPath } from "./user-data-path";

const AGENT_TELEMETRY_STORE_VERSION = 1;

let mutationQueue: Promise<void> = Promise.resolve();

function getAgentTelemetryStorePath() {
  const explicitPath = process.env.DEVDECK_AGENT_TELEMETRY_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  return path.join(getDevDeckUserDataPath(), "agent-telemetry.json");
}

async function readStoreFile(): Promise<AgentTelemetrySnapshot> {
  try {
    const rawStore = await readFile(getAgentTelemetryStorePath(), "utf8");
    return normalizeAgentTelemetrySnapshot(JSON.parse(rawStore));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) {
      return normalizeAgentTelemetrySnapshot(null);
    }

    throw error;
  }
}

async function writeStoreFile(snapshot: AgentTelemetrySnapshot) {
  const storePath = getAgentTelemetryStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });

  const updatedAt = new Date().toISOString();
  const normalizedSnapshot = normalizeAgentTelemetrySnapshot({
    ...snapshot,
    updatedAt,
  });
  const payload = {
    schemaVersion: AGENT_TELEMETRY_STORE_VERSION,
    ...normalizedSnapshot,
    updatedAt,
  };
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;

  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);

  return normalizeAgentTelemetrySnapshot(payload);
}

async function mutateStore(
  mutator: (currentSnapshot: AgentTelemetrySnapshot) => AgentTelemetrySnapshot,
) {
  const mutation = mutationQueue.then(async () => {
    const currentSnapshot = await readStoreFile();
    const nextSnapshot = mutator(currentSnapshot);
    await writeStoreFile(nextSnapshot);
  });

  mutationQueue = mutation.then(
    () => undefined,
    () => undefined,
  );

  await mutation;
  return readStoreFile();
}

export async function readAgentTelemetryStore() {
  await mutationQueue;
  return readStoreFile();
}

export async function saveAgentRuns(agentRuns: unknown) {
  return mutateStore((currentSnapshot) => ({
    ...currentSnapshot,
    agentRuns: mergeAgentRuns(
      [],
      agentRuns,
      DEFAULT_AGENT_RUN_HISTORY_LIMIT,
    ),
  }));
}

export async function saveTaskTraceEntries(taskTraceEntries: unknown) {
  return mutateStore((currentSnapshot) => ({
    ...currentSnapshot,
    taskTraceEntries: mergeTaskTraceEntries(
      [],
      taskTraceEntries,
      DEFAULT_TASK_TRACE_HISTORY_LIMIT,
    ),
  }));
}

export async function importTaskTraceEntries(taskTraceEntries: unknown) {
  return mutateStore((currentSnapshot) => ({
    ...currentSnapshot,
    taskTraceEntries: mergeTaskTraceEntries(
      currentSnapshot.taskTraceEntries,
      taskTraceEntries,
      DEFAULT_TASK_TRACE_HISTORY_LIMIT,
    ),
  }));
}

export async function saveTokenUsageEvents(tokenUsageEvents: unknown) {
  return mutateStore((currentSnapshot) => ({
    ...currentSnapshot,
    tokenUsageEvents: mergeTokenUsageEvents(
      [],
      tokenUsageEvents,
      DEFAULT_TOKEN_USAGE_HISTORY_LIMIT,
    ),
  }));
}
