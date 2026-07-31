import { existsSync, statSync } from "fs";
import { readFile, readdir } from "fs/promises";
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
  ".opencode/agents.json",
  ".opencode/agents.md",
  ".opencode/harness.json",
  ".opencode/workflows.json",
  ".codex/AGENTS.md",
  ".codex/agents.json",
  ".codex/harness.json",
];

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

export function parseMarkdownAgentHarness(
  content: string,
  context: HarnessSourceContext,
): ParsedHarnessFile {
  const fallbackName = path.basename(context.sourcePath).replace(/\.[^.]+$/, "");
  const sections = splitMarkdownSections(content, fallbackName);
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

  const customDirectories = [".opencode/agents", ".codex/agents"];
  for (const relativeDirectory of customDirectories) {
    const directoryPath = path.join(projectPath, relativeDirectory);
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      files.push(
        ...entries
          .filter((entry) => entry.isFile())
          .map((entry) => path.join(directoryPath, entry.name))
          .filter((entryPath) =>
            ["json", "markdown"].includes(getSourceFormat(entryPath)),
          ),
      );
    } catch {
      // Optional harness directories are absent in most repositories.
    }
  }

  return uniqueStrings(files);
}

export async function discoverAgentHarness(
  request: AgentHarnessDiscoveryRequest,
): Promise<AgentHarnessDiscoveryResult> {
  const targets = normalizeProjectTargets(request);
  const agents: AgentDefinition[] = [];
  const workflows: WorkflowDefinition[] = [];
  const sources: AgentHarnessSource[] = [];

  for (const project of targets) {
    let sourcePaths: string[] = [];
    try {
      sourcePaths = await listExistingHarnessFiles(project.localPath);
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
    sources,
    workflows,
  };
}
