import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentHarnessQualityReport } from "./agent-harness-quality";
import type { AgentDefinition, WorkflowDefinition } from "./agents";

const builder = {
  boundaries: ["Keep changes scoped"],
  defaultModel: "gpt-5-codex",
  defaultProvider: "openai",
  defaultSkills: ["typescript"],
  defaultTools: ["shell"],
  description: "Builds",
  handoffTargets: ["reviewer", "missing-agent"],
  id: "builder",
  name: "Builder Agent",
  projectId: "alpha",
  projectName: "alpha",
  responsibilities: ["Implement scoped changes"],
  sourceFormat: "json",
  sourcePath: "/repo/agents.json",
} satisfies AgentDefinition;

const reviewer = {
  ...builder,
  boundaries: [],
  defaultSkills: [],
  defaultTools: [],
  description: null,
  handoffTargets: [],
  id: "reviewer",
  name: "Reviewer Agent",
  responsibilities: [],
} satisfies AgentDefinition;

const workflow = {
  description: "Build then review",
  id: "feature",
  name: "Feature Build",
  projectId: "alpha",
  projectName: "alpha",
  sourceFormat: "json",
  sourcePath: "/repo/agents.json",
  steps: [
    {
      agentId: "builder",
      expectedOutput: null,
      id: "implement",
      name: "Implement",
      nextStepIds: ["review"],
      verificationCommandIds: ["npm test"],
    },
    {
      agentId: "reviewer",
      expectedOutput: null,
      id: "review",
      name: "Review",
      nextStepIds: [],
      verificationCommandIds: [],
    },
    {
      agentId: "missing-agent",
      expectedOutput: null,
      id: "ship",
      name: "Ship",
      nextStepIds: [],
      verificationCommandIds: [],
    },
  ],
} satisfies WorkflowDefinition;

test("buildAgentHarnessQualityReport detects harness quality issues", () => {
  const report = buildAgentHarnessQualityReport({
    agents: [builder, reviewer, { ...builder, name: "Duplicate Builder" }],
    sources: [
      {
        agentCount: 2,
        errors: ["Source warning"],
        format: "json",
        projectId: "alpha",
        projectName: "alpha",
        sourcePath: "/repo/agents.json",
        workflowCount: 1,
      },
    ],
    workflows: [workflow],
  });

  assert.equal(report.agentCoverage.totalAgents, 3);
  assert.equal(report.workflowCoverage.totalSteps, 3);
  assert.equal(report.workflowCoverage.stepsWithVerification, 1);
  assert.equal(report.workflowCoverage.verificationCoverageRate, 33);
  assert.ok(report.criticalCount >= 3);
  assert.ok(report.warningCount >= 3);
  assert.ok(report.score < 100);
  assert.ok(
    report.issues.some((issue) =>
      issue.message.includes('Handoff target "missing-agent"'),
    ),
  );
  assert.ok(
    report.issues.some((issue) =>
      issue.message.includes('Workflow step references unknown agent "missing-agent"'),
    ),
  );
  assert.ok(
    report.issues.some((issue) =>
      issue.message.includes("Workflow step has no verification command"),
    ),
  );
});
