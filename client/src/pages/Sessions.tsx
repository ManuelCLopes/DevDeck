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
import { useCodingTool } from "@/hooks/use-coding-tool";
import { getDesktopApi } from "@/lib/desktop";
import {
  buildTerminalsPath,
  DEV_SESSIONS_STORAGE_KEY,
  normalizeDevSessions,
  sortDevSessions,
  type DevSession,
} from "@/lib/dev-sessions";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import {
  Archive,
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
  const { availability: codingToolAvailability } = useCodingTool();
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
  const formatCount = (value: number) => new Intl.NumberFormat().format(value);

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

  const openEmbeddedTerminal = (session: DevSession) => {
    navigateInApp(buildTerminalsPath(session.id, { launch: "opencode" }), setLocation);
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

  const renderSessionRow = (session: DevSession, options?: { archived?: boolean }) => {
    const archived = options?.archived ?? false;
    const linkedPullRequest = session.linkedPullRequestId
      ? linkedPullRequestsById.get(session.linkedPullRequestId) ?? null
      : null;
    const sessionSnapshot = sessionSnapshotsById[session.id];
    const sessionUnavailable =
      sessionSnapshot && (!sessionSnapshot.exists || !sessionSnapshot.isRepository);
    return (
      <div
        key={session.id}
        className="grid gap-4 border-t border-border/50 px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_auto] md:items-center"
      >
        <div className="min-w-0">
          <span className="font-mono text-[12px] text-foreground">{session.id}</span>
        </div>

        <div className="min-w-0">
          <button
            type="button"
            onClick={() =>
              navigateInApp(`/?project=${encodeURIComponent(session.projectId)}`, setLocation)
            }
            className={getProjectTagClassName(session.projectName, "px-2.5 py-1")}
          >
            {session.projectName}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button
            type="button"
            onClick={() => openEmbeddedTerminal(session)}
            className="gap-1.5"
            size="sm"
            disabled={Boolean(sessionUnavailable)}
          >
            <SquareTerminal className="h-3.5 w-3.5" />
            Open in Terminals
          </Button>
          <OpenInCodeButton
            targetPath={session.localPath}
            disabled={Boolean(sessionUnavailable)}
            variant="outline"
            size="sm"
          />
          {linkedPullRequest ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openLinkedPullRequest(session)}
              className="gap-1.5"
            >
              <Github className="h-3.5 w-3.5" />
              PR
            </Button>
          ) : null}
          {archived ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleRestoreSession(session.id)}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleArchiveSession(session.id)}
              className="gap-1.5"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPendingRemovalSession(session)}
            className={
              session.kind === "worktree"
                ? "gap-1.5 text-[#cf222e] hover:text-[#cf222e]"
                : "gap-1.5"
            }
          >
            {session.kind === "worktree" ? (
              <FolderTree className="h-3.5 w-3.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {session.kind === "worktree" ? "Delete Worktree" : "Remove"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">
              OpenCode Sessions
            </h1>
            <p className="text-sm text-muted-foreground">
              A simple list of your saved OpenCode contexts. Open a session in Terminals, then launch OpenCode or other tools from the right repository state.
            </p>
            {!codingToolAvailability.opencode.available ? (
              <p className="mt-2 text-xs text-muted-foreground">
                OpenCode is not currently available on this machine. DevDeck will still keep the session structure ready and let you open the same context in the embedded terminal or your fallback coding tool.
              </p>
            ) : null}
          </div>
          <Button type="button" onClick={() => setIsCreateDialogOpen(true)}>
            New OpenCode Session
          </Button>
        </div>

        <section className="rounded-2xl border border-border/60 bg-white/75 p-5 shadow-sm backdrop-blur-md">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Active OpenCode Sessions
              </h2>
              <p className="text-sm text-muted-foreground">
                Session ID, repository, and direct access to the terminal workspace.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                {formatCount(activeSessions.length)} active
              </span>
            {isLoadingSessionStatus ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Refreshing status…
              </div>
            ) : null}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border/50 bg-white/70">
            {activeSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No OpenCode sessions yet. Start from a linked clone or create a dedicated review worktree.
              </div>
            ) : (
              <>
                <div className="hidden gap-4 border-b border-border/50 bg-secondary/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_auto]">
                  <div>Session</div>
                  <div>Repository</div>
                  <div className="text-right">Access</div>
                </div>
                {activeSessions.map((session) => renderSessionRow(session))}
              </>
            )}
          </div>
        </section>

        {archivedSessions.length > 0 ? (
          <section className="rounded-2xl border border-border/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
            <div className="flex items-end justify-between gap-4">
              <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Archived OpenCode Sessions
              </h2>
              <p className="text-sm text-muted-foreground">
                Older contexts stay available here until you restore or remove them.
              </p>
            </div>
              <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                {formatCount(archivedSessions.length)} archived
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border/50 bg-white/70">
              <div className="hidden gap-4 border-b border-border/50 bg-secondary/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_auto]">
                <div>Session</div>
                <div>Repository</div>
                <div className="text-right">Access</div>
              </div>
              {archivedSessions.map((session) => renderSessionRow(session, { archived: true }))}
            </div>
          </section>
        ) : null}
      </div>

      <CreateSessionDialog
        existingSessions={sessions}
        initialProjectId={initialProjectId}
        initialPullRequestId={initialPullRequestId}
        onOpenChange={closeCreateDialog}
        onSessionActivated={(session) =>
          navigateInApp(
            buildTerminalsPath(session.id, { launch: "opencode" }),
            setLocation,
          )
        }
        onSessionCreated={(session) =>
          setSessions((currentSessions) => [session, ...currentSessions])
        }
        open={isCreateDialogOpen}
        projects={snapshot?.projects ?? []}
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
