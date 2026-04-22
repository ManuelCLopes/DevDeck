import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { DevSessionOperationalSnapshot } from "@shared/sessions";
import AppLayout from "@/components/layout/AppLayout";
import CreateSessionDialog from "@/components/sessions/CreateSessionDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { navigateInApp } from "@/lib/app-navigation";
import { getDesktopApi } from "@/lib/desktop";
import {
  DEV_SESSIONS_STORAGE_KEY,
  normalizeDevSessions,
  sortDevSessions,
  type DevSession,
} from "@/lib/dev-sessions";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Archive,
  FolderOpen,
  FolderTree,
  Github,
  Loader2,
  RotateCcw,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import OpenInCodeButton from "@/components/coding-tool/OpenInCodeButton";

export default function Sessions() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { data: snapshot } = useWorkspaceSnapshot();
  const desktopApi = getDesktopApi();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [pendingRemovalSession, setPendingRemovalSession] = useState<DevSession | null>(
    null,
  );
  const [isLoadingSessionStatus, setIsLoadingSessionStatus] = useState(false);
  const [sessionSnapshotsById, setSessionSnapshotsById] = useState<
    Record<string, DevSessionOperationalSnapshot>
  >({});
  const [sessions, setSessions] = usePersistentState<DevSession[]>(
    DEV_SESSIONS_STORAGE_KEY,
    [],
    {
      deserialize: (value) => normalizeDevSessions(JSON.parse(value)),
    },
  );

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const shouldOpenCreateDialog = searchParams.get("create") === "1";
  const initialProjectId = searchParams.get("project");
  const initialPullRequestId = searchParams.get("pr");

  useEffect(() => {
    if (shouldOpenCreateDialog) {
      setIsCreateDialogOpen(true);
    }
  }, [shouldOpenCreateDialog]);

  useEffect(() => {
    if (!desktopApi?.inspectDevSessions) {
      setSessionSnapshotsById({});
      return;
    }

    if (sessions.length === 0) {
      setSessionSnapshotsById({});
      return;
    }

    let cancelled = false;
    setIsLoadingSessionStatus(true);

    void desktopApi
      .inspectDevSessions(
        sessions.map((session) => ({
          localPath: session.localPath,
          repositoryPath: session.repositoryPath,
          sessionId: session.id,
        })),
      )
      .then((snapshots) => {
        if (cancelled) {
          return;
        }

        setSessionSnapshotsById(
          Object.fromEntries(
            snapshots.map((snapshot) => [snapshot.sessionId, snapshot]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSessionSnapshotsById({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSessionStatus(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopApi, sessions]);

  const sortedSessions = useMemo(() => sortDevSessions(sessions), [sessions]);
  const activeSessions = sortedSessions.filter((session) => session.status === "active");
  const archivedSessions = sortedSessions.filter(
    (session) => session.status === "archived",
  );
  const linkedPullRequests = snapshot?.pullRequests ?? [];
  const linkedPullRequestsById = useMemo(
    () => new Map(linkedPullRequests.map((pullRequest) => [pullRequest.id, pullRequest])),
    [linkedPullRequests],
  );
  const trackedProjects = snapshot?.projects ?? [];

  const isReadyToCleanUp = (
    session: DevSession,
    sessionSnapshot: DevSessionOperationalSnapshot | undefined,
  ) => {
    if (!sessionSnapshot || session.kind !== "worktree") {
      return false;
    }

    if (
      !sessionSnapshot.exists ||
      !sessionSnapshot.isRepository ||
      sessionSnapshot.hasUncommittedChanges ||
      sessionSnapshot.isDetached ||
      !sessionSnapshot.currentBranch ||
      sessionSnapshot.currentBranch === sessionSnapshot.defaultBranch
    ) {
      return false;
    }

    return sessionSnapshot.uniqueCommitCount === 0;
  };

  const dirtySessionCount = activeSessions.filter(
    (session) => sessionSnapshotsById[session.id]?.hasUncommittedChanges,
  ).length;
  const behindSessionCount = activeSessions.filter(
    (session) => (sessionSnapshotsById[session.id]?.behindBy ?? 0) > 0,
  ).length;
  const cleanupCandidateCount = activeSessions.filter((session) =>
    isReadyToCleanUp(session, sessionSnapshotsById[session.id]),
  ).length;

  const updateSession = (sessionId: string, updater: (session: DevSession) => DevSession) => {
    setSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === sessionId ? updater(session) : session,
      ),
    );
  };

  const removeSession = (sessionId: string) => {
    setSessions((currentSessions) =>
      currentSessions.filter((session) => session.id !== sessionId),
    );
  };

  const openInTerminal = async (session: DevSession) => {
    await desktopApi?.openInTerminal?.(session.localPath);
  };

  const revealInFinder = async (session: DevSession) => {
    await desktopApi?.showItemInFinder?.(session.localPath);
  };

  const openLinkedPullRequest = async (session: DevSession) => {
    if (!session.linkedPullRequestId) {
      return;
    }

    const pullRequest = linkedPullRequests.find(
      (candidate) => candidate.id === session.linkedPullRequestId,
    );
    if (!pullRequest) {
      return;
    }

    if (desktopApi) {
      await desktopApi.openExternal(pullRequest.url);
      return;
    }

    window.open(pullRequest.url, "_blank", "noopener,noreferrer");
  };

  const handleArchiveSession = (sessionId: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      status: "archived",
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleRestoreSession = (sessionId: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      status: "active",
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleDeleteWorktree = async (session: DevSession) => {
    try {
      await desktopApi?.removeGitWorktreeSession?.({
        repositoryPath: session.repositoryPath,
        worktreePath: session.localPath,
      });
      removeSession(session.id);
      toast({
        title: "Worktree removed",
        description: `${session.label} was removed from disk and from DevDeck.`,
      });
    } catch (error) {
      toast({
        title: "Worktree removal failed",
        description:
          error instanceof Error
            ? error.message
            : "DevDeck could not remove that worktree.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveMetadataOnly = (session: DevSession) => {
    removeSession(session.id);
  };

  const confirmRemoval = async () => {
    if (!pendingRemovalSession) {
      return;
    }

    const session = pendingRemovalSession;
    setPendingRemovalSession(null);

    if (session.kind === "worktree") {
      await handleDeleteWorktree(session);
      return;
    }

    handleRemoveMetadataOnly(session);
  };

  const closeCreateDialog = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open && shouldOpenCreateDialog) {
      navigateInApp("/sessions", setLocation);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">
              Sessions
            </h1>
            <p className="text-sm text-muted-foreground">
              Launch repositories fast, keep parallel work clean, and use worktrees when the same repo needs multiple contexts.
            </p>
          </div>
          <Button type="button" onClick={() => setIsCreateDialogOpen(true)}>
            New Session
          </Button>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Active Sessions",
              note: "currently ready to open",
              value: activeSessions.length,
            },
            {
              label: "Dirty Sessions",
              note: "uncommitted local changes",
              value: dirtySessionCount,
            },
            {
              label: "Behind Upstream",
              note: "need pull or rebase",
              value: behindSessionCount,
            },
            {
              label: "Ready To Clean Up",
              note: "no unique work left in context",
              value: cleanupCandidateCount,
            },
            {
              label: "Archived",
              note: "closed but kept for later",
              value: archivedSessions.length,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border/60 bg-white/70 p-4 shadow-sm backdrop-blur-md"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {card.label}
              </h3>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {new Intl.NumberFormat().format(card.value)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-border/60 bg-white/75 p-5 shadow-sm backdrop-blur-md">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Active Sessions
              </h2>
              <p className="text-sm text-muted-foreground">
                Treat these as active working contexts, with live local git status.
              </p>
            </div>
            {isLoadingSessionStatus ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Refreshing status…
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {activeSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No sessions yet. Start with an existing clone or create a dedicated worktree.
              </div>
            ) : (
              activeSessions.map((session) => {
                const linkedPullRequest = session.linkedPullRequestId
                  ? linkedPullRequestsById.get(session.linkedPullRequestId) ?? null
                  : null;
                const trackedProject = trackedProjects.find(
                  (project) => project.id === session.projectId,
                );
                const sessionSnapshot = sessionSnapshotsById[session.id];
                const sessionUnavailable =
                  sessionSnapshot &&
                  (!sessionSnapshot.exists || !sessionSnapshot.isRepository);
                const readyToCleanUp = isReadyToCleanUp(session, sessionSnapshot);
                const lastCommitDistance =
                  sessionSnapshot?.lastCommitCommittedAt
                    ? formatDistanceToNow(
                        new Date(sessionSnapshot.lastCommitCommittedAt),
                        { addSuffix: true },
                      )
                    : null;

                return (
                  <div
                    key={session.id}
                    className="rounded-xl border border-border/60 bg-white/85 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                            {session.kind === "worktree" ? "Worktree" : "Existing Clone"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              navigateInApp(`/?project=${encodeURIComponent(session.projectId)}`, setLocation)
                            }
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getProjectTagClassName(session.projectName)}`}
                          >
                            {session.projectName}
                          </button>
                          {linkedPullRequest ? (
                            <button
                              type="button"
                              onClick={() => void openLinkedPullRequest(session)}
                              className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                            >
                              PR #{linkedPullRequest.number}
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          {sessionSnapshot ? (
                            sessionUnavailable ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cf222e]/20 bg-[#ffebe9] px-2.5 py-1 font-medium text-[#cf222e]">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Session path unavailable
                              </span>
                            ) : (
                              <>
                                <span
                                  className={`rounded-full border px-2.5 py-1 font-medium ${
                                    sessionSnapshot.hasUncommittedChanges
                                      ? "border-chart-3/20 bg-chart-3/10 text-chart-3"
                                      : "border-chart-1/20 bg-chart-1/10 text-chart-1"
                                  }`}
                                >
                                  {sessionSnapshot.hasUncommittedChanges ? "Dirty" : "Clean"}
                                </span>
                                {sessionSnapshot.hasUpstream ? (
                                  <span className="rounded-full border border-border/60 bg-white px-2.5 py-1 font-medium text-muted-foreground">
                                    {sessionSnapshot.aheadBy} ahead · {sessionSnapshot.behindBy} behind
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-border/60 bg-white px-2.5 py-1 font-medium text-muted-foreground">
                                    No upstream
                                  </span>
                                )}
                                {readyToCleanUp ? (
                                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-medium text-primary">
                                    Ready to clean up
                                  </span>
                                ) : null}
                              </>
                            )
                          ) : null}
                        </div>

                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {session.label}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Branch{" "}
                            <span className="font-medium text-foreground">
                              {sessionSnapshot?.currentBranch ??
                                (sessionSnapshot?.isDetached
                                  ? "detached"
                                  : session.sessionBranchName)}
                            </span>
                            {sessionSnapshot?.currentBranch &&
                            sessionSnapshot.currentBranch !== session.sessionBranchName ? (
                              <>
                                {" "}· tracked as{" "}
                                <span className="font-medium text-foreground">
                                  {session.sessionBranchName}
                                </span>
                              </>
                            ) : null}
                            {session.sourceRef ? (
                              <>
                                {" "}· from{" "}
                                <span className="font-medium text-foreground">{session.sourceRef}</span>
                              </>
                            ) : null}
                          </p>
                        </div>

                        <div className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
                          <p className="break-all font-mono text-[11px] text-foreground">
                            {session.localPath}
                          </p>
                          {sessionSnapshot?.lastCommitSubject ? (
                            <>
                              <p className="mt-1 break-words text-foreground">
                                {sessionSnapshot.lastCommitShortSha ? (
                                  <span className="font-mono text-[11px]">
                                    {sessionSnapshot.lastCommitShortSha}
                                  </span>
                                ) : null}
                                {sessionSnapshot.lastCommitShortSha ? " · " : ""}
                                {sessionSnapshot.lastCommitSubject}
                              </p>
                              <p className="mt-1">
                                Last commit {lastCommitDistance}
                                {trackedProject?.remoteUrl ? " · remote linked" : " · local only"}
                              </p>
                            </>
                          ) : (
                            <p className="mt-1">
                              Updated{" "}
                              {formatDistanceToNow(new Date(session.updatedAt), {
                                addSuffix: true,
                              })}
                              {trackedProject?.remoteUrl ? " · remote linked" : " · local only"}
                            </p>
                          )}
                          {readyToCleanUp ? (
                            <p className="mt-1 text-primary">
                              No unique work remains in this branch context. Safe to delete when finished.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <OpenInCodeButton
                          targetPath={session.localPath}
                          disabled={Boolean(sessionUnavailable)}
                          variant="outline"
                          size="sm"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void openInTerminal(session)}
                          className="gap-1.5"
                          disabled={Boolean(sessionUnavailable)}
                        >
                          <SquareTerminal className="h-3.5 w-3.5" />
                          Terminal
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void revealInFinder(session)}
                          className="gap-1.5"
                          disabled={Boolean(sessionUnavailable)}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Finder
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleArchiveSession(session.id)}
                          className="gap-1.5"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archive
                        </Button>
                        {linkedPullRequest ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void openLinkedPullRequest(session)}
                            className="gap-1.5"
                          >
                            <Github className="h-3.5 w-3.5" />
                            PR
                          </Button>
                        ) : null}
                        {session.kind === "worktree" ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingRemovalSession(session)}
                            className="gap-1.5 text-[#cf222e] hover:text-[#cf222e]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {readyToCleanUp ? "Clean Up" : "Delete Worktree"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPendingRemovalSession(session)}
                            className="gap-1.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {archivedSessions.length > 0 ? (
          <section className="rounded-2xl border border-border/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Archived Sessions
              </h2>
              <p className="text-sm text-muted-foreground">
                Keep context around without leaving it in the active lane.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {archivedSessions.map((session) => {
                const sessionSnapshot = sessionSnapshotsById[session.id];

                return (
                  <div
                    key={session.id}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 bg-white/85 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{session.label}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.projectName} ·{" "}
                        {sessionSnapshot?.currentBranch ?? session.sessionBranchName} · archived{" "}
                        {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleRestoreSession(session.id)}
                        className="gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPendingRemovalSession(session)}
                        className="gap-1.5"
                      >
                        {session.kind === "worktree" ? (
                          <>
                            <FolderTree className="h-3.5 w-3.5" />
                            Delete Worktree
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

        <CreateSessionDialog
          existingSessions={sessions}
          initialProjectId={initialProjectId}
          initialPullRequestId={initialPullRequestId}
          onOpenChange={closeCreateDialog}
        onSessionCreated={(session) =>
          setSessions((currentSessions) => [session, ...currentSessions])
        }
        open={isCreateDialogOpen}
        projects={trackedProjects}
        pullRequests={linkedPullRequests}
        />
        <AlertDialog
          open={Boolean(pendingRemovalSession)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingRemovalSession(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingRemovalSession?.kind === "worktree"
                  ? "Delete worktree session?"
                  : "Remove session from DevDeck?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingRemovalSession?.kind === "worktree"
                  ? `This removes ${pendingRemovalSession?.label} from DevDeck and deletes the worktree at ${pendingRemovalSession?.localPath}.`
                  : `This removes ${pendingRemovalSession?.label} from DevDeck, but leaves the repository files untouched.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  pendingRemovalSession?.kind === "worktree"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : undefined
                }
                onClick={() => void confirmRemoval()}
              >
                {pendingRemovalSession?.kind === "worktree"
                  ? "Delete Worktree"
                  : "Remove Session"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </AppLayout>
  );
}
