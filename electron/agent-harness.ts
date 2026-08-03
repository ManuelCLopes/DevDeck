import { existsSync, statSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { homedir, platform } from "os";
import path from "path";
import type {
  AgentDefinition,
  AgentHarnessDiscoveryRequest,
  AgentHarnessDiscoveryResult,
  AgentHarnessSource,
  AgentHarnessSourceFormat,
  WorkflowDefinition,
  WorkflowStepDefinition,
} from "../shared/agents";

const HARNESS_CANDIDATE_FILES = [
  "AGENTS.md",
  "agents.md",
  "CLAUDE.md",
  "agents.json",
  "agent-harness.json",
  "harness.json",
  "agents.yaml",
  "agents.yml",
  "opencode.json",
  "opencode.jsonc",
  ".opencode/agents.json",
  ".opencode/agents.md",
  ".opencode/harness.json",
  ".opencode/workflows.json",
  ".opencode/opencode.json",
  ".opencode/opencode.jsonc",
  ".opencode/config.json",
  ".codex/AGENTS.md",
  ".codex/agents.json",
  ".codex/harness.json",
];

const HARNESS_SCAN_DIRECTORIES = [
  ".opencode",
  ".codex",
];

function getGlobalHarnessDirectories(): string[] {
  const home = homedir();
  if (!home) {
    return [];
  }

  const xdgConfigHome =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()
      ? process.env.XDG_CONFIG_HOME
      : path.join(home, ".config");

  const directories = new Set<string>([
    path.join(xdgConfigHome, "opencode"),
    path.join(home, ".opencode"),
    path.join(xdgConfigHome, "codex"),
    path.join(home, ".codex"),
    path.join(home, ".claude"),
  ]);

  if (platform() === "darwin") {
    directories.add(path.join(home, "Library", "Application Support", "opencode"));
    directories.add(path.join(home, "Library", "Application Support", "codex"));
  }

  if (platform() === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      directories.add(path.join(appData, "opencode"));
      directories.add(path.join(appData, "codex"));
    }
  }

  return Array.from(directories);
}

const HARNESS_DIRECTORY_MAX_DEPTH = 4;

const HARNESS_DIRECTORY_SKIP_NAMES = new Set([
  "node_modules",
  ".git",
  "cache",
  "logs",
  "sessions",
  "history",
  "state",
  "tmp",
]);

interface ProjectHarnessTarget {
  id: string | null;
  localPath: string;
  name: string | null;
}

interface ParsedHarnessFile {
  agents: AgentDefinition[];
  errors: string[];
  format: AgentHarnessSourceFormat;
  workflows: WorkflowDefinition[];
}

interface HarnessSourceContext {
  projectId: string | null;
  projectName: string | null;
  sourceFormat: AgentHarnessSourceFormat;
  sourcePath: string;
}

interface MarkdownSection {
  body: string;
  name: string;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\r?\n|,/)
    .map((entry) => entry.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "agent"
  );
}

function getSourceFormat(sourcePath: string): AgentHarnessSourceFormat {
  const basename = path.basename(sourcePath).toLowerCase();
  if (basename.endsWith(".json")) {
    return "json";
  }
  if (basename.endsWith(".md")) {
    return "markdown";
  }
  if (basename.endsWith(".yaml") || basename.endsWith(".yml")) {
    return "yaml";
  }
  return "unknown";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function normalizeAgentRecord(
  rawAgent: Record<string, unknown>,
  context: HarnessSourceContext,
  index: number,
): AgentDefinition | null {
  const name =
    normalizeString(getRecordValue(rawAgent, ["name", "title", "id", "role"])) ??
    `Agent ${index + 1}`;
  const id =
    normalizeString(getRecordValue(rawAgent, ["id", "slug", "key"])) ??
    [
      context.projectId ?? context.projectName ?? "workspace",
      slugify(path.basename(context.sourcePath)),
      slugify(name),
    ].join(":");

  return {
    boundaries: uniqueStrings(
      normalizeStringArray(
        getRecordValue(rawAgent, [
          "boundaries",
          "constraints",
          "doNotDo",
          "do_not_do",
          "nonGoals",
          "non_goals",
        ]),
      ),
    ),
    defaultModel: normalizeString(
      getRecordValue(rawAgent, ["defaultModel", "model", "modelId", "model_id"]),
    ),
    defaultProvider: normalizeString(
      getRecordValue(rawAgent, ["defaultProvider", "provider"]),
    ),
    defaultSkills: uniqueStrings(
      normalizeStringArray(
        getRecordValue(rawAgent, ["defaultSkills", "skills", "allowedSkills"]),
      ),
    ),
    defaultTools: uniqueStrings(
      normalizeStringArray(
        getRecordValue(rawAgent, ["defaultTools", "tools", "allowedTools"]),
      ),
    ),
    description:
      normalizeString(getRecordValue(rawAgent, ["description", "summary", "role"])) ??
      null,
    handoffTargets: uniqueStrings(
      normalizeStringArray(
        getRecordValue(rawAgent, [
          "handoffTargets",
          "handoffs",
          "handoff",
          "nextAgents",
        ]),
      ),
    ),
    id,
    name,
    projectId: context.projectId,
    projectName: context.projectName,
    responsibilities: uniqueStrings(
      normalizeStringArray(
        getRecordValue(rawAgent, [
          "responsibilities",
          "responsibility",
          "tasks",
          "owns",
        ]),
      ),
    ),
    sourceFormat: context.sourceFormat,
    sourcePath: context.sourcePath,
    tokenBudget: normalizeNumber(
      getRecordValue(rawAgent, [
        "tokenBudget",
        "token_budget",
        "maxTokens",
        "max_tokens",
      ]),
    ),
  };
}

function normalizeWorkflowStepRecord(
  rawStep: Record<string, unknown>,
  workflowId: string,
  index: number,
): WorkflowStepDefinition {
  const name =
    normalizeString(getRecordValue(rawStep, ["name", "title", "id"])) ??
    `Step ${index + 1}`;
  return {
    agentId:
      normalizeString(
        getRecordValue(rawStep, ["agentId", "agent_id", "agent", "ownerAgent"]),
      ) ?? null,
    expectedOutput:
      normalizeString(
        getRecordValue(rawStep, ["expectedOutput", "expected_output", "output"]),
      ) ?? null,
    id:
      normalizeString(getRecordValue(rawStep, ["id", "slug", "key"])) ??
      `${workflowId}:step:${index + 1}`,
    name,
    nextStepIds: uniqueStrings(
      normalizeStringArray(getRecordValue(rawStep, ["nextStepIds", "next", "then"])),
    ),
    verificationCommandIds: uniqueStrings(
      normalizeStringArray(
        getRecordValue(rawStep, [
          "verificationCommandIds",
          "verification",
          "checks",
          "commands",
        ]),
      ),
    ),
  };
}

function normalizeWorkflowRecord(
  rawWorkflow: Record<string, unknown>,
  context: HarnessSourceContext,
  index: number,
): WorkflowDefinition {
  const name =
    normalizeString(getRecordValue(rawWorkflow, ["name", "title", "id"])) ??
    `Workflow ${index + 1}`;
  const id =
    normalizeString(getRecordValue(rawWorkflow, ["id", "slug", "key"])) ??
    [
      context.projectId ?? context.projectName ?? "workspace",
      "workflow",
      slugify(name),
    ].join(":");
  const rawSteps = getRecordValue(rawWorkflow, ["steps", "workflowSteps"]);
  const stepRecords = Array.isArray(rawSteps)
    ? rawSteps.filter(
        (step): step is Record<string, unknown> =>
          Boolean(step) && typeof step === "object",
      )
    : [];

  return {
    description:
      normalizeString(getRecordValue(rawWorkflow, ["description", "summary"])) ??
      null,
    id,
    name,
    projectId: context.projectId,
    projectName: context.projectName,
    sourceFormat: context.sourceFormat,
    sourcePath: context.sourcePath,
    steps: stepRecords.map((step, stepIndex) =>
      normalizeWorkflowStepRecord(step, id, stepIndex),
    ),
  };
}

function getRecordArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object",
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => Boolean(entry) && typeof entry === "object")
      .map(([key, entry]) => ({ id: key, ...(entry as Record<string, unknown>) }));
  }

  return [];
}

export function parseJsonAgentHarness(
  content: string,
  context: HarnessSourceContext,
): ParsedHarnessFile {
  const parsed = JSON.parse(content) as unknown;
  const root =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : { agents: parsed };
  const agentRecords = getRecordArray(root.agents ?? root.agentDefinitions ?? parsed);
  const workflowRecords = getRecordArray(root.workflows ?? root.workflowDefinitions);

  return {
    agents: agentRecords
      .map((rawAgent, index) => normalizeAgentRecord(rawAgent, context, index))
      .filter((agent): agent is AgentDefinition => Boolean(agent)),
    errors: [],
    format: "json",
    workflows: workflowRecords.map((rawWorkflow, index) =>
      normalizeWorkflowRecord(rawWorkflow, context, index),
    ),
  };
}

function stripMarkdownFormatting(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^\s*[-*]\s+/, "")
    .trim();
}

function splitMarkdownSections(content: string, fallbackName: string) {
  const sections: MarkdownSection[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      if (currentName && currentLines.join("\n").trim()) {
        sections.push({ body: currentLines.join("\n"), name: currentName });
      }
      currentName = stripMarkdownFormatting(heading[2] ?? "");
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  if (currentName && currentLines.join("\n").trim()) {
    sections.push({ body: currentLines.join("\n"), name: currentName });
  }

  if (sections.length === 0 && content.trim()) {
    return [{ body: content, name: fallbackName }];
  }

  const likelyAgentSections = sections.filter((section) => {
    const body = section.body.toLowerCase();
    const name = section.name.toLowerCase();
    return (
      name.includes("agent") ||
      body.includes("responsibil") ||
      body.includes("handoff") ||
      body.includes("tools") ||
      body.includes("skills")
    );
  });

  return likelyAgentSections.length > 0 ? likelyAgentSections : sections;
}

function getMarkdownListForLabels(body: string, labels: string[]) {
  const values: string[] = [];
  let currentLabel: string | null = null;
  const normalizedLabels = labels.map((label) => label.toLowerCase());

  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const labelLine = line.match(/^\s*(?:\*\*)?([A-Za-z][A-Za-z\s/_-]+)(?:\*\*)?:\s*(.*)$/);

    if (heading) {
      const headingText = stripMarkdownFormatting(heading[1] ?? "").toLowerCase();
      currentLabel =
        normalizedLabels.find((label) => headingText.includes(label)) ?? null;
      continue;
    }

    if (labelLine) {
      const labelText = stripMarkdownFormatting(labelLine[1] ?? "").toLowerCase();
      const matchingLabel =
        normalizedLabels.find((label) => labelText.includes(label)) ?? null;
      if (matchingLabel) {
        currentLabel = matchingLabel;
        const inlineValue = stripMarkdownFormatting(labelLine[2] ?? "");
        if (inlineValue) {
          values.push(...normalizeStringArray(inlineValue));
        }
        continue;
      }
      currentLabel = null;
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet && currentLabel) {
      values.push(stripMarkdownFormatting(bullet[1] ?? ""));
    }
  }

  return uniqueStrings(values);
}

function getMarkdownDescription(body: string) {
  const paragraphLines: string[] = [];

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraphLines.length > 0) {
        break;
      }
      continue;
    }
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ") ||
      /^[A-Za-z][A-Za-z\s/_-]+:\s*/.test(trimmed)
    ) {
      if (paragraphLines.length > 0) {
        break;
      }
      continue;
    }
    paragraphLines.push(stripMarkdownFormatting(trimmed));
  }

  return paragraphLines.join(" ").trim() || null;
}

function extractFrontmatter(content: string): {
  body: string;
  frontmatter: Record<string, unknown> | null;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { body: content, frontmatter: null };
  }

  const frontmatter = parseSimpleYaml(match[1] ?? "");
  const body = content.slice(match[0].length);
  return { body, frontmatter };
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentList: string[] | null = null;
  let currentMap: Record<string, unknown> | null = null;

  const flush = () => {
    if (currentKey === null) {
      return;
    }
    if (currentList !== null) {
      result[currentKey] = currentList;
    } else if (currentMap !== null) {
      result[currentKey] = currentMap;
    }
    currentKey = null;
    currentList = null;
    currentMap = null;
  };

  const stripQuotes = (raw: string) => {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    if (indent === 0) {
      flush();
      const bulletTop = line.match(/^-\s+(.*)$/);
      if (bulletTop) {
        continue;
      }
      const keyValue = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (!keyValue) {
        continue;
      }
      currentKey = keyValue[1];
      const value = keyValue[2] ?? "";
      if (!value.trim()) {
        currentList = [];
        currentMap = {};
        continue;
      }
      result[currentKey] = stripQuotes(value);
      currentKey = null;
      currentList = null;
      currentMap = null;
      continue;
    }

    if (!currentKey) {
      continue;
    }

    const bullet = line.match(/^\s+-\s+(.*)$/);
    if (bullet) {
      currentList = currentList ?? [];
      currentList.push(stripQuotes(bullet[1] ?? ""));
      currentMap = null;
      continue;
    }

    const nested = line.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (nested) {
      currentMap = currentMap ?? {};
      const nestedValue = (nested[2] ?? "").trim();
      currentMap[nested[1]] = nestedValue ? stripQuotes(nestedValue) : "";
      currentList = null;
      continue;
    }
  }
  flush();

  return result;
}

function frontmatterToolsToList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled !== false && enabled !== "false")
      .map(([name]) => name);
  }
  return normalizeStringArray(value);
}

export function parseMarkdownAgentHarness(
  content: string,
  context: HarnessSourceContext,
): ParsedHarnessFile {
  const fallbackName = path.basename(context.sourcePath).replace(/\.[^.]+$/, "");
  const { body: bodyAfterFrontmatter, frontmatter } = extractFrontmatter(content);

  const parentDirName = path.basename(path.dirname(context.sourcePath)).toLowerCase();
  const isSingleAgentFile =
    frontmatter !== null ||
    parentDirName === "agent" ||
    parentDirName === "agents" ||
    parentDirName === "prompts" ||
    parentDirName === "commands";

  if (isSingleAgentFile) {
    const firstHeadingMatch = bodyAfterFrontmatter.match(/^\s*#\s+(.+)$/m);
    const firstHeadingName = firstHeadingMatch
      ? stripMarkdownFormatting(firstHeadingMatch[1] ?? "")
      : null;
    const sectionName =
      normalizeString(
        frontmatter ? getRecordValue(frontmatter, ["name", "title"]) : null,
      ) ??
      normalizeString(firstHeadingName) ??
      fallbackName;
    const bodyResponsibilities = getMarkdownListForLabels(bodyAfterFrontmatter, [
      "responsibilities",
      "responsibility",
      "owns",
      "tasks",
    ]);
    const bodyBoundaries = getMarkdownListForLabels(bodyAfterFrontmatter, [
      "boundaries",
      "constraints",
      "do not",
      "non goals",
    ]);
    const bodyHandoffs = getMarkdownListForLabels(bodyAfterFrontmatter, [
      "handoff",
      "handoffs",
      "next agents",
    ]);
    const bodyDescription = getMarkdownDescription(bodyAfterFrontmatter);

    const frontmatterDescription = normalizeString(
      frontmatter
        ? getRecordValue(frontmatter, ["description", "summary", "role"])
        : null,
    );
    const frontmatterModel = normalizeString(
      frontmatter
        ? getRecordValue(frontmatter, ["model", "defaultModel", "model_id"])
        : null,
    );
    const frontmatterProvider = normalizeString(
      frontmatter
        ? getRecordValue(frontmatter, ["provider", "defaultProvider"])
        : null,
    );
    const frontmatterTools = frontmatter
      ? frontmatterToolsToList(getRecordValue(frontmatter, ["tools", "allowedTools"]))
      : [];
    const frontmatterSkills = frontmatter
      ? normalizeStringArray(getRecordValue(frontmatter, ["skills", "defaultSkills"]))
      : [];
    const frontmatterBudget = normalizeNumber(
      frontmatter
        ? getRecordValue(frontmatter, [
            "tokenBudget",
            "token_budget",
            "maxTokens",
            "max_tokens",
          ])
        : null,
    );
    const frontmatterHandoffs = frontmatter
      ? normalizeStringArray(
          getRecordValue(frontmatter, ["handoffs", "handoffTargets", "handoff"]),
        )
      : [];

    const agent: AgentDefinition = {
      boundaries: uniqueStrings(bodyBoundaries),
      defaultModel: frontmatterModel ?? null,
      defaultProvider: frontmatterProvider ?? null,
      defaultSkills: uniqueStrings(frontmatterSkills),
      defaultTools: uniqueStrings(frontmatterTools),
      description: frontmatterDescription ?? bodyDescription,
      handoffTargets: uniqueStrings([...frontmatterHandoffs, ...bodyHandoffs]),
      id: [
        context.projectId ?? context.projectName ?? "workspace",
        slugify(path.basename(path.dirname(context.sourcePath))),
        slugify(path.basename(context.sourcePath)),
      ].join(":"),
      name: sectionName,
      projectId: context.projectId,
      projectName: context.projectName,
      responsibilities: uniqueStrings(bodyResponsibilities),
      sourceFormat: "markdown",
      sourcePath: context.sourcePath,
      tokenBudget: frontmatterBudget,
    };

    return {
      agents: [agent],
      errors: [],
      format: "markdown",
      workflows: [],
    };
  }

  const sections = splitMarkdownSections(bodyAfterFrontmatter, fallbackName);
  const agents = sections.map((section, index) => {
    const markdownContext = {
      ...context,
      sourceFormat: "markdown" as const,
    };
    const responsibilities = getMarkdownListForLabels(section.body, [
      "responsibilities",
      "responsibility",
      "owns",
      "tasks",
    ]);
    return {
      boundaries: getMarkdownListForLabels(section.body, [
        "boundaries",
        "constraints",
        "do not",
        "non goals",
      ]),
      defaultModel: normalizeString(
        getMarkdownListForLabels(section.body, ["model"])[0],
      ),
      defaultProvider: normalizeString(
        getMarkdownListForLabels(section.body, ["provider"])[0],
      ),
      defaultSkills: getMarkdownListForLabels(section.body, ["skills"]),
      defaultTools: getMarkdownListForLabels(section.body, ["tools"]),
      description: getMarkdownDescription(section.body),
      handoffTargets: getMarkdownListForLabels(section.body, [
        "handoff",
        "handoffs",
        "next agents",
      ]),
      id: [
        markdownContext.projectId ?? markdownContext.projectName ?? "workspace",
        slugify(path.basename(markdownContext.sourcePath)),
        slugify(section.name),
      ].join(":"),
      name: section.name,
      projectId: markdownContext.projectId,
      projectName: markdownContext.projectName,
      responsibilities,
      sourceFormat: markdownContext.sourceFormat,
      sourcePath: markdownContext.sourcePath,
      tokenBudget: normalizeNumber(
        getMarkdownListForLabels(section.body, ["token budget", "max tokens"])[0],
      ),
    } satisfies AgentDefinition;
  });

  return {
    agents,
    errors: [],
    format: "markdown",
    workflows: [],
  };
}

function parseHarnessFile(
  content: string,
  context: HarnessSourceContext,
): ParsedHarnessFile {
  if (context.sourceFormat === "json") {
    return parseJsonAgentHarness(content, context);
  }

  if (context.sourceFormat === "markdown") {
    return parseMarkdownAgentHarness(content, context);
  }

  if (context.sourceFormat === "yaml") {
    return {
      agents: [],
      errors: [
        "YAML harness discovery is detected but not parsed yet. Use JSON or Markdown for imported agents.",
      ],
      format: "yaml",
      workflows: [],
    };
  }

  return {
    agents: [],
    errors: ["Unsupported harness file format."],
    format: context.sourceFormat,
    workflows: [],
  };
}

function normalizeProjectTargets(
  request: AgentHarnessDiscoveryRequest,
): ProjectHarnessTarget[] {
  const selectedProjectIds = new Set(request.projectIds ?? []);
  const projects: ProjectHarnessTarget[] = request.projects
    .filter((project) => !selectedProjectIds.size || selectedProjectIds.has(project.id))
    .map((project) => ({
      id: project.id,
      localPath: project.localPath ?? "",
      name: project.name,
    }))
    .filter((project) => project.localPath);

  if (request.selectionRootPath) {
    projects.push({
      id: null,
      localPath: request.selectionRootPath,
      name: "Workspace",
    });
  }

  const seenPaths = new Set<string>();
  return projects.filter((project) => {
    const normalizedPath = path.resolve(project.localPath);
    if (seenPaths.has(normalizedPath)) {
      return false;
    }
    seenPaths.add(normalizedPath);
    project.localPath = normalizedPath;
    return true;
  });
}

async function collectHarnessFilesInDirectory(
  directoryPath: string,
  depth: number,
): Promise<string[]> {
  if (depth > HARNESS_DIRECTORY_MAX_DEPTH) {
    return [];
  }

  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const collected: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== "." && entry.name !== "..") {
      // Skip hidden entries nested inside harness directories (e.g. `.cache`).
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (HARNESS_DIRECTORY_SKIP_NAMES.has(entry.name.toLowerCase())) {
        continue;
      }
      const nested = await collectHarnessFilesInDirectory(entryPath, depth + 1);
      collected.push(...nested);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (["json", "markdown"].includes(getSourceFormat(entryPath))) {
      collected.push(entryPath);
    }
  }

  return collected;
}

async function listExistingHarnessFiles(projectPath: string) {
  const files = HARNESS_CANDIDATE_FILES.map((candidatePath) =>
    path.join(projectPath, candidatePath),
  ).filter((candidatePath) => {
    try {
      return existsSync(candidatePath) && statSync(candidatePath).isFile();
    } catch {
      return false;
    }
  });

  for (const relativeDirectory of HARNESS_SCAN_DIRECTORIES) {
    const directoryPath = path.join(projectPath, relativeDirectory);
    const nested = await collectHarnessFilesInDirectory(directoryPath, 1);
    files.push(...nested);
  }

  return uniqueStrings(files);
}

function appendSourceValidationErrors(
  sources: AgentHarnessSource[],
  agents: AgentDefinition[],
  workflows: WorkflowDefinition[],
) {
  const errorsBySourcePath = new Map<string, string[]>();
  const agentsById = new Map<string, AgentDefinition[]>();

  const addError = (sourcePath: string, message: string) => {
    const errors = errorsBySourcePath.get(sourcePath) ?? [];
    errors.push(message);
    errorsBySourcePath.set(sourcePath, errors);
  };

  for (const agent of agents) {
    const matchingAgents = agentsById.get(agent.id) ?? [];
    matchingAgents.push(agent);
    agentsById.set(agent.id, matchingAgents);

    if (agent.responsibilities.length === 0 && !agent.description) {
      addError(
        agent.sourcePath,
        `Agent "${agent.name}" has no responsibilities or description; launch recommendations may be weak.`,
      );
    }

    if (!agent.tokenBudget) {
      addError(
        agent.sourcePath,
        `Agent "${agent.name}" has no token budget; DevDeck will rely on per-run launch overrides.`,
      );
    }
  }

  for (const duplicateAgents of Array.from(agentsById.values())) {
    if (duplicateAgents.length <= 1) {
      continue;
    }

    for (const agent of duplicateAgents) {
      addError(
        agent.sourcePath,
        `Agent id "${agent.id}" is duplicated across harness sources; runs and token usage may attach to the wrong definition.`,
      );
    }
  }

  for (const agent of agents) {
    for (const handoffTarget of agent.handoffTargets) {
      if (!agentsById.has(handoffTarget)) {
        addError(
          agent.sourcePath,
          `Agent "${agent.name}" hands off to unknown agent "${handoffTarget}".`,
        );
      }
    }
  }

  for (const workflow of workflows) {
    if (workflow.steps.length === 0) {
      addError(
        workflow.sourcePath,
        `Workflow "${workflow.name}" has no steps; it cannot drive launch recommendations.`,
      );
    }

    for (const step of workflow.steps) {
      if (step.agentId && !agentsById.has(step.agentId)) {
        addError(
          workflow.sourcePath,
          `Workflow "${workflow.name}" step "${step.name}" references unknown agent "${step.agentId}".`,
        );
      }
    }
  }

  return sources.map((source) => ({
    ...source,
    errors: uniqueStrings([
      ...source.errors,
      ...(errorsBySourcePath.get(source.sourcePath) ?? []),
    ]),
  }));
}

async function collectGlobalHarnessTargets(): Promise<ProjectHarnessTarget[]> {
  const targets: ProjectHarnessTarget[] = [];
  for (const directory of getGlobalHarnessDirectories()) {
    try {
      if (!existsSync(directory) || !statSync(directory).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    const label = /opencode/i.test(directory)
      ? "Global (opencode)"
      : /codex/i.test(directory)
        ? "Global (codex)"
        : /claude/i.test(directory)
          ? "Global (claude)"
          : "Global";

    targets.push({ id: null, localPath: directory, name: label });
  }
  return targets;
}

async function listExistingHarnessFilesInGlobalDirectory(
  globalDirectory: string,
): Promise<string[]> {
  return collectHarnessFilesInDirectory(globalDirectory, 1);
}

export async function discoverAgentHarness(
  request: AgentHarnessDiscoveryRequest,
): Promise<AgentHarnessDiscoveryResult> {
  const projectTargets = normalizeProjectTargets(request);
  const globalTargets = await collectGlobalHarnessTargets();
  const agents: AgentDefinition[] = [];
  const workflows: WorkflowDefinition[] = [];
  const sources: AgentHarnessSource[] = [];

  const seenProjectPaths = new Set(
    projectTargets.map((project) => path.resolve(project.localPath)),
  );
  const filteredGlobalTargets = globalTargets.filter(
    (target) => !seenProjectPaths.has(path.resolve(target.localPath)),
  );

  const allTargets = [...projectTargets, ...filteredGlobalTargets];

  for (const project of allTargets) {
    const isGlobalTarget = project.id === null && filteredGlobalTargets.includes(project);

    let sourcePaths: string[] = [];
    try {
      sourcePaths = isGlobalTarget
        ? await listExistingHarnessFilesInGlobalDirectory(project.localPath)
        : await listExistingHarnessFiles(project.localPath);
    } catch (error) {
      sources.push({
        agentCount: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        format: "unknown",
        projectId: project.id,
        projectName: project.name,
        sourcePath: project.localPath,
        workflowCount: 0,
      });
      continue;
    }

    for (const sourcePath of sourcePaths) {
      const sourceFormat = getSourceFormat(sourcePath);
      const context = {
        projectId: project.id,
        projectName: project.name,
        sourceFormat,
        sourcePath,
      };
      try {
        const content = await readFile(sourcePath, "utf8");
        const parsed = parseHarnessFile(content, context);
        agents.push(...parsed.agents);
        workflows.push(...parsed.workflows);
        sources.push({
          agentCount: parsed.agents.length,
          errors: parsed.errors,
          format: parsed.format,
          projectId: project.id,
          projectName: project.name,
          sourcePath,
          workflowCount: parsed.workflows.length,
        });
      } catch (error) {
        sources.push({
          agentCount: 0,
          errors: [error instanceof Error ? error.message : String(error)],
          format: sourceFormat,
          projectId: project.id,
          projectName: project.name,
          sourcePath,
          workflowCount: 0,
        });
      }
    }
  }

  return {
    agents,
    scannedAt: new Date().toISOString(),
    sources: appendSourceValidationErrors(sources, agents, workflows),
    workflows,
  };
}
