import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
          tokenBudget: "120000",
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
  assert.equal(result.agents[0]?.tokenBudget, 120000);
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
      "",
      "Token Budget: 90000",
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
  assert.equal(result.agents[0]?.tokenBudget, 90000);
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
          tokenBudget: 120000,
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
