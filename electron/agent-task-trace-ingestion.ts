import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  DEVDECK_TRACE_DIRECTORY,
  parseTaskTraceImportPayload,
  type AgentTaskTraceFileIngestionResult,
  type AgentTaskTraceIngestionRequest,
  type AgentTaskTraceIngestionResult,
} from "../shared/agent-task-trace";
import type { TaskTraceEntry } from "../shared/agents";
import { importTaskTraceEntries, readAgentTelemetryStore } from "./agent-telemetry-store";

const MAX_TRACE_FILE_BYTES = 2 * 1024 * 1024;
const TRACE_FILE_EXTENSIONS = new Set([".json", ".jsonl"]);

interface TraceFileParseResult {
  entries: TaskTraceEntry[];
  error: string | null;
  rejectedCount: number;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function createDeterministicTraceId(
  filePath: string,
  salt: string,
  entryIndex: number,
  entry: Record<string, unknown>,
) {
  const hash = createHash("sha1")
    .update(filePath)
    .update("\n")
    .update(salt)
    .update("\n")
    .update(String(entryIndex))
    .update("\n")
    .update(JSON.stringify(entry))
    .digest("hex")
    .slice(0, 16);

  return `trace-${hash}`;
}

function withDeterministicEntryIds(
  rawValue: unknown,
  filePath: string,
  salt: string,
) {
  const addId = (entry: unknown, entryIndex: number) => {
    const record = getRecord(entry);
    if (!record || getString(record.id)) {
      return entry;
    }

    return {
      ...record,
      id: createDeterministicTraceId(filePath, salt, entryIndex, record),
    };
  };

  if (Array.isArray(rawValue)) {
    return rawValue.map(addId);
  }

  const record = getRecord(rawValue);
  if (!record) {
    return rawValue;
  }

  if (getString(record.agentRunId)) {
    return addId(record, 0);
  }

  for (const key of ["taskTraceEntries", "traceEntries", "entries"]) {
    const entries = record[key];
    if (Array.isArray(entries)) {
      return {
        ...record,
        [key]: entries.map(addId),
      };
    }
  }

  return rawValue;
}

function parseTracePayload(
  rawValue: unknown,
  filePath: string,
  salt: string,
) {
  return parseTaskTraceImportPayload(
    withDeterministicEntryIds(rawValue, filePath, salt),
  );
}

function parseJsonlTraceFile(rawFile: string, filePath: string): TraceFileParseResult {
  const entries: TaskTraceEntry[] = [];
  const errors: string[] = [];
  let rejectedCount = 0;

  rawFile.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    try {
      const parsedLine = JSON.parse(line) as unknown;
      const result = parseTracePayload(parsedLine, filePath, `line:${index + 1}`);
      entries.push(...result.entries);
      rejectedCount += result.rejectedCount;
    } catch (error) {
      rejectedCount += 1;
      errors.push(`line ${index + 1}: ${getErrorMessage(error)}`);
    }
  });

  return {
    entries,
    error: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
    rejectedCount,
  };
}

async function parseTraceFile(filePath: string): Promise<TraceFileParseResult> {
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return {
        entries: [],
        error: "Trace path is not a file.",
        rejectedCount: 0,
      };
    }
    if (fileStats.size > MAX_TRACE_FILE_BYTES) {
      return {
        entries: [],
        error: `Trace file exceeds ${MAX_TRACE_FILE_BYTES} bytes.`,
        rejectedCount: 0,
      };
    }

    const rawFile = await readFile(filePath, "utf8");
    if (path.extname(filePath).toLowerCase() === ".jsonl") {
      return parseJsonlTraceFile(rawFile, filePath);
    }

    const result = parseTracePayload(JSON.parse(rawFile), filePath, "json");
    return {
      entries: result.entries,
      error: null,
      rejectedCount: result.rejectedCount,
    };
  } catch (error) {
    return {
      entries: [],
      error: getErrorMessage(error),
      rejectedCount: error instanceof SyntaxError ? 1 : 0,
    };
  }
}

function addRootPath(rootPaths: Set<string>, candidatePath: unknown) {
  const rootPath = getString(candidatePath);
  if (rootPath) {
    rootPaths.add(rootPath);
  }
}

async function scanTraceDirectory(traceDirectory: string) {
  try {
    const entries = await readdir(traceDirectory, { withFileTypes: true });
    return {
      error: null,
      paths: entries
        .filter(
          (entry) =>
            entry.isFile() &&
            TRACE_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
        )
        .map((entry) => path.join(traceDirectory, entry.name)),
    };
  } catch (error) {
    if (isNotFound(error)) {
      return { error: null, paths: [] };
    }

    return { error: getErrorMessage(error), paths: [] };
  }
}

async function collectTraceFilePaths(
  request: AgentTaskTraceIngestionRequest | undefined,
) {
  const snapshot = await readAgentTelemetryStore();
  const filePaths = new Set<string>();
  const rootPaths = new Set<string>();
  const scanErrors: AgentTaskTraceFileIngestionResult[] = [];

  for (const run of snapshot.agentRuns) {
    addRootPath(rootPaths, run.worktreePath);
  }

  addRootPath(rootPaths, request?.selection?.rootPath);
  for (const project of request?.selection?.projects ?? []) {
    addRootPath(rootPaths, project.localPath);
    addRootPath(rootPaths, project.workspacePath);
  }

  for (const explicitPath of request?.tracePaths ?? []) {
    const normalizedPath = getString(explicitPath);
    if (!normalizedPath) {
      continue;
    }

    try {
      const explicitStats = await stat(normalizedPath);
      if (explicitStats.isFile()) {
        if (TRACE_FILE_EXTENSIONS.has(path.extname(normalizedPath).toLowerCase())) {
          filePaths.add(normalizedPath);
        }
      } else if (explicitStats.isDirectory()) {
        const scanResult = await scanTraceDirectory(normalizedPath);
        for (const filePath of scanResult.paths) {
          filePaths.add(filePath);
        }
        if (scanResult.error) {
          scanErrors.push({
            error: scanResult.error,
            importedCount: 0,
            path: normalizedPath,
            rejectedCount: 0,
          });
        }
      }
    } catch (error) {
      if (!isNotFound(error)) {
        scanErrors.push({
          error: getErrorMessage(error),
          importedCount: 0,
          path: normalizedPath,
          rejectedCount: 0,
        });
      }
    }
  }

  for (const rootPath of Array.from(rootPaths)) {
    const traceDirectory = path.join(rootPath, ...DEVDECK_TRACE_DIRECTORY.split("/"));
    const scanResult = await scanTraceDirectory(traceDirectory);
    for (const filePath of scanResult.paths) {
      filePaths.add(filePath);
    }
    if (scanResult.error) {
      scanErrors.push({
        error: scanResult.error,
        importedCount: 0,
        path: traceDirectory,
        rejectedCount: 0,
      });
    }
  }

  return {
    filePaths: Array.from(filePaths).sort(),
    scanErrors,
    snapshot,
  };
}

export async function ingestAgentTaskTraces(
  request?: AgentTaskTraceIngestionRequest,
): Promise<AgentTaskTraceIngestionResult> {
  const { filePaths, scanErrors, snapshot } = await collectTraceFilePaths(request);
  const existingIds = new Set(snapshot.taskTraceEntries.map((entry) => entry.id));
  const newIds = new Set<string>();
  const importedEntries: TaskTraceEntry[] = [];
  const fileResults: AgentTaskTraceFileIngestionResult[] = [...scanErrors];

  for (const filePath of filePaths) {
    const parseResult = await parseTraceFile(filePath);
    importedEntries.push(...parseResult.entries);
    for (const entry of parseResult.entries) {
      if (!existingIds.has(entry.id)) {
        newIds.add(entry.id);
      }
    }

    fileResults.push({
      error: parseResult.error,
      importedCount: parseResult.entries.length,
      path: filePath,
      rejectedCount: parseResult.rejectedCount,
    });
  }

  const nextSnapshot =
    importedEntries.length > 0
      ? await importTaskTraceEntries(importedEntries)
      : snapshot;

  return {
    errorCount: fileResults.filter((result) => result.error).length,
    fileResults,
    filesScanned: filePaths.length,
    importedCount: importedEntries.length,
    newEntryCount: newIds.size,
    rejectedCount: fileResults.reduce(
      (count, result) => count + result.rejectedCount,
      0,
    ),
    taskTraceEntries: nextSnapshot.taskTraceEntries,
  };
}
