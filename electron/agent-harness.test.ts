import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import {
  discoverAgentHarness,
  parseJsonAgentHarness,
  parseMarkdownAgentHarness,
} from "./agent-harness";

const baseContext = {
  projectId: "project-1",
  projectName: "DevDeck",
  sourceFormat: "json" as const,
  sourcePath: "/tmp/repo/agents.json",
};

test("parseJsonAgentHarness normalizes agents and workflows", () => {
  const result = parseJsonAgentHarness(
    JSON.stringify({
      agents: [
        {
          defaultModel: "gpt-5-codex",
          handoffTargets: ["reviewer"],
          id: "builder",
          responsibilities: ["Implement scoped changes"],
          skills: ["typescript"],
          tools: ["shell"],
        },
      ],
      workflows: [
        {
          id: "feature",
          name: "Feature build",
          steps: [
            {
              agent: "builder",
              expectedOutput: "Working implementation",
              id: "implement",
              next: ["review"],
              verification: ["npm test"],
            },
          ],
        },
      ],
    }),
    baseContext,
  );

  assert.equal(result.agents.length, 1);
  assert.equal(result.agents[0]?.id, "builder");
  assert.deepEqual(result.agents[0]?.responsibilities, [
    "Implement scoped changes",
  ]);
  assert.equal(result.workflows[0]?.steps[0]?.agentId, "builder");
  assert.deepEqual(result.workflows[0]?.steps[0]?.verificationCommandIds, [
    "npm test",
  ]);
});

test("parseMarkdownAgentHarness extracts responsibility sections", () => {
  const result = parseMarkdownAgentHarness(
    [
      "# Agents",
      "",
      "## Builder Agent",
      "Owns implementation work inside the selected worktree.",
      "",
      "Responsibilities:",
      "- Implement scoped changes",
      "- Run the project verification recipe",
      "",
      "Boundaries:",
      "- Do not merge without review",
      "",
      "Tools:",
      "- shell",
    ].join("\n"),
    {
      ...baseContext,
      sourceFormat: "markdown",
      sourcePath: "/tmp/repo/AGENTS.md",
    },
  );

  assert.equal(result.agents.length, 1);
  assert.equal(result.agents[0]?.name, "Builder Agent");
  assert.deepEqual(result.agents[0]?.responsibilities, [
    "Implement scoped changes",
    "Run the project verification recipe",
  ]);
  assert.deepEqual(result.agents[0]?.boundaries, ["Do not merge without review"]);
});

test("discoverAgentHarness scans configured project paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "devdeck-agents-"));
  const repoPath = join(root, "repo");
  mkdirSync(repoPath, { recursive: true });
  writeFileSync(
    join(repoPath, "agents.json"),
    JSON.stringify({
      agents: {
        reviewer: {
          name: "Reviewer",
          responsibilities: ["Inspect diffs"],
        },
      },
    }),
    "utf8",
  );

  try {
    const result = await discoverAgentHarness({
      projects: [{ id: "repo", localPath: repoPath, name: "Repo" }],
    });

    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.agentCount, 1);
    assert.equal(result.agents[0]?.id, "reviewer");
    assert.equal(result.agents[0]?.projectName, "Repo");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("discoverAgentHarness picks up opencode agent folder markdown files", async () => {
  const root = mkdtempSync(join(tmpdir(), "devdeck-opencode-agents-"));
  const repoPath = join(root, "repo");
  const agentDir = join(repoPath, ".opencode", "agent");
  const nestedAgentDir = join(agentDir, "reviewers");
  mkdirSync(nestedAgentDir, { recursive: true });

  writeFileSync(
    join(agentDir, "builder.md"),
    [
      "# Builder",
      "Owns implementation.",
      "",
      "Responsibilities:",
      "- Implement scoped changes",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(nestedAgentDir, "senior.md"),
    [
      "# Senior Reviewer",
      "Reviews diffs from the builder.",
      "",
      "Responsibilities:",
      "- Inspect diffs",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(repoPath, "opencode.json"),
    JSON.stringify({
      agents: [
        {
          id: "planner",
          name: "Planner",
          responsibilities: ["Break down the task"],
        },
      ],
    }),
    "utf8",
  );

  try {
    const result = await discoverAgentHarness({
      projects: [{ id: "repo", localPath: repoPath, name: "Repo" }],
    });

    const sourcePaths = result.sources.map((source) => source.sourcePath);
    assert.ok(
      sourcePaths.some((p) => p.endsWith(join(".opencode", "agent", "builder.md"))),
      `expected builder.md to be discovered, got ${sourcePaths.join(", ")}`,
    );
    assert.ok(
      sourcePaths.some((p) =>
        p.endsWith(join(".opencode", "agent", "reviewers", "senior.md")),
      ),
      "expected nested senior.md to be discovered",
    );
    assert.ok(
      sourcePaths.some((p) => p.endsWith("opencode.json")),
      "expected opencode.json to be discovered",
    );

    const agentNames = result.agents.map((agent) => agent.name).sort();
    assert.deepEqual(agentNames, ["Builder", "Planner", "Senior Reviewer"]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("parseMarkdownAgentHarness reads opencode-style YAML frontmatter", () => {
  const result = parseMarkdownAgentHarness(
    [
      "---",
      "description: Reviews code changes for correctness.",
      "mode: subagent",
      "model: anthropic/claude-sonnet-4-5",
      "tools:",
      "  write: false",
      "  edit: false",
      "  read: true",
      "  bash: true",
      "---",
      "System prompt content here.",
    ].join("\n"),
    {
      projectId: "project-1",
      projectName: "DevDeck",
      sourceFormat: "markdown",
      sourcePath: "/tmp/repo/.opencode/agent/reviewer.md",
    },
  );

  assert.equal(result.agents.length, 1);
  const agent = result.agents[0];
  assert.equal(agent?.name, "reviewer");
  assert.equal(agent?.description, "Reviews code changes for correctness.");
  assert.equal(agent?.defaultModel, "anthropic/claude-sonnet-4-5");
  assert.deepEqual(agent?.defaultTools.sort(), ["bash", "read"]);
});

test("discoverAgentHarness scans the global opencode config directory", async () => {
  const home = mkdtempSync(join(tmpdir(), "devdeck-global-home-"));
  const xdg = join(home, ".config");
  const globalAgentDir = join(xdg, "opencode", "agent");
  mkdirSync(globalAgentDir, { recursive: true });
  writeFileSync(
    join(globalAgentDir, "planner.md"),
    [
      "---",
      "description: Breaks the task into steps.",
      "model: anthropic/claude-opus-4-5",
      "---",
      "You are a planner.",
    ].join("\n"),
    "utf8",
  );

  const previousHome = process.env.HOME;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = xdg;

  try {
    const result = await discoverAgentHarness({ projects: [] });

    const globalAgents = result.agents.filter(
      (agent) => agent.sourcePath === join(globalAgentDir, "planner.md"),
    );
    assert.equal(globalAgents.length, 1, "expected the global planner agent");
    assert.equal(globalAgents[0]?.name, "planner");
    assert.equal(globalAgents[0]?.description, "Breaks the task into steps.");
    assert.equal(globalAgents[0]?.defaultModel, "anthropic/claude-opus-4-5");
    assert.equal(globalAgents[0]?.projectName, "Global (opencode)");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdg;
    }
    rmSync(home, { force: true, recursive: true });
  }
});

test("discoverAgentHarness skips volatile opencode subdirectories", async () => {
  const root = mkdtempSync(join(tmpdir(), "devdeck-opencode-skip-"));
  const repoPath = join(root, "repo");
  const cacheDir = join(repoPath, ".opencode", "cache");
  const sessionsDir = join(repoPath, ".opencode", "sessions");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });

  writeFileSync(join(cacheDir, "leftover.json"), "{}", "utf8");
  writeFileSync(join(sessionsDir, "history.md"), "# history", "utf8");

  try {
    const result = await discoverAgentHarness({
      projects: [{ id: "repo", localPath: repoPath, name: "Repo" }],
    });

    const sourcePaths = result.sources.map((source) => source.sourcePath);
    assert.equal(
      sourcePaths.filter(
        (p) => p.includes(`${path.sep}cache${path.sep}`) ||
          p.includes(`${path.sep}sessions${path.sep}`),
      ).length,
      0,
      `expected cache/sessions to be skipped, got ${sourcePaths.join(", ")}`,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("discoverAgentHarness reports invalid workflow references", async () => {
  const root = mkdtempSync(join(tmpdir(), "devdeck-agent-validation-"));
  const repoPath = join(root, "repo");
  mkdirSync(repoPath, { recursive: true });
  writeFileSync(
    join(repoPath, "agents.json"),
    JSON.stringify({
      agents: [
        {
          id: "builder",
          name: "Builder",
          responsibilities: ["Implement scoped changes"],
        },
      ],
      workflows: [
        {
          id: "feature",
          name: "Feature",
          steps: [
            {
              agent: "reviewer",
              id: "review",
              name: "Review",
            },
          ],
        },
      ],
    }),
    "utf8",
  );

  try {
    const result = await discoverAgentHarness({
      projects: [{ id: "repo", localPath: repoPath, name: "Repo" }],
    });

    assert.match(
      result.sources[0]?.errors.join("\n") ?? "",
      /references unknown agent "reviewer"/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("discoverAgentHarness skips docs directories in nested walks", async () => {
  const home = mkdtempSync(join(tmpdir(), "devdeck-docs-skip-"));
  const xdg = join(home, ".config");
  const opencodeDir = join(xdg, "opencode");
  const opencodeDocsDir = join(opencodeDir, "docs");
  const opencodeAgentDir = join(opencodeDir, "agent");
  mkdirSync(opencodeDocsDir, { recursive: true });
  mkdirSync(opencodeAgentDir, { recursive: true });

  writeFileSync(
    join(opencodeDocsDir, "DEPENDENCIES.md"),
    "# Docs\n\n## Runtime Requirements\n\nSome prose.\n",
    "utf8",
  );
  writeFileSync(
    join(opencodeAgentDir, "planner.md"),
    ["---", "description: Planner.", "---", "You are a planner."].join("\n"),
    "utf8",
  );

  const previousHome = process.env.HOME;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = xdg;

  try {
    const result = await discoverAgentHarness({ projects: [] });

    const sourcePaths = result.sources.map((source) => source.sourcePath);
    assert.equal(
      sourcePaths.filter((p) =>
        p.includes(`${path.sep}docs${path.sep}`) ||
        p.endsWith(`${path.sep}docs`),
      ).length,
      0,
      `expected docs/ to be skipped, got ${sourcePaths.join(", ")}`,
    );
    assert.ok(
      sourcePaths.some((p) => p.endsWith(join("agent", "planner.md"))),
      "expected the planner agent to still be discovered",
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdg;
    }
    rmSync(home, { force: true, recursive: true });
  }
});

test("discoverAgentHarness dedupes files reached by overlapping targets", async () => {
  // Realistic overlap: a project directory lives inside a global harness
  // root, so the global recursive walk reaches the same AGENTS.md that
  // the project scan also picks up. filteredGlobalTargets only rejects
  // globals whose root equals a project root (not globals that CONTAIN
  // a project root), so both targets survive; the file-level dedupe is
  // what prevents a double parse.
  const home = mkdtempSync(join(tmpdir(), "devdeck-source-dedupe-"));
  const xdg = join(home, ".config");
  const nestedRepo = join(xdg, "opencode", "nested-repo");
  mkdirSync(nestedRepo, { recursive: true });
  writeFileSync(
    join(nestedRepo, "AGENTS.md"),
    [
      "---",
      "name: Builder",
      "description: Builds things.",
      "---",
      "You build things.",
    ].join("\n"),
    "utf8",
  );

  const previousHome = process.env.HOME;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = xdg;

  try {
    const result = await discoverAgentHarness({
      projects: [{ id: "nested", localPath: nestedRepo, name: "Nested" }],
    });

    const resolvedAgentsMd = path.resolve(join(nestedRepo, "AGENTS.md"));
    const agentsForFile = result.agents.filter(
      (agent) => path.resolve(agent.sourcePath) === resolvedAgentsMd,
    );
    assert.equal(
      agentsForFile.length,
      1,
      `expected AGENTS.md to be parsed once, got ${agentsForFile.length}`,
    );

    const sourcesForFile = result.sources.filter(
      (source) => path.resolve(source.sourcePath) === resolvedAgentsMd,
    );
    assert.equal(
      sourcesForFile.length,
      1,
      "expected the source entry to be recorded once",
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdg;
    }
    rmSync(home, { force: true, recursive: true });
  }
});
