import type { TeamInsightsMemberStats } from "@shared/workspace";

export function getTeamMemberScore(member: TeamInsightsMemberStats) {
  return (
    member.mergedPullRequests * 5 +
    member.reviewsSubmitted * 4 +
    member.activeClaimCount * 3 +
    member.openedPullRequests * 2 +
    member.commits
  );
}

export function rankTeamMembers(members: TeamInsightsMemberStats[]) {
  return [...members].sort((left, right) => {
    return (
      getTeamMemberScore(right) - getTeamMemberScore(left) ||
      right.mergedPullRequests - left.mergedPullRequests ||
      right.reviewsSubmitted - left.reviewsSubmitted ||
      left.login.localeCompare(right.login)
    );
  });
}

export function getTeamMemberBadges(
  member: TeamInsightsMemberStats,
  members: TeamInsightsMemberStats[],
) {
  const badges: string[] = [];
  const topMerged = Math.max(...members.map((candidate) => candidate.mergedPullRequests), 0);
  const topReviews = Math.max(...members.map((candidate) => candidate.reviewsSubmitted), 0);
  const topClaims = Math.max(...members.map((candidate) => candidate.activeClaimCount), 0);
  const topCommits = Math.max(...members.map((candidate) => candidate.commits), 0);

  if (topMerged > 0 && member.mergedPullRequests === topMerged) {
    badges.push("Merge Driver");
  }

  if (topReviews > 0 && member.reviewsSubmitted === topReviews) {
    badges.push("Review Lead");
  }

  if (topClaims > 0 && member.activeClaimCount === topClaims) {
    badges.push("Queue Captain");
  }

  if (topCommits > 0 && member.commits === topCommits) {
    badges.push("Commit Momentum");
  }

  if (
    member.openedPullRequests > 0 &&
    member.mergedPullRequests > 0 &&
    member.reviewsSubmitted > 0
  ) {
    badges.push("All-Rounder");
  }

  return badges.slice(0, 3);
}
