# DevDeck

DevDeck is a local-first desktop-style workspace for keeping an eye on repositories, pull requests, and development activity from one interface.

The current project is a local web app built with React, Vite, Express, and TypeScript. It runs entirely on your machine and does not require any external services for the default experience.

## What the app does

- Shows a project overview dashboard for local repositories
- Surfaces a code review inbox and activity feed
- Includes a local-first onboarding flow and preferences screen
- Runs as a single local server that serves both the UI and API shell

## Current state

This repository is currently a product prototype:

- Repository discovery in onboarding is mocked
- GitHub connection in settings is mocked
- Main dashboards are powered by local mock data
- No production API routes are implemented yet

That means you can run and use the app locally today, but it is not yet scanning real folders or syncing with GitHub.

## Requirements

- Node.js 20+ recommended
- npm

## Install

```bash
npm install
```

## Run in development

Start the full app locally:

```bash
npm run dev
```

Then open:

```text
http://localhost:5000
```

Notes:

- The Express server serves both the frontend and backend shell on port `5000` by default
- You can override the port with `PORT`, for example `PORT=3000 npm run dev`

## Use the app

When you first open DevDeck:

1. Go through the onboarding flow
2. Choose the mocked workspace directory prompt
3. Launch the app into the main dashboard

From there you can use:

- `Overview` to see repository health, pull request counts, and project cards
- `Code Reviews` to inspect the review queue and approval states
- `Local Projects` to browse repositories and inspect project details
- `Activity Inbox` to review notifications and alerts
- `Preferences` to revisit onboarding and toggle local behavior settings

If you want to see onboarding again, open `Preferences` and use `Reset Onboarding`.

## Production build

Build the app:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

By default, production also listens on port `5000` unless `PORT` is set.

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

- App state is stored in the browser for onboarding completion
- The current experience runs without cloud services
- The UI messaging is designed around local repository monitoring and private workflows

## Project scripts

```bash
npm run dev        # run the local development server
npm run build      # build client and server bundles
npm start          # run the built production server
npm run check      # run TypeScript type checking
npm run db:push    # push Drizzle schema changes, requires DATABASE_URL
```
