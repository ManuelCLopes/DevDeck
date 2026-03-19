# Contributing to DevDeck

DevDeck is an experimental macOS desktop app for local repository monitoring and pull request follow-up. Contributions are welcome, but changes should stay aligned with the local-first, desktop-first direction of the project.

## Before you start

- Read the setup instructions in [README.md](README.md)
- Use Node.js 20+
- Run the desktop app locally with `npm run dev`

## Development expectations

Before opening a pull request, run:

```bash
npm run check
npm test
npm run build
```

If your change affects packaging or signing behavior, include the impact in the pull request description.

## Scope

Good contribution areas:

- Electron and macOS workflow improvements
- Git and GitHub data quality
- UI/UX polish for repository and PR triage
- Test coverage for workspace scanning, auth, and desktop flows
- Documentation and onboarding clarity

Changes that add unrelated backend infrastructure or move the app away from the local-first model will likely not be accepted.

## Pull requests

Please keep pull requests focused:

- one problem or feature per PR
- clear title and summary
- note any tradeoffs or platform limitations
- include screenshots for visible UI changes when practical

## Issues

Bug reports are most useful when they include:

- macOS version
- Node.js version
- whether the app was run with `npm run dev` or from a packaged build
- reproduction steps
- any relevant DevDeck console or terminal output
