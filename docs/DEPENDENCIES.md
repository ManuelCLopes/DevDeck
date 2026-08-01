# DevDeck Dependencies

This document explains the runtime, build, and external-system dependencies that matter when developing DevDeck.

For exact versions, see `package.json` and `package-lock.json`.

## Runtime Requirements

| Dependency | Required | Used by | Notes |
| --- | --- | --- | --- |
| Node.js 20+ | Yes for development | npm scripts, build tooling, tests | Electron bundles target Node 20. |
| npm | Yes for development | install, scripts | The repo uses npm lockfile workflow. |
| macOS | Primary supported platform | Electron app, Keychain, menu bar, notifications, Finder, Terminal | The app is macOS-first. Some logic has fallbacks for other platforms, but release support is macOS-focused. |
| Git CLI | Yes for useful workspace scans | `electron/workspace.ts`, `electron/git-worktree.ts`, `electron/git-graph.ts`, `electron/git-conflict.ts` | Reads local repositories, branches, status, logs, worktrees, conflicts. |
| GitHub token or OAuth client id | Optional | GitHub PR sync and mutations | Without GitHub auth, local repository scanning still works. |
| OpenCode CLI | Optional | OpenCode launch, sessions, usage | If missing, OpenCode-specific features degrade to empty state or availability guidance. |
| `sqlite3` CLI | Optional but needed for OpenCode token usage import | `electron/opencode-usage.ts` | Reads OpenCode's local SQLite database in read-only mode. |
| VS Code `code` CLI | Optional | Open in preferred coding tool | DevDeck falls back to OS folder opening when needed. |
| Apple signing/notarization credentials | Optional for local dev, required for public release | `electron-builder`, `script/notarize.cjs` | See `RELEASING.md`. |

## Frontend Dependencies

| Package family | Purpose |
| --- | --- |
| `react`, `react-dom` | Renderer application. |
| `wouter` | Lightweight routing. Electron uses hash routing in desktop mode. |
| `@tanstack/react-query` | Data fetching and in-memory caching. |
| `@radix-ui/react-*`, `cmdk`, `vaul`, `sonner` | Accessible UI primitives, command surfaces, drawers, notifications. |
| `lucide-react` | Icons. |
| `tailwindcss`, `@tailwindcss/vite`, `tailwind-merge`, `class-variance-authority`, `clsx` | Styling and class composition. |
| `recharts`, `framer-motion` | Charts and motion in dashboard/agent productivity surfaces. |
| `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` | Embedded terminal rendering. |
| `date-fns` | Date formatting and relative timestamps. |
| `react-hook-form`, `zod`, `drizzle-zod` | Forms and validation where used. |

## Desktop and Native Dependencies

| Package or system tool | Purpose |
| --- | --- |
| `electron` | Native desktop shell, BrowserWindow, IPC, menu bar, notifications, shell integration. |
| `node-pty` | Embedded terminal process support. It is unpacked from ASAR during packaging. |
| `@electron/rebuild` | Rebuilds native modules like `node-pty` for Electron. |
| macOS `security` CLI | Keychain storage for GitHub tokens. |
| macOS `open` CLI | Opens folders in Terminal and external tools. |
| macOS login item APIs | Launch at login preference. |

## Backend and Legacy Server Dependencies

The desktop app does not require a database or remote backend. The `server/` directory is a legacy browser/server shell and currently registers no API routes.

Some dependencies remain for the server/database template or future work:

| Package | Current role |
| --- | --- |
| `express`, `ws`, `express-session`, `passport`, `passport-local`, `memorystore`, `connect-pg-simple` | Legacy web shell and session infrastructure. |
| `drizzle-orm`, `drizzle-kit`, `pg` | Database tooling behind `npm run db:push`; requires `DATABASE_URL`. |
| `zod`, `zod-validation-error` | Validation utilities. |

Treat this layer as compatibility infrastructure unless a future change explicitly makes it part of the desktop product.

## Build and Test Dependencies

| Tool | Purpose |
| --- | --- |
| `vite` and `@vitejs/plugin-react` | Renderer dev server and production build. |
| `esbuild` | Bundles the legacy server and Electron main/preload files. |
| `tsx` | Runs TypeScript scripts and tests without a separate compile step. |
| `typescript` | Type checking through `npm run check`. |
| `playwright` | Desktop smoke tests and native Electron smoke tests. |
| `electron-builder` | macOS app packaging, DMG/ZIP output, signing hooks. |
| `concurrently`, `wait-on` | Development process orchestration. |

## Environment Variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DEVDECK_RENDERER_URL` | Electron main | Loads Vite dev server instead of packaged HTML. |
| `DEVDECK_OPEN_DEVTOOLS` | Electron main | Opens DevTools when set to `true`. |
| `DEVDECK_USER_DATA_PATH` | Electron main/store code | Overrides DevDeck user-data directory. Useful in tests. |
| `DEVDECK_AGENT_TELEMETRY_PATH` | Agent telemetry store | Overrides `agent-telemetry.json` path. |
| `DEVDECK_GITHUB_CLIENT_ID` | GitHub auth | Enables device-flow sign-in. |
| `DEVDECK_GITHUB_STORAGE` | GitHub auth | `keychain` or `file`; defaults to Keychain on macOS. |
| `DEVDECK_GITHUB_TOKEN_PATH` | GitHub auth | Overrides token fallback file path. |
| `DEVDECK_E2E_BOOTSTRAP_SELECTION` | Preload | Seeds workspace selection for e2e tests. |
| `DEVDECK_RUN_NATIVE_E2E` | Playwright native test script | Enables native Electron smoke tests. |
| `XDG_DATA_HOME` | OpenCode usage | Locates OpenCode data directory on systems that define it. |
| `DATABASE_URL` | Drizzle tooling | Required only for `npm run db:push`. |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | electron-builder | macOS app signing. |
| `APPLE_NOTARY_PROFILE` | notarization script | Preferred notarization credential profile. |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarization script | Notarization fallback credentials. |

## Build Outputs

| Path | Produced by | Contents |
| --- | --- | --- |
| `dist/public` | `npm run build:web` | Static renderer assets. |
| `dist/index.cjs` | `npm run build:web` | Legacy Express server bundle. |
| `dist-electron/main.cjs` | `npm run build:electron` | Electron main bundle. |
| `dist-electron/preload.cjs` | `npm run build:electron` | Electron preload bundle. |
| `release/` | `npm run pack:mac` or `npm run dist:mac` | Packaged macOS app and distributables. |

## Dependency Boundaries

- Renderer code can import `@shared/*` and renderer libraries, but should not import `electron/*`.
- Electron code can import `shared/*` and Node APIs, but should not import React code.
- `shared/*` should stay pure and platform-neutral so it can be tested cheaply.
- Native and shell commands belong in focused Electron modules, not in components.
- Optional integrations should fail closed with useful empty states instead of blocking local project workflows.

## Common Dependency Changes

When adding a dependency:

1. Confirm whether it is renderer-only, Electron-only, build-only, or shared.
2. Add it to `dependencies` only when runtime code needs it.
3. Add it to `devDependencies` for build, test, lint, or packaging-only usage.
4. Check Vite chunking in `vite.config.ts` if the dependency is large or belongs with existing framework/UI/visual chunks.
5. For native modules, update Electron rebuild and packaging assumptions.
6. Run `npm run check`, `npm test`, and `npm run build`.

When removing a dependency:

1. Use `rg` to confirm all imports, scripts, and docs references are gone.
2. Check `script/build.ts` allowlist if the dependency was bundled into the legacy server.
3. Run the full relevant validation path.

