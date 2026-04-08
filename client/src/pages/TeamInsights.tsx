import type { TeamInsightsMemberStats } from "@shared/workspace";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { getDesktopApi } from "@/lib/desktop";
import { getTeamMemberBadges, rankTeamMembers } from "@/lib/team-insights";

const PERIOD_OPTIONS = [
  { days: 7, label: "7 Days" },
  { days: 30, label: "30 Days" },
  { days: 90, label: "90 Days" },
] as const;

export default function TeamInsights() {
  const desktopApi = getDesktopApi();
  const [selectedMemberLogin, setSelectedMemberLogin] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = usePersistentState<string>(
    "devdeck:team-insights:team",
    "",
  );
  const [periodDays, setPeriodDays] = usePersistentState<7 | 30 | 90>(
    "devdeck:team-insights:period",
    30,
  );
  const formatCount = (value: number) => new Intl.NumberFormat().format(value);

  const teamsQuery = useQuery({
    enabled: Boolean(desktopApi),
    queryKey: ["team-insights", "teams"],
    queryFn: () => desktopApi!.listGitHubTeams(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedTeam =
    teamsQuery.data?.find((team) => team.id === selectedTeamId) ??
    teamsQuery.data?.[0] ??
    null;

  useEffect(() => {
    if (!selectedTeamId && teamsQuery.data?.[0]?.id) {
      setSelectedTeamId(teamsQuery.data[0].id);
      return;
    }

    if (
      selectedTeamId &&
      teamsQuery.data &&
      !teamsQuery.data.some((team) => team.id === selectedTeamId)
    ) {
      setSelectedTeamId(teamsQuery.data[0]?.id ?? "");
    }
  }, [selectedTeamId, setSelectedTeamId, teamsQuery.data]);

  const insightsQuery = useQuery({
    enabled: Boolean(desktopApi && selectedTeam),
    queryKey: ["team-insights", selectedTeam?.id ?? "none", periodDays],
    queryFn: () =>
      desktopApi!.loadTeamInsights({
        organizationLogin: selectedTeam!.organizationLogin,
        periodDays,
        teamSlug: selectedTeam!.slug,
      }),
    staleTime: 60 * 1000,
  });

  const rankedMembers = useMemo(
    () => rankTeamMembers(insightsQuery.data?.members ?? []),
    [insightsQuery.data?.members],
  );
  const selectedMember = useMemo(
    () =>
      rankedMembers.find((member) => member.login === selectedMemberLogin) ?? null,
    [rankedMembers, selectedMemberLogin],
  );

  const isLoading = teamsQuery.isLoading || insightsQuery.isLoading;
  const errorMessage =
    (teamsQuery.error instanceof Error && teamsQuery.error.message) ||
    (insightsQuery.error instanceof Error && insightsQuery.error.message) ||
    null;
  const formatHours = (value: number | null) =>
    value === null ? "N/A" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}h`;
  const getMemberHighlight = (member: TeamInsightsMemberStats) => {
    const pairs = [
      { label: "merged pull requests", value: member.mergedPullRequests },
      { label: "submitted reviews", value: member.reviewsSubmitted },
      { label: "active claims", value: member.activeClaimCount },
      { label: "opened pull requests", value: member.openedPullRequests },
      { label: "commits", value: member.commits },
    ].sort((left, right) => right.value - left.value);

    const strongestSignal = pairs[0];
    if (!strongestSignal || strongestSignal.value === 0) {
      return "No visible GitHub activity in this window yet.";
    }

    return `Strongest signal: ${strongestSignal.value} ${strongestSignal.label}.`;
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">
              Team Insights
            </h1>
            <p className="text-sm text-muted-foreground">
              Collaboration health for your GitHub team, with light gamification built around useful review behavior.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={selectedTeam?.id ?? ""}
              onChange={(event) => setSelectedTeamId(event.target.value)}
              className="rounded-lg border border-border/60 bg-white px-3 py-2 text-sm text-foreground shadow-sm"
              disabled={!teamsQuery.data?.length}
            >
              {teamsQuery.data?.length ? (
                teamsQuery.data.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.organizationLogin} / {team.name}
                  </option>
                ))
              ) : (
                <option value="">No GitHub teams found</option>
              )}
            </select>
            <div className="flex items-center gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setPeriodDays(option.days)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    periodDays === option.days
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 bg-white text-muted-foreground hover:border-black/15 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!desktopApi ? (
          <div className="rounded-2xl border border-border/60 bg-white/70 p-6 text-sm text-muted-foreground shadow-sm">
            Team Insights is only available in the desktop app, because it needs your local GitHub connection.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-[#cf222e]/20 bg-[#ffebe9] p-6 text-sm text-[#cf222e] shadow-sm">
            {errorMessage.includes("404") || errorMessage.includes("403")
              ? "DevDeck could not read your GitHub teams. Make sure the token has organization visibility, such as read:org or Members:read."
              : errorMessage}
          </div>
        ) : null}

        {!isLoading && desktopApi && !errorMessage && !teamsQuery.data?.length ? (
          <div className="rounded-2xl border border-border/60 bg-white/70 p-6 text-sm text-muted-foreground shadow-sm">
            DevDeck did not find visible GitHub teams for this account yet. Connect an org-scoped token to unlock team insights.
          </div>
        ) : null}

        {selectedTeam && insightsQuery.data ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-7">
              {[
                {
                  label: "Team Members",
                  value: insightsQuery.data.summary.members,
                  note: `${selectedTeam.organizationLogin} / ${selectedTeam.name}`,
                },
                {
                  label: "PRs Opened",
                  value: insightsQuery.data.summary.openedPullRequests,
                  note: "team-wide authored pull requests",
                },
                {
                  label: "Merged PRs",
                  value: insightsQuery.data.summary.mergedPullRequests,
                  note: "merged in this time window",
                },
                {
                  label: "Reviews Submitted",
                  value: insightsQuery.data.summary.reviewsSubmitted,
                  note: "review contributions from GitHub",
                },
                {
                  label: "Active Claims",
                  value: insightsQuery.data.summary.activeClaims,
                  note: "current DevDeck review ownership",
                },
                {
                  label: "Avg. First Review",
                  value: formatHours(insightsQuery.data.summary.averageFirstReviewHours),
                  note: "time from PR open to first review",
                },
                {
                  label: "Avg. Merge Time",
                  value: formatHours(insightsQuery.data.summary.averageMergeHours),
                  note: "time from PR open to merge",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border/60 bg-white/70 p-4 shadow-sm backdrop-blur-md"
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </h3>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    {typeof item.value === "number" ? formatCount(item.value) : item.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-border/60 bg-white/75 p-5 shadow-sm backdrop-blur-md">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    Team Board
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Lightweight recognition for the people moving reviews and merges forward.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated from GitHub at {new Date(insightsQuery.data.generatedAt).toLocaleTimeString()}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {rankedMembers.map((member, index) => {
                  const badges = getTeamMemberBadges(
                    member,
                    insightsQuery.data?.members ?? [],
                  );

                  return (
                    <button
                      key={member.login}
                      type="button"
                      onClick={() => setSelectedMemberLogin(member.login)}
                      className="w-full rounded-xl border border-border/60 bg-white/80 p-4 text-left shadow-sm transition-colors hover:border-black/15"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-secondary text-sm font-semibold text-foreground">
                            {member.avatarUrl ? (
                              <img
                                alt={member.name ?? member.login}
                                className="h-full w-full object-cover"
                                src={member.avatarUrl}
                              />
                            ) : (
                              member.login.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                #{index + 1}
                              </span>
                              <h3 className="truncate text-sm font-semibold text-foreground">
                                {member.name ?? member.login}
                              </h3>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              @{member.login}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {badges.length > 0 ? (
                            badges.map((badge) => (
                              <span
                                key={badge}
                                className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                              >
                                {badge}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Building momentum
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            View details
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                        {[
                          ["Opened", member.openedPullRequests],
                          ["Merged", member.mergedPullRequests],
                          ["Reviews", member.reviewsSubmitted],
                          ["Claims", member.activeClaimCount],
                          ["Commits", member.commits],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {label}
                            </p>
                            <p className="mt-1 text-lg font-semibold text-foreground">
                              {formatCount(Number(value))}
                            </p>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : isLoading && desktopApi ? (
          <div className="rounded-2xl border border-border/60 bg-white/70 p-6 text-sm text-muted-foreground shadow-sm">
            Loading team collaboration data from GitHub...
          </div>
        ) : null}

        <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => {
          if (!open) {
            setSelectedMemberLogin(null);
          }
        }}>
          <DialogContent className="sm:max-w-xl">
            {selectedMember ? (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {selectedMember.name ?? selectedMember.login}
                  </DialogTitle>
                  <DialogDescription>
                    @{selectedMember.login} · {selectedTeam?.organizationLogin} / {selectedTeam?.name}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {getTeamMemberBadges(selectedMember, insightsQuery.data?.members ?? []).map(
                      (badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                        >
                          {badge}
                        </span>
                      ),
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {getMemberHighlight(selectedMember)}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Opened PRs", selectedMember.openedPullRequests],
                      ["Merged PRs", selectedMember.mergedPullRequests],
                      ["Reviews Submitted", selectedMember.reviewsSubmitted],
                      ["Active Claims", selectedMember.activeClaimCount],
                      ["Commits", selectedMember.commits],
                      ["Avg. First Review", formatHours(selectedMember.averageFirstReviewHours)],
                      ["Avg. Merge Time", formatHours(selectedMember.averageMergeHours)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-border/50 bg-secondary/25 px-3 py-3"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-foreground">
                          {typeof value === "number" ? formatCount(value) : value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
