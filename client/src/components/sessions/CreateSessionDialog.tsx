import { useEffect, useMemo, useState } from "react";
import type {
  WorkspaceProject,
  WorkspacePullRequestItem,
} from "@shared/workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { getDesktopApi } from "@/lib/desktop";
import {
  buildDefaultSessionBranchName,
  buildDefaultSessionLabel,
  createSessionId,
  findDuplicateDevSession,
  type DevSession,
  type DevSessionKind,
} from "@/lib/dev-sessions";

interface CreateSessionDialogProps {
  existingSessions: DevSession[];
  initialProjectId?: string | null;
  initialPullRequestId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSessionActivated?: (session: DevSession) => void;
  onSessionCreated: (session: DevSession) => void;
  open: boolean;
  projects: WorkspaceProject[];
  pullRequests: WorkspacePullRequestItem[];
}

export default function CreateSessionDialog({
  existingSessions,
  initialProjectId = null,
  initialPullRequestId = null,
  onOpenChange,
  onSessionActivated,
  onSessionCreated,
  open,
  projects,
  pullRequests,
}: CreateSessionDialogProps) {
  const desktopApi = getDesktopApi();
  const [sessionKind, setSessionKind] = useState<DevSessionKind>("existing_clone");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPullRequestId, setSelectedPullRequestId] = useState("none");
  const [label, setLabel] = useState("");
  const [sessionBranchName, setSessionBranchName] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const availableProjects = useMemo(
    () => projects.filter((project) => Boolean(project.localPath)),
    [projects],
  );
  const selectedProject =
    availableProjects.find((project) => project.id === selectedProjectId) ?? null;
  const projectPullRequests = useMemo(
    () =>
      selectedProject
        ? pullRequests.filter((pullRequest) => pullRequest.projectId === selectedProject.id)
        : [],
    [pullRequests, selectedProject],
  );
  const selectedPullRequest =
    projectPullRequests.find((pullRequest) => pullRequest.id === selectedPullRequestId) ?? null;
  const duplicateSession = useMemo(() => {
    if (!selectedProject) {
      return null;
    }

    return findDuplicateDevSession(existingSessions, {
      kind: sessionKind,
      linkedPullRequestId: selectedPullRequest?.id ?? null,
      projectId: selectedProject.id,
      sessionBranchName: sessionBranchName.trim(),
    });
  }, [
    existingSessions,
    selectedProject,
    selectedPullRequest?.id,
    sessionBranchName,
    sessionKind,
  ]);

  const applyDefaults = (
    nextProjectId: string,
    nextPullRequestId: string,
    nextSessionKind: DevSessionKind,
  ) => {
    const nextProject =
      availableProjects.find((project) => project.id === nextProjectId) ?? null;
    const nextPullRequest =
      nextProject && nextPullRequestId !== "none"
        ? pullRequests.find(
            (pullRequest) =>
              pullRequest.id === nextPullRequestId &&
              pullRequest.projectId === nextProject.id,
          ) ?? null
        : null;

    if (!nextProject) {
      setLabel("");
      setSessionBranchName("");
      setSourceRef("");
      return;
    }

    const nextBranchName =
      nextSessionKind === "worktree"
        ? buildDefaultSessionBranchName({
            headBranch: nextPullRequest?.headBranch ?? null,
            pullRequestNumber: nextPullRequest?.number ?? null,
            repositoryName: nextProject.name,
          })
        : nextPullRequest?.headBranch ?? nextProject.currentBranch;

    setSessionBranchName(nextBranchName);
    setSourceRef(
      nextSessionKind === "worktree"
        ? nextPullRequest?.headBranch
          ? `origin/${nextPullRequest.headBranch}`
          : nextProject.hasUpstream
            ? `origin/${nextProject.defaultBranch}`
            : nextProject.currentBranch
        : nextPullRequest?.headBranch ?? nextProject.currentBranch,
    );
    setLabel(
      buildDefaultSessionLabel({
        kind: nextSessionKind,
        projectName: nextProject.name,
        pullRequestNumber: nextPullRequest?.number ?? null,
        sessionBranchName: nextBranchName,
      }),
    );
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextProjectId =
      (initialProjectId &&
      availableProjects.some((project) => project.id === initialProjectId)
        ? initialProjectId
        : availableProjects[0]?.id) ?? "";
    const nextPullRequestId =
      initialPullRequestId &&
      pullRequests.some(
        (pullRequest) =>
          pullRequest.id === initialPullRequestId &&
          pullRequest.projectId === nextProjectId,
      )
        ? initialPullRequestId
        : "none";
    const nextSessionKind: DevSessionKind =
      nextPullRequestId !== "none" ? "worktree" : "existing_clone";

    setSelectedProjectId(nextProjectId);
    setSelectedPullRequestId(nextPullRequestId);
    setSessionKind(nextSessionKind);
    setCreationError(null);
    applyDefaults(nextProjectId, nextPullRequestId, nextSessionKind);
  }, [availableProjects, initialProjectId, initialPullRequestId, open, pullRequests]);

  const handleCreateSession = async () => {
    if (!selectedProject) {
      setCreationError("Choose a repository before creating a session.");
      return;
    }

    setCreationError(null);
    setIsCreating(true);

    try {
      if (duplicateSession) {
        onOpenChange(false);
        onSessionActivated?.(duplicateSession);
        toast({
          title: "Session already active",
          description: `${duplicateSession.label} is already active in DevDeck.`,
        });
        return;
      }

      const resolvedPullRequest = selectedPullRequestId === "none" ? null : selectedPullRequest;
      const timestamp = new Date().toISOString();
      let localPath = selectedProject.localPath;
      let resolvedBranchName = sessionBranchName.trim() || selectedProject.currentBranch;

      if (sessionKind === "worktree") {
        if (!desktopApi) {
          throw new Error("Worktree sessions are only available in the desktop app.");
        }

        const result = await desktopApi.createGitWorktreeSession({
          baseRef: sourceRef.trim() || "HEAD",
          branchName: resolvedBranchName,
          repositoryPath: selectedProject.localPath,
        });
        localPath = result.localPath;
        resolvedBranchName = result.branchName;
      }

      const nextSession: DevSession = {
        createdAt: timestamp,
        id: createSessionId(),
        kind: sessionKind,
        label: label.trim() || buildDefaultSessionLabel({
          kind: sessionKind,
          projectName: selectedProject.name,
          pullRequestNumber: resolvedPullRequest?.number ?? null,
          sessionBranchName: resolvedBranchName,
        }),
        linkedPullRequestId: resolvedPullRequest?.id ?? null,
        linkedPullRequestNumber: resolvedPullRequest?.number ?? null,
        linkedPullRequestTitle: resolvedPullRequest?.title ?? null,
        localPath,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        repositoryPath: selectedProject.localPath,
        repositorySlug: resolvedPullRequest?.repositorySlug ?? null,
        sessionBranchName: resolvedBranchName,
        sourceRef: sourceRef.trim() || null,
        status: "active",
        updatedAt: timestamp,
      };

      onSessionCreated(nextSession);
      onOpenChange(false);
      onSessionActivated?.(nextSession);
      toast({
        title: sessionKind === "worktree" ? "Worktree session created" : "Session created",
        description:
          sessionKind === "worktree"
            ? `${selectedProject.name} is ready in a new worktree.`
            : `${selectedProject.name} is ready from the linked clone.`,
      });
    } catch (error) {
      setCreationError(
        error instanceof Error
          ? error.message
          : "DevDeck could not create that session.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
          <DialogDescription>
            Launch an existing clone or create an isolated worktree for parallel work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {duplicateSession ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Session already active</p>
              <p className="mt-1 text-muted-foreground">
                DevDeck already has an active session for this context at{" "}
                <span className="font-mono text-[12px] text-foreground">
                  {duplicateSession.localPath}
                </span>
                . Open it directly or change the branch/context to create another one.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Repository
              </p>
              <Select
                value={selectedProjectId}
                onValueChange={(value) => {
                  setSelectedProjectId(value);
                  setSelectedPullRequestId("none");
                  applyDefaults(value, "none", sessionKind);
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Choose a repository" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Session Template
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "existing_clone", label: "Existing Clone" },
                  { id: "worktree", label: "New Worktree" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      const nextKind = option.id as DevSessionKind;
                      setSessionKind(nextKind);
                      applyDefaults(selectedProjectId, selectedPullRequestId, nextKind);
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      sessionKind === option.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/60 bg-white text-foreground hover:bg-secondary/30"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Linked Pull Request
              </p>
              <Select
                value={selectedPullRequestId}
                onValueChange={(value) => {
                  setSelectedPullRequestId(value);
                  if (selectedProjectId) {
                    applyDefaults(selectedProjectId, value, sessionKind);
                  }
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Optional PR context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked pull request</SelectItem>
                  {projectPullRequests.map((pullRequest) => (
                    <SelectItem key={pullRequest.id} value={pullRequest.id}>
                      #{pullRequest.number} {pullRequest.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Session Label
              </p>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Review #42"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {sessionKind === "worktree" ? "Session Branch" : "Launch Branch"}
              </p>
              <Input
                value={sessionBranchName}
                onChange={(event) => setSessionBranchName(event.target.value)}
                placeholder={sessionKind === "worktree" ? "review-pr-42" : "main"}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {sessionKind === "worktree" ? "Start From" : "Source Context"}
              </p>
              <Input
                value={sourceRef}
                onChange={(event) => setSourceRef(event.target.value)}
                placeholder={sessionKind === "worktree" ? "origin/main" : "main"}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-sm text-muted-foreground">
            {sessionKind === "worktree" ? (
              <p>
                DevDeck will create a new sibling worktree from <span className="font-medium text-foreground">{sourceRef || "HEAD"}</span> using branch <span className="font-medium text-foreground">{sessionBranchName || "session"}</span>.
              </p>
            ) : (
              <p>
                DevDeck will track the existing clone at <span className="font-medium break-all text-foreground">{selectedProject?.localPath ?? "the selected repository path"}</span>.
              </p>
            )}
          </div>

          {creationError ? (
            <div className="rounded-lg border border-[#cf222e]/20 bg-[#ffebe9] px-3 py-2 text-sm text-[#cf222e]">
              {creationError}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleCreateSession()} disabled={isCreating}>
            {isCreating
              ? "Creating..."
              : duplicateSession
                ? "Open Existing Session"
                : sessionKind === "worktree"
                  ? "Create Worktree Session"
                  : "Create Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
