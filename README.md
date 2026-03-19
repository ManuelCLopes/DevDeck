# DevDeck

DevDeck is a local-first macOS workspace for keeping an eye on repositories, branch review queues, and development activity from one interface.

The app now runs through Electron on top of the existing React and Vite UI, so it can use native folder picking and real filesystem access instead of browser-only mocks.

## What the app does

- Shows a project overview dashboard for local repositories
- Surfaces a branch review inbox and activity feed from local Git data
- Syncs open pull requests and commit status directly from the GitHub API
- Includes a local-first onboarding flow and preferences screen
- Packages as a native macOS app bundle

## Current state

This repository is still a prototype:

- No production API routes are implemented yet
- Some repository insights are still inferred from local Git metadata only
- macOS packaging is unsigned by default unless you provide Apple signing credentials

That means DevDeck now scans real local repositories and can sync hosted pull request state from GitHub, but parts of the experience are still evolving.

## Requirements

- Node.js 20+ recommended
- npm

## Install

```bash
npm install
```

## Environment

Create a local environment file if you want optional integrations:

```bash
cp .env.example .env
```

Available variables:

- `DEVDECK_GITHUB_CLIENT_ID`
  Enables GitHub device-flow sign-in inside the desktop app.
  If you leave this unset, DevDeck still lets you paste a GitHub token manually in `Preferences > GitHub Access`.
- `CSC_LINK` and `CSC_KEY_PASSWORD`
  Optional for release builds. Provide a Developer ID Application certificate in base64 `.p12` form plus its password so `electron-builder` can sign the macOS app.
- `APPLE_NOTARY_PROFILE`
  Optional but recommended for notarization. If you already stored an App Store Connect profile in Keychain with `xcrun notarytool store-credentials`, DevDeck will use it.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`
  Optional notarization fallback when you are not using `APPLE_NOTARY_PROFILE`.
- `DATABASE_URL`
  Only needed for the old Drizzle/database tooling. The desktop app itself does not require a database.

## Run in development

Start the Electron app locally:

```bash
npm run dev
```

This starts:

- the Vite renderer on `http://127.0.0.1:5000`
- the Electron main and preload bundles
- the native DevDeck desktop window

If you want the old browser/server shell instead, run:

```bash
npm run dev:web
```

## Use the app

When you first open DevDeck:

1. Go through the onboarding flow
2. Choose the workspace folder that contains your local projects
3. If DevDeck finds multiple repositories, select which ones to monitor
4. Launch the app into the main dashboard

From there you can use:

- `Overview` to see repository health, branch counts, and recent workspace signals
- `Pull Requests` to inspect live GitHub pull requests plus local review signals
- `Local Projects` to browse repositories and inspect project details
- `Activity Inbox` to review recent local Git activity
- `Preferences` to revisit onboarding and toggle local behavior settings

If you want to see onboarding again, open `Preferences` and use `Reset Onboarding`.

## Background mode

DevDeck can keep monitoring your workspace even after you close the main window.

- `Preferences > Keep Running in Background` changes the close button into a hide action instead of quitting the app
- `Preferences > Show Menu Bar Icon` adds a menu bar item with quick actions for opening DevDeck, jumping to the PR inbox, and forcing a refresh
- `Preferences > Launch at Login` lets DevDeck start automatically when you sign in to macOS

When background mode is on, DevDeck continues refreshing local Git and GitHub state on the configured cadence and keeps macOS notifications active.

## GitHub connection

DevDeck now uses the GitHub API directly from the Electron main process.

You have two ways to connect GitHub in `Preferences`:

1. Device flow
   Requires `DEVDECK_GITHUB_CLIENT_ID` to be set.
   DevDeck opens GitHub sign-in, stores the resulting credential locally, and starts syncing PR and commit-status data.
2. Personal access token
   Works without any extra app configuration.
   Paste a classic token with `repo` scope, or a fine-grained token with read access to repository metadata, pull requests, and commit statuses.

On macOS, DevDeck stores the credential in Keychain. It is not committed into the repository.

## Build and package

Build the web and Electron bundles:

```bash
npm run build
```

Create a local unsigned macOS app bundle:

```bash
npm run pack:mac
```

That produces:

```text
release/mac-arm64/DevDeck.app
```

To create distributable archives instead of just the unpacked app bundle:

```bash
npm run dist:mac
```

For a signed and notarized build, export either:

- `APPLE_NOTARY_PROFILE`
- or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`

If you also want the produced `.app` and `.dmg` signed, provide `CSC_LINK` and `CSC_KEY_PASSWORD` before running `npm run dist:mac`.

## GitHub Actions release

There is also a macOS release workflow at [.github/workflows/release-mac.yml](/Users/manuellopes/Desktop/DevDeck/.github/workflows/release-mac.yml).

It can be triggered manually or by pushing a tag like `v1.0.0`, and it will:

- install dependencies with `npm ci`
- run `npm run check`
- run `npm test`
- build signed macOS artifacts with `npm run dist:mac`
- upload the generated `.dmg` and `.zip`
- publish them to the GitHub release for tagged builds

Repository secrets expected by that workflow:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_NOTARY_PROFILE`, or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`

## Type check

```bash
npm run check
```

## Database note

You do not need a database to run the current app locally.

There is a Drizzle configuration in the repository for future work, but it is only relevant if you want to use:

```bash
npm run db:push
```

That command requires `DATABASE_URL` to be set.

## Local-first behavior

DevDeck is intended to be used locally:

- Workspace selection is stored locally on your machine
- Repository scanning reads local files and Git metadata directly
- GitHub connectivity is optional, but enables PR and CI status sync
- The GitHub credential is stored locally on your machine

## Project scripts

```bash
npm run dev            # run the Electron app in development
npm run dev:web        # run the older Express/Vite browser shell
npm run build          # build client, server, and Electron bundles
npm run pack:mac       # create an unpacked macOS app bundle
npm run dist:mac       # create macOS distributables
npm run check          # run TypeScript type checking
npm run db:push        # push Drizzle schema changes, requires DATABASE_URL
```
