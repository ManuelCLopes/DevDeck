import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { DevSessionOperationalSnapshot } from "@shared/sessions";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { navigateInApp } from "@/lib/app-navigation";
import { useCodingTool } from "@/hooks/use-coding-tool";
import { getDesktopApi } from "@/lib/desktop";
import {
  buildTerminalsPath,
  buildDefaultSessionLabel,
  createSessionId,
  DEV_SESSIONS_STORAGE_KEY,
  findDuplicateDevSession,
  normalizeDevSessions,
  sortDevSessions,
  type DevSession,
} from "@/lib/dev-sessions";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import {
  Check,
  Archive,
  Pencil,
  RotateCcw,
  SquareTerminal,
  X,
} from "lucide-react";

export default function Sessions() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { data: snapshot } = useWorkspaceSnapshot();
  const { availability: codingToolAvailability } = useCodingTool();
  const desktopApi = getDesktopApi();
  const autoCreateHandledKeyRef = useRef<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
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
  const shouldAutoCreateSession = searchParams.get("create") === "1";
  const initialProjectId = searchParams.get("project");
  const initialPullRequestId = searchParams.get("pr");

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
  const trackedProjects = snapshot?.projects ?? [];

  const updateSession = (sessionId: string, updater: (session: DevSession) => DevSession) => {
    setSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === sessionId ? updater(session) : session,
      ),
    );
  };

  const openEmbeddedTerminal = (session: DevSession) => {
    navigateInApp(buildTerminalsPath(session.id, { launch: "opencode" }), setLocation);
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

  const beginEditingSession = (session: DevSession) => {
    setEditingSessionId(session.id);
    setDraftLabel(session.label);
  };

  const cancelEditingSession = () => {
    setEditingSessionId(null);
    setDraftLabel("");
  };

  const saveSessionLabel = (sessionId: string) => {
    const nextLabel = draftLabel.trim();
    if (!nextLabel) {
      toast({
        title: "Name required",
        description: "OpenCode sessions need a visible name.",
        variant: "destructive",
      });
      return;
    }

    updateSession(sessionId, (session) => ({
      ...session,
      label: nextLabel,
      updatedAt: new Date().toISOString(),
    }));
    cancelEditingSession();
  };

  useEffect(() => {
    if (!shouldAutoCreateSession) {
      autoCreateHandledKeyRef.current = null;
      return;
    }

    if (!snapshot || !initialProjectId) {
      return;
    }

    const targetProject = trackedProjects.find((project) => project.id === initialProjectId);
    if (!targetProject?.localPath) {
      if (autoCreateHandledKeyRef.current === "missing-project") {
        return;
      }

      autoCreateHandledKeyRef.current = "missing-project";
      toast({
        title: "Repository not available",
        description:
          "DevDeck could not start an OpenCode session because the linked local repository was not found.",
        variant: "destructive",
      });
      navigateInApp("/sessions", setLocation);
      return;
    }

    const targetPullRequest =
      initialPullRequestId != null
        ? linkedPullRequests.find((pullRequest) => pullRequest.id === initialPullRequestId) ??
          null
        : null;

    const autoCreateKey = `${targetProject.id}:${targetPullRequest?.id ?? "none"}`;
    if (autoCreateHandledKeyRef.current === autoCreateKey) {
      return;
    }

    autoCreateHandledKeyRef.current = autoCreateKey;

    const existingSession = findDuplicateDevSession(sessions, {
      kind: "existing_clone",
      linkedPullRequestId: targetPullRequest?.id ?? null,
      projectId: targetProject.id,
    });
    if (existingSession) {
      navigateInApp(buildTerminalsPath(existingSession.id, { launch: "opencode" }), setLocation);
      return;
    }

    const sessionBranchName = targetPullRequest?.headBranch ?? targetProject.currentBranch;
    const now = new Date().toISOString();
    const nextSession: DevSession = {
      createdAt: now,
      id: createSessionId(),
      kind: "existing_clone",
      label: buildDefaultSessionLabel({
        kind: "existing_clone",
        projectName: targetProject.name,
        pullRequestNumber: targetPullRequest?.number ?? null,
        sessionBranchName,
      }),
      linkedPullRequestId: targetPullRequest?.id ?? null,
      linkedPullRequestNumber: targetPullRequest?.number ?? null,
      linkedPullRequestTitle: targetPullRequest?.title ?? null,
      localPath: targetProject.localPath,
      projectId: targetProject.id,
      projectName: targetProject.name,
      repositoryPath: targetProject.localPath,
      repositorySlug: targetPullRequest?.repositorySlug ?? null,
      sessionBranchName,
      sourceRef: targetPullRequest?.headBranch ?? targetProject.currentBranch,
      status: "active",
      updatedAt: now,
    };

    setSessions((currentSessions) => [nextSession, ...currentSessions]);
    navigateInApp(buildTerminalsPath(nextSession.id, { launch: "opencode" }), setLocation);
  }, [
    initialProjectId,
    initialPullRequestId,
    linkedPullRequests,
    sessions,
    setLocation,
    setSessions,
    shouldAutoCreateSession,
    snapshot,
    trackedProjects,
  ]);

  const renderSessionRow = (session: DevSession, options?: { archived?: boolean }) => {
    const archived = options?.archived ?? false;
    const sessionSnapshot = sessionSnapshotsById[session.id];
    const sessionUnavailable =
      sessionSnapshot && (!sessionSnapshot.exists || !sessionSnapshot.isRepository);
    const isEditing = editingSessionId === session.id;

    return (
      <div
        key={session.id}
        className="grid gap-4 border-t border-border/50 px-4 py-4 first:border-t-0 md:grid-cols-[180px_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center"
      >
        <div className="min-w-0">
          <span className="font-mono text-[12px] text-foreground">{session.id}</span>
        </div>

        <div className="min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="h-9 min-w-0 flex-1 rounded-md border border-border/60 bg-white px-3 text-sm text-foreground outline-none ring-0 transition focus:border-foreground/40"
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveSessionLabel(session.id);
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditingSession();
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => saveSessionLabel(session.id)}
                title="Save name"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={cancelEditingSession}
                title="Cancel rename"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {session.label}
              </div>
              {sessionUnavailable ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Local repository unavailable
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <span className={getProjectTagClassName(session.projectName, "px-2.5 py-1")}>
            {session.projectName}
          </span>
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
          {!isEditing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => beginEditingSession(session)}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
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
              Sessions appear here automatically when you start OpenCode from a repository or pull request. Rename them, open them, or archive them.
            </p>
            {!codingToolAvailability.opencode.available ? (
              <p className="mt-2 text-xs text-muted-foreground">
                OpenCode is not currently available on this machine. DevDeck will still keep the session records and open their linked terminal contexts.
              </p>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl border border-border/60 bg-white/75 p-5 shadow-sm backdrop-blur-md">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Active OpenCode Sessions
              </h2>
              <p className="text-sm text-muted-foreground">
                Sessions are created automatically from repository and pull request entry points.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                {activeSessions.length} active
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border/50 bg-white/70">
            {activeSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No OpenCode sessions yet. Start OpenCode from a repository or pull request and DevDeck will add the session automatically.
              </div>
            ) : (
              <>
                <div className="hidden gap-4 border-b border-border/50 bg-secondary/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[180px_minmax(0,1.6fr)_minmax(0,1fr)_auto]">
                  <div>Session</div>
                  <div>Name</div>
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
                Archived sessions stay available until you restore them.
              </p>
            </div>
              <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                {archivedSessions.length} archived
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border/50 bg-white/70">
              <div className="hidden gap-4 border-b border-border/50 bg-secondary/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[180px_minmax(0,1.6fr)_minmax(0,1fr)_auto]">
                <div>Session</div>
                <div>Name</div>
                <div>Repository</div>
                <div className="text-right">Access</div>
              </div>
              {archivedSessions.map((session) => renderSessionRow(session, { archived: true }))}
            </div>
          </section>
        ) : null}
      </div>
    </AppLayout>
  );
}
