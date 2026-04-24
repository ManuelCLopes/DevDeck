import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreateSessionPath,
  buildDefaultSessionBranchName,
  buildDefaultSessionLabel,
  findDuplicateDevSession,
  findProjectDevSession,
  findPullRequestDevSession,
  normalizeDevSessions,
  sortDevSessions,
} from "./dev-sessions";

test("buildCreateSessionPath includes project and pull request query params", () => {
  assert.equal(
    buildCreateSessionPath("repo-1", "pr-7"),
    "/sessions?create=1&project=repo-1&pr=pr-7",
  );
});

test("buildDefaultSessionBranchName prefers PR-oriented review branch names", () => {
  assert.equal(
    buildDefaultSessionBranchName({
      headBranch: "feature/maps",
      pullRequestNumber: 42,
      repositoryName: "radar",
    }),
    "review-pr-42-feature-maps",
  );
});

test("buildDefaultSessionLabel adapts to worktree and existing clone templates", () => {
  assert.equal(
    buildDefaultSessionLabel({
      kind: "worktree",
      projectName: "DevDeck",
      pullRequestNumber: 42,
    }),
    "Review #42",
  );
  assert.equal(
    buildDefaultSessionLabel({
      kind: "existing_clone",
      projectName: "DevDeck",
      pullRequestNumber: 42,
    }),
    "Review #42 · Linked Clone",
  );
});

test("normalizeDevSessions keeps only valid persisted sessions", () => {
  const sessions = normalizeDevSessions([
    {
      id: "1",
      kind: "worktree",
      label: "Review #12",
      localPath: "/tmp/review",
      projectId: "repo-1",
      projectName: "DevDeck",
      repositoryPath: "/tmp/repo",
      sessionBranchName: "review-pr-12",
      status: "active",
      updatedAt: "2026-04-22T10:00:00.000Z",
    },
    {
      label: "Broken",
    },
  ]);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.kind, "worktree");
});

test("sortDevSessions keeps active sessions first and newest first inside groups", () => {
  const sessions = sortDevSessions(
    normalizeDevSessions([
      {
        id: "archived",
        label: "Archived",
        localPath: "/tmp/a",
        projectId: "a",
        projectName: "A",
        repositoryPath: "/tmp/a",
        sessionBranchName: "main",
        status: "archived",
        updatedAt: "2026-04-22T10:00:00.000Z",
      },
      {
        id: "active-old",
        label: "Active Old",
        localPath: "/tmp/b",
        projectId: "b",
        projectName: "B",
        repositoryPath: "/tmp/b",
        sessionBranchName: "main",
        status: "active",
        updatedAt: "2026-04-22T09:00:00.000Z",
      },
      {
        id: "active-new",
        label: "Active New",
        localPath: "/tmp/c",
        projectId: "c",
        projectName: "C",
        repositoryPath: "/tmp/c",
        sessionBranchName: "main",
        status: "active",
        updatedAt: "2026-04-22T11:00:00.000Z",
      },
    ]),
  );

  assert.deepEqual(sessions.map((session) => session.id), [
    "active-new",
    "active-old",
    "archived",
  ]);
});

test("findPullRequestDevSession prefers active sessions linked to the pull request", () => {
  const sessions = normalizeDevSessions([
    {
      id: "archived-pr",
      label: "Archived",
      linkedPullRequestId: "pr-42",
      localPath: "/tmp/archived",
      projectId: "repo-1",
      projectName: "DevDeck",
      repositoryPath: "/tmp/repo-1",
      sessionBranchName: "review-pr-42",
      status: "archived",
      updatedAt: "2026-04-22T08:00:00.000Z",
    },
    {
      id: "active-pr",
      label: "Review #42",
      linkedPullRequestId: "pr-42",
      localPath: "/tmp/active",
      projectId: "repo-1",
      projectName: "DevDeck",
      repositoryPath: "/tmp/repo-1",
      sessionBranchName: "review-pr-42",
      status: "active",
      updatedAt: "2026-04-22T10:00:00.000Z",
    },
  ]);

  assert.equal(findPullRequestDevSession(sessions, "pr-42")?.id, "active-pr");
});

test("findProjectDevSession prefers repository-wide sessions before PR-specific ones", () => {
  const sessions = normalizeDevSessions([
    {
      id: "pr-session",
      label: "Review #42",
      linkedPullRequestId: "pr-42",
      localPath: "/tmp/pr",
      projectId: "repo-1",
      projectName: "DevDeck",
      repositoryPath: "/tmp/repo-1",
      sessionBranchName: "review-pr-42",
      status: "active",
      updatedAt: "2026-04-22T10:00:00.000Z",
    },
    {
      id: "project-session",
      label: "DevDeck Session",
      localPath: "/tmp/project",
      projectId: "repo-1",
      projectName: "DevDeck",
      repositoryPath: "/tmp/repo-1",
      sessionBranchName: "main",
      status: "active",
      updatedAt: "2026-04-22T09:00:00.000Z",
    },
  ]);

  assert.equal(findProjectDevSession(sessions, "repo-1")?.id, "project-session");
});

test("findDuplicateDevSession matches existing clone sessions by repository and linked PR", () => {
  const sessions = normalizeDevSessions([
    {
      id: "clone-pr",
      kind: "existing_clone",
      label: "Review #42 · Linked Clone",
      linkedPullRequestId: "pr-42",
      localPath: "/tmp/repo-1",
      projectId: "repo-1",
      projectName: "DevDeck",
      repositoryPath: "/tmp/repo-1",
      sessionBranchName: "feature/review-42",
      status: "active",
      updatedAt: "2026-04-22T10:00:00.000Z",
    },
  ]);

  assert.equal(
    findDuplicateDevSession(sessions, {
      kind: "existing_clone",
      linkedPullRequestId: "pr-42",
      projectId: "repo-1",
    })?.id,
    "clone-pr",
  );
});

test("findDuplicateDevSession matches worktrees by repository, PR and branch", () => {
  const sessions = normalizeDevSessions([
    {
      id: "worktree-pr",
      kind: "worktree",
      label: "Review #42",
      linkedPullRequestId: "pr-42",
      localPath: "/tmp/review-pr-42",
      projectId: "repo-1",
      projectName: "DevDeck",
      repositoryPath: "/tmp/repo-1",
      sessionBranchName: "review-pr-42",
      status: "active",
      updatedAt: "2026-04-22T10:00:00.000Z",
    },
  ]);

  assert.equal(
    findDuplicateDevSession(sessions, {
      kind: "worktree",
      linkedPullRequestId: "pr-42",
      projectId: "repo-1",
      sessionBranchName: "review-pr-42",
    })?.id,
    "worktree-pr",
  );
});
