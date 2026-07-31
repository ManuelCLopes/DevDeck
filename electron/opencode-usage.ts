import { execFile } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import path from "path";
import { promisify } from "util";
import type { OpenCodeUsageRecord } from "../shared/opencode-usage";

const execFileAsync = promisify(execFile);

interface OpenCodeUsageRow {
  cacheReadTokens?: unknown;
  cacheWriteTokens?: unknown;
  cost?: unknown;
  createdAt?: unknown;
  directory?: unknown;
  inputTokens?: unknown;
  modelJson?: unknown;
  opencodeAgent?: unknown;
  outputTokens?: unknown;
  projectId?: unknown;
  reasoningTokens?: unknown;
  sessionId?: unknown;
  title?: unknown;
  updatedAt?: unknown;
}

function getOpenCodeDataDirectory() {
  return process.env.XDG_DATA_HOME
    ? path.join(process.env.XDG_DATA_HOME, "opencode")
    : path.join(homedir(), ".local", "share", "opencode");
}

export function getOpenCodeDatabasePath() {
  return path.join(getOpenCodeDataDirectory(), "opencode.db");
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTimestamp(value: unknown) {
  const timestamp = normalizeNumber(value);
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseModel(value: unknown) {
  const rawModel = normalizeString(value);
  if (!rawModel) {
    return { model: null, provider: null };
  }

  try {
    const parsed = JSON.parse(rawModel) as Record<string, unknown>;
    return {
      model:
        normalizeString(parsed.id) ??
        normalizeString(parsed.model) ??
        normalizeString(parsed.modelID) ??
        null,
      provider:
        normalizeString(parsed.providerID) ??
        normalizeString(parsed.providerId) ??
        normalizeString(parsed.provider) ??
        null,
    };
  } catch {
    return { model: rawModel, provider: null };
  }
}

function buildSqliteUri(databasePath: string) {
  return `file:${databasePath.replaceAll("?", "%3f").replaceAll("#", "%23")}?mode=ro`;
}

export function normalizeOpenCodeUsageRows(rows: OpenCodeUsageRow[]) {
  return rows
    .map((row) => {
      const sessionId = normalizeString(row.sessionId);
      if (!sessionId) {
        return null;
      }

      const model = parseModel(row.modelJson);
      const inputTokens = normalizeNumber(row.inputTokens);
      const outputTokens = normalizeNumber(row.outputTokens);
      const reasoningTokens = normalizeNumber(row.reasoningTokens);
      const cacheReadTokens = normalizeNumber(row.cacheReadTokens);
      const cacheWriteTokens = normalizeNumber(row.cacheWriteTokens);

      return {
        cacheReadTokens,
        cacheWriteTokens,
        cost: normalizeNumber(row.cost),
        createdAt: normalizeTimestamp(row.createdAt),
        directory: normalizeString(row.directory),
        inputTokens,
        model: model.model,
        opencodeAgent: normalizeString(row.opencodeAgent),
        outputTokens,
        projectId: normalizeString(row.projectId),
        provider: model.provider,
        reasoningTokens,
        sessionId,
        title: normalizeString(row.title),
        totalTokens:
          inputTokens +
          outputTokens +
          reasoningTokens +
          cacheReadTokens +
          cacheWriteTokens,
        updatedAt: normalizeTimestamp(row.updatedAt),
      } satisfies OpenCodeUsageRecord;
    })
    .filter((record): record is OpenCodeUsageRecord => Boolean(record));
}

export async function listOpenCodeUsageRecords() {
  const databasePath = getOpenCodeDatabasePath();
  if (!existsSync(databasePath)) {
    return [];
  }

  const query = `
    select
      id as sessionId,
      project_id as projectId,
      directory,
      title,
      agent as opencodeAgent,
      model as modelJson,
      cost,
      tokens_input as inputTokens,
      tokens_output as outputTokens,
      tokens_reasoning as reasoningTokens,
      tokens_cache_read as cacheReadTokens,
      tokens_cache_write as cacheWriteTokens,
      time_created as createdAt,
      time_updated as updatedAt
    from session
    where
      tokens_input > 0 or
      tokens_output > 0 or
      tokens_reasoning > 0 or
      tokens_cache_read > 0 or
      tokens_cache_write > 0 or
      cost > 0
    order by time_updated desc
  `;
  const { stdout } = await execFileAsync("sqlite3", [
    "-json",
    buildSqliteUri(databasePath),
    query,
  ]);
  const rows = JSON.parse(stdout || "[]") as OpenCodeUsageRow[];
  return normalizeOpenCodeUsageRows(rows);
}
