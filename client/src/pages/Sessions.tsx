import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { OpenCodeSessionRecord } from "@shared/opencode-sessions";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useOpenCodeSessions } from "@/hooks/use-opencode-sessions";
import { toast } from "@/hooks/use-toast";
import { navigateInApp } from "@/lib/app-navigation";
import { getDesktopApi } from "@/lib/desktop";
import { buildTerminalsPath } from "@/lib/dev-sessions";
import { getProjectTagClassName } from "@/lib/project-tag-color";
import {
  AlertTriangle,
  Check,
  Archive,
  Pencil,
  RotateCcw,
  SquareTerminal,
  X,
} from "lucide-react";

const ARCHIVED_OPENCODE_SESSIONS_STORAGE_KEY = "devdeck:archived-opencode-session-ids";

export default function Sessions() {
  const [, setLocation] = useLocation();
  const { error, isAvailable: opencodeAvailable, isLoading, refresh, sessions } =
    useOpenCodeSessions();
  const desktopApi = getDesktopApi();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [archivedSessionIds, setArchivedSessionIds] = usePersistentState<string[]>(
    ARCHIVED_OPENCODE_SESSIONS_STORAGE_KEY,
    [],
  );
  const archivedSessionIdSet = useMemo(
    () => new Set(archivedSessionIds),
    [archivedSessionIds],
  );
  const activeSessions = useMemo(
    () => sessions.filter((session) => !archivedSessionIdSet.has(session.id)),
    [archivedSessionIdSet, sessions],
  );
  const archivedSessions = useMemo(
    () => sessions.filter((session) => archivedSessionIdSet.has(session.id)),
    [archivedSessionIdSet, sessions],
  );

  const openEmbeddedTerminal = (session: OpenCodeSessionRecord) => {
    navigateInApp(buildTerminalsPath(session.id, { launch: "opencode" }), setLocation);
  };

  const handleArchiveSession = (sessionId: string) => {
    setArchivedSessionIds((currentIds) =>
      currentIds.includes(sessionId) ? currentIds : [...currentIds, sessionId],
    );
  };

  const handleRestoreSession = (sessionId: string) => {
    setArchivedSessionIds((currentIds) =>
      currentIds.filter((currentId) => currentId !== sessionId),
    );
  };

  const beginEditingSession = (session: OpenCodeSessionRecord) => {
    setEditingSessionId(session.id);
    setDraftLabel(session.title);
  };

  const cancelEditingSession = () => {
    setEditingSessionId(null);
    setDraftLabel("");
  };

  const saveSessionLabel = async (sessionId: string) => {
    const nextLabel = draftLabel.trim();
    if (!nextLabel) {
      toast({
        title: "Name required",
        description: "OpenCode sessions need a visible name.",
        variant: "destructive",
      });
      return;
    }

    if (!desktopApi?.renameOpenCodeSession) {
      return;
    }

    try {
      await desktopApi.renameOpenCodeSession(sessionId, nextLabel);
      cancelEditingSession();
      await refresh();
    } catch (error) {
      toast({
        title: "Could not rename session",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const renderSessionRow = (
    session: OpenCodeSessionRecord & { resolvedProjectName: string | null },
    options?: { archived?: boolean },
  ) => {
    const archived = options?.archived ?? false;
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
                onClick={() => void saveSessionLabel(session.id)}
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
                {session.title}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <span
            className={getProjectTagClassName(
              session.resolvedProjectName ?? "Repository",
              "px-2.5 py-1",
            )}
          >
            {session.resolvedProjectName ?? "Repository"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button
            type="button"
            onClick={() => openEmbeddedTerminal(session)}
            className="gap-1.5"
            size="sm"
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
            {opencodeAvailable ? null : (
              <p className="mt-2 text-xs text-muted-foreground">
                Install the OpenCode CLI and restart DevDeck to enable this page.
              </p>
            )}
          </div>
        </div>

        <section className="rounded-2xl border border-border/60 bg-white/75 p-5 shadow-sm backdrop-blur-md">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Active OpenCode Sessions
              </h2>
              <p className="text-sm text-muted-foreground">
                {opencodeAvailable
                  ? "Sessions DevDeck launched through OpenCode appear here."
                  : "This page is unavailable until DevDeck can access the OpenCode CLI on this machine."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                {isLoading
                  ? "Loading…"
                  : opencodeAvailable
                    ? `${activeSessions.length} active`
                    : "Unavailable"}
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border/50 bg-white/70">
            {!opencodeAvailable ? (
              <div className="space-y-3 px-4 py-10 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    OpenCode CLI is not available
                  </p>
                  <p className="text-sm text-muted-foreground">
                    DevDeck cannot reliably discover real OpenCode sessions until the
                    `opencode` command is installed and visible on PATH.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Install OpenCode, restart DevDeck, and this page will only show
                  sessions opened through a real OpenCode runtime.
                </p>
              </div>
            ) : error ? (
              <div className="space-y-3 px-4 py-10 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Could not load OpenCode sessions
                  </p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                  Retry
                </Button>
              </div>
            ) : isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Loading OpenCode sessions…
              </div>
            ) : activeSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No OpenCode sessions yet. Start OpenCode in a tracked repository and DevDeck will list the real session here.
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

        {opencodeAvailable && archivedSessions.length > 0 ? (
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
