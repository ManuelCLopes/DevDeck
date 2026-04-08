import assert from "node:assert/strict";
import test from "node:test";
import {
  getTeamMemberBadges,
  getTeamMemberScore,
  rankTeamMembers,
} from "./team-insights";

const members = [
  {
    activeClaimCount: 2,
    avatarUrl: null,
    commits: 6,
    login: "alice",
    mergedPullRequests: 4,
    name: "Alice",
    openedPullRequests: 5,
    reviewsSubmitted: 7,
  },
  {
    activeClaimCount: 5,
    avatarUrl: null,
    commits: 9,
    login: "bruno",
    mergedPullRequests: 2,
    name: "Bruno",
    openedPullRequests: 1,
    reviewsSubmitted: 3,
  },
  {
    activeClaimCount: 1,
    avatarUrl: null,
    commits: 2,
    login: "carla",
    mergedPullRequests: 1,
    name: "Carla",
    openedPullRequests: 2,
    reviewsSubmitted: 1,
  },
];

test("getTeamMemberScore rewards merged PRs and reviews most strongly", () => {
  assert.ok(getTeamMemberScore(members[0]) > getTeamMemberScore(members[1]));
});

test("rankTeamMembers sorts by weighted contribution score", () => {
  assert.deepEqual(
    rankTeamMembers(members).map((member) => member.login),
    ["alice", "bruno", "carla"],
  );
});

test("getTeamMemberBadges surfaces top collaboration strengths", () => {
  assert.deepEqual(getTeamMemberBadges(members[0], members), [
    "Merge Driver",
    "Review Lead",
    "All-Rounder",
  ]);
  assert.deepEqual(getTeamMemberBadges(members[1], members), [
    "Queue Captain",
    "Commit Momentum",
    "All-Rounder",
  ]);
});
