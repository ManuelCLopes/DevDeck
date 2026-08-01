# DevDeck API Documentation

DevDeck's primary API is the desktop bridge exposed as `window.devdeck` by `electron/preload.ts`.

The bridge is the only renderer-to-native API. Renderer code should access it through `client/src/lib/desktop.ts` and hooks in `client/src/hooks/`.

The legacy Express server currently has no registered `/api` routes in `server/routes.ts`.

## API Change Checklist

When adding or changing a desktop API:

1. Add or update the shared request/response type in `shared/` when the contract crosses process boundaries.
2. Update `electron/preload.ts`.
3. Update `client/src/env.d.ts`.
4. Add or update the IPC handler in `electron/main.ts` or a dedicated Electron module.
5. Prefer a renderer hook in `client/src/hooks/` instead of calling the bridge directly from page components.
6. Add tests for pure normalization and Electron-side behavior when practical.
7. Update this document.

## Desktop API Overview

| Method | IPC channel | Purpose |
| --- | --- | --- |
| `pickWorkspaceDirectory()` | `devdeck:pick-workspace` | Open native folder picker and discover local repositories. |
| `loadWorkspaceSnapshot(selection)` | `devdeck:load-workspace-snapshot` | Build a complete workspace snapshot from local Git and optional GitHub data. |
| `onWorkspaceSnapshotUpdated(listener)` | `devdeck:workspace-snapshot-updated` | Subscribe to background snapshot refreshes. |
| `syncWorkspaceMonitorState(state)` | `devdeck:sync-workspace-monitor-state` | Send background refresh and notification preferences to the main process. |
| `onNavigate(listener)` | `devdeck:navigate` | Subscribe to native/menu-triggered app navigation. |
| `openInTerminal(path)` | `devdeck:open-in-terminal` | Open a project path in the system terminal. |
| `openInCode(path)` | `devdeck:open-in-code` | Open a project path in VS Code or the OS fallback. |
| `openInOpencode(path)` | `devdeck:open-in-opencode` | Open a project path with OpenCode. |
| `getDesktopCodingToolAvailability()` | `devdeck:get-desktop-coding-tool-availability` | Report VS Code/OpenCode availability. |
| `openExternal(url)` | `devdeck:open-external` | Open a URL with the OS default browser. |
| `showItemInFinder(path)` | `devdeck:show-item-in-finder` | Reveal a path in Finder. |
| `copyToClipboard(value)` | `devdeck:copy-to-clipboard` | Copy text to the OS clipboard. |
| `showNotification(payload)` | `devdeck:show-notification` | Show a desktop notification. |
| `setLaunchAtLogin(enabled)` | `devdeck:set-launch-at-login` | Toggle launch-at-login. |
| `discoverAgentHarness(request)` | `devdeck:discover-agent-harness` | Discover agents and workflows from harness files. |
| `getAgentTelemetry()` | `devdeck:get-agent-telemetry` | Read durable agent telemetry. |
| `saveAgentRuns(runs)` | `devdeck:save-agent-runs` | Persist agent runs. |
| `saveTaskTraceEntries(entries)` | `devdeck:save-task-trace-entries` | Persist task trace entries. |
| `saveTokenUsageEvents(events)` | `devdeck:save-token-usage-events` | Persist token usage events. |
| `ingestAgentTaskTraces(request?)` | `devdeck:ingest-agent-task-traces` | Import trace JSON/JSONL from active run worktrees. |
| `listOpenCodeSessions()` | `devdeck:list-opencode-sessions` | List OpenCode sessions if the CLI is available. |
| `renameOpenCodeSession(id, title)` | `devdeck:rename-opencode-session` | Rename an OpenCode session. |
| `listOpenCodeUsageRecords()` | `devdeck:list-opencode-usage-records` | Read OpenCode token usage from local SQLite. |
| `createGitWorktreeSession(payload)` | `devdeck:create-git-worktree-session` | Create a Git worktree for an OpenCode/dev session. |
| `listGitWorktrees(repositoryPath)` | `devdeck:list-git-worktrees` | List Git worktrees for a repository. |
| `removeGitWorktreeSession(payload)` | `devdeck:remove-git-worktree-session` | Remove a Git worktree session. |
| `inspectDevSessions(requests)` | `devdeck:inspect-dev-sessions` | Inspect session branch, commit, and dirty state. |
| `getGitGraph(payload)` | `devdeck:get-git-graph` | Read recent commit graph data. |
| `getMergeConflicts(payload)` | `devdeck:get-merge-conflicts` | Parse conflicted files and conflict hunks. |
| `resolveMergeConflict(payload)` | `devdeck:resolve-merge-conflict` | Resolve conflicts according to selected hunk choices. |
| `getGitHubAuthCapabilities()` | `devdeck:get-github-auth-capabilities` | Report device-flow and credential storage availability. |
| `startGitHubDeviceAuth()` | `devdeck:start-github-device-auth` | Start GitHub OAuth device flow. |
| `pollGitHubDeviceAuth(deviceCode)` | `devdeck:poll-github-device-auth` | Poll GitHub OAuth device flow. |
| `saveGitHubToken(token)` | `devdeck:save-github-token` | Validate and persist a GitHub token. |
| `clearGitHubToken()` | `devdeck:clear-github-token` | Remove the stored GitHub token. |
| `listGitHubRepositories()` | `devdeck:list-github-repositories` | List viewer repositories from GitHub. |
| `claimPullRequestReview(payload)` | `devdeck:claim-pull-request-review` | Claim review responsibility by writing a marker comment. |
| `unclaimPullRequestReview(payload)` | `devdeck:unclaim-pull-request-review` | Remove the latest DevDeck review-claim marker comment. |
| `addPullRequestComment(payload)` | `devdeck:add-pull-request-comment` | Add a GitHub issue/PR comment. |
| `requestPullRequestReviewers(payload)` | `devdeck:request-pull-request-reviewers` | Request GitHub reviewers. |
| `getPullRequestDiff(payload)` | `devdeck:get-pull-request-diff` | Fetch a pull request diff from GitHub. |
| `generateAICompletion(payload)` | `devdeck:generate-ai-completion` | Generate a local or provider-backed PR assistant response. |
| `terminal.available()` | `devdeck:pty:available` | Report embedded terminal support. |
| `terminal.spawn(request)` | `devdeck:pty:spawn` | Spawn an embedded terminal process. |
| `terminal.write(payload)` | `devdeck:pty:write` | Write bytes to a PTY. |
| `terminal.resize(payload)` | `devdeck:pty:resize` | Resize a PTY. |
| `terminal.kill(payload)` | `devdeck:pty:kill` | Kill a PTY. |
| `terminal.onData(listener)` | `devdeck:pty:data` | Subscribe to PTY output. |
| `terminal.onExit(listener)` | `devdeck:pty:exit` | Subscribe to PTY exit. |
| `windowControls.close()` | `devdeck:window-control` | Close or hide the app depending on background mode. |
| `windowControls.minimize()` | `devdeck:window-control` | Minimize the window. |
| `windowControls.toggleMaximize()` | `devdeck:window-control` | Toggle maximize state. |

## Workspace APIs

### `pickWorkspaceDirectory(): Promise<WorkspaceDiscoveryResult | null>`

Opens a native directory picker and scans the selected folder for repositories.

- Handler: `electron/main.ts`
- Scanner: `electron/workspace.ts`
- Returns `null` when the picker is canceled.
- Contract: `WorkspaceDiscoveryResult` in `shared/workspace.ts`

### `loadWorkspaceSnapshot(selection: WorkspaceSelection): Promise<WorkspaceSnapshot>`

Builds the main dashboard data model.

- Reads local Git repositories.
- Uses GitHub auth when available to fetch PRs, review states, authored PRs, commit status, and viewer activity.
- Falls back to the latest monitor snapshot with an offline/error sync status when refresh fails and cached data exists.
- Contract: `WorkspaceSelection` and `WorkspaceSnapshot` in `shared/workspace.ts`

### `onWorkspaceSnapshotUpdated(listener): () => void`

Subscribes to background refresh events emitted by the Electron main process.

The returned function removes the listener.

### `syncWorkspaceMonitorState(state): Promise<void>`

Sends the latest workspace selection and monitor preferences to the main process.

Payload:

```ts
{
  preferences: WorkspaceMonitorPreferences & {
    autoRefreshEnabled: boolean;
    autoRefreshIntervalSeconds: number;
    keepRunningInBackground: boolean;
    refreshOnWindowFocus: boolean;
    showMenuBarIcon: boolean;
  };
  selection: WorkspaceSelection | null;
}
```

## Project and Native Utility APIs

### `openInTerminal(targetPath: string): Promise<void>`

On macOS, runs `open -a Terminal <targetPath>`. On other platforms, falls back to `shell.openPath`.

### `openInCode(targetPath: string): Promise<void>`

Attempts to open the path with VS Code. If the `code` command is missing, falls back to the OS default folder opener.

### `openInOpencode(targetPath: string): Promise<void>`

Launches OpenCode for a project path through `electron/coding-tool-launcher.ts`.

### `getDesktopCodingToolAvailability()`

Returns:

```ts
{
  opencode: { available: boolean; reason: string | null };
  vscode: { available: boolean; reason: string | null };
}
```

### `openExternal(targetUrl: string): Promise<void>`

Opens a URL with the OS default handler.

### `showItemInFinder(targetPath: string): Promise<void>`

Reveals a path in Finder.

### `copyToClipboard(value: string): Promise<void>`

Writes text to the OS clipboard.

### `showNotification(payload: { title: string; body?: string }): Promise<void>`

Shows a desktop notification.

### `setLaunchAtLogin(enabled: boolean): Promise<void>`

Calls Electron login item settings.

## Agent Harness and Telemetry APIs

### `discoverAgentHarness(request: AgentHarnessDiscoveryRequest): Promise<AgentHarnessDiscoveryResult>`

Scans configured project paths and the selected workspace root for agent harness files.

Contracts live in `shared/agents.ts`.

Request:

```ts
{
  projectIds?: string[];
  selectionRootPath?: string | null;
  projects: Array<{
    id: string;
    localPath?: string | null;
    name: string;
  }>;
}
```

Response:

```ts
{
  agents: AgentDefinition[];
  scannedAt: string;
  sources: AgentHarnessSource[];
  workflows: WorkflowDefinition[];
}
```

### `getAgentTelemetry(): Promise<AgentTelemetrySnapshot>`

Reads the durable telemetry snapshot from the desktop store.

Contract: `AgentTelemetrySnapshot` in `shared/agent-telemetry.ts`.

### `saveAgentRuns(agentRuns: AgentRun[]): Promise<AgentTelemetrySnapshot>`

Normalizes and persists the full agent run slice.

### `saveTaskTraceEntries(taskTraceEntries: TaskTraceEntry[]): Promise<AgentTelemetrySnapshot>`

Normalizes and persists the full task trace slice.

### `saveTokenUsageEvents(tokenUsageEvents: TokenUsageEvent[]): Promise<AgentTelemetrySnapshot>`

Normalizes and persists the full token usage slice.

### `ingestAgentTaskTraces(request?: AgentTaskTraceIngestionRequest): Promise<AgentTaskTraceIngestionResult>`

Imports JSON or JSONL task trace files from active run worktrees and merges them into telemetry.

Contracts live in `shared/agent-task-trace.ts`.

## OpenCode APIs

### `listOpenCodeSessions(): Promise<OpenCodeSessionRecord[]>`

Returns an empty list when the OpenCode CLI is unavailable.

Contract: `OpenCodeSessionRecord` in `shared/opencode-sessions.ts`.

### `renameOpenCodeSession(sessionId: string, title: string): Promise<OpenCodeSessionRecord>`

Renames an existing OpenCode session. Throws if the OpenCode CLI is unavailable.

### `listOpenCodeUsageRecords(): Promise<OpenCodeUsageRecord[]>`

Reads OpenCode usage records from the local OpenCode SQLite database.

- Uses the `sqlite3` CLI.
- Opens the database read-only.
- Returns an empty list when the database is missing or OpenCode is unavailable.
- Contract: `OpenCodeUsageRecord` in `shared/opencode-usage.ts`.

## Git Worktree and Repository APIs

### `createGitWorktreeSession(payload): Promise<CreateGitWorktreeSessionResult>`

Payload:

```ts
{
  baseRef: string;
  branchName: string;
  repositoryPath: string;
  sessionPath?: string | null;
}
```

Creates a Git worktree session and returns:

```ts
{
  branchName: string;
  localPath: string;
}
```

### `listGitWorktrees(repositoryPath: string)`

Returns:

```ts
Array<{
  path: string;
  sha: string;
  branch: string | null;
  isMain: boolean;
}>
```

### `removeGitWorktreeSession(payload): Promise<void>`

Payload:

```ts
{
  repositoryPath: string;
  worktreePath: string;
}
```

### `inspectDevSessions(payload: InspectDevSessionRequest[]): Promise<DevSessionOperationalSnapshot[]>`

Inspects session paths and returns Git status, branch, commit, upstream, and dirty-state information.

Contracts live in `shared/sessions.ts`.

### `getGitGraph(payload)`

Payload:

```ts
{
  repositoryPath: string;
  limit?: number;
}
```

Returns recent commit graph nodes:

```ts
Array<{
  hash: string;
  parents: string[];
  refs: string[];
  authorName: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
}>
```

### `getMergeConflicts(payload)`

Payload:

```ts
{
  repositoryPath: string;
}
```

Returns conflicted files and parsed conflict hunks.

### `resolveMergeConflict(payload): Promise<void>`

Payload:

```ts
{
  repositoryPath: string;
  filePath: string;
  selections: Record<string, "our" | "their" | "both" | "none">;
}
```

## GitHub APIs

### `getGitHubAuthCapabilities()`

Returns:

```ts
{
  deviceFlowAvailable: boolean;
  deviceFlowReason: string | null;
  storageBackend: "file" | "keychain";
}
```

### `startGitHubDeviceAuth()`

Starts OAuth device flow. Requires `DEVDECK_GITHUB_CLIENT_ID`.

Returns:

```ts
{
  deviceCode: string;
  expiresAt: string;
  intervalSeconds: number;
  userCode: string;
  verificationUri: string;
}
```

### `pollGitHubDeviceAuth(deviceCode: string)`

Returns:

```ts
{
  intervalSeconds?: number;
  message: string;
  status: "complete" | "error" | "pending";
  viewerLogin?: string;
}
```

### `saveGitHubToken(token: string): Promise<{ viewerLogin: string }>`

Validates a token by fetching the GitHub viewer, then stores it in Keychain or the configured fallback file.

### `clearGitHubToken(): Promise<void>`

Removes the stored token and clears workspace snapshot caches.

### `listGitHubRepositories(): Promise<GitHubRepositoryCandidate[]>`

Lists up to five pages of viewer repositories when a token is stored. Returns an empty list without auth.

Contract: `GitHubRepositoryCandidate` in `shared/workspace.ts`.

## Pull Request Mutation and AI APIs

### `claimPullRequestReview(payload): Promise<void>`

Payload:

```ts
{
  pullRequestNumber: number;
  repositorySlug: string;
}
```

Writes a GitHub issue comment with DevDeck's review-claim marker.

### `unclaimPullRequestReview(payload): Promise<void>`

Removes the latest DevDeck review-claim marker comment for the PR.

### `addPullRequestComment(payload): Promise<void>`

Payload:

```ts
{
  body: string;
  pullRequestNumber: number;
  repositorySlug: string;
}
```

Trims and validates `body` before posting.

### `requestPullRequestReviewers(payload): Promise<void>`

Payload:

```ts
{
  pullRequestNumber: number;
  repositorySlug: string;
  reviewers: string[];
}
```

Trims reviewer logins and requires at least one.

### `getPullRequestDiff(payload): Promise<string>`

Payload:

```ts
{
  repositorySlug: string;
  pullRequestNumber: number;
}
```

Fetches the GitHub diff for a pull request.

### `generateAICompletion(payload): Promise<string>`

Payload:

```ts
{
  diff: string;
  action: "changelog" | "security" | "draft-response";
  config: {
    provider: "ollama" | "gemini" | "anthropic";
    ollamaHost?: string;
    ollamaModel?: string;
    geminiKey?: string;
    anthropicKey?: string;
  };
}
```

Generates PR assistant text through `electron/ai-service.ts`.

## Embedded Terminal API

The terminal API lives under `window.devdeck.terminal`.

### `terminal.available(): Promise<PtyAvailability>`

Returns platform, shell, home directory, available commands, and an unavailable reason when PTY support cannot be used.

Contract: `PtyAvailability` in `shared/terminals.ts`.

### `terminal.spawn(request: SpawnPtyRequest): Promise<SpawnPtyResult>`

Request:

```ts
{
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  label?: string;
}
```

Response:

```ts
{
  id: string;
  pid: number;
  shell: string;
  label: string;
  cwd: string;
}
```

### `terminal.write(payload): Promise<void>`

Payload:

```ts
{
  id: string;
  data: string;
}
```

### `terminal.resize(payload): Promise<void>`

Payload:

```ts
{
  id: string;
  cols: number;
  rows: number;
}
```

### `terminal.kill(payload): Promise<void>`

Payload:

```ts
{
  id: string;
}
```

### `terminal.onData(listener): () => void`

Subscribes to:

```ts
{
  id: string;
  chunk: string;
}
```

### `terminal.onExit(listener): () => void`

Subscribes to:

```ts
{
  id: string;
  exitCode: number;
  signal: number | null;
}
```

## Window Controls API

The window controls API lives under `window.devdeck.windowControls`.

| Method | Action |
| --- | --- |
| `close()` | Closes or hides the main window depending on background preferences. |
| `minimize()` | Minimizes the main window. |
| `toggleMaximize()` | Maximizes or restores the main window. |

All three methods invoke the shared `devdeck:window-control` IPC channel.

## Legacy HTTP API

`server/routes.ts` currently registers no HTTP API routes.

The server bundle still exists because `npm run dev:web`, `npm run start`, and packaging compatibility build it. If HTTP routes are added later:

- Prefix them with `/api`.
- Define request/response contracts in `shared/`.
- Document them in this section.
- Add tests for handlers and client usage.

