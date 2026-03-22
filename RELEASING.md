# Releasing DevDeck

Use this checklist before tagging a public macOS release.

## 1. Validate the release candidate locally

```bash
npm run rc:check
```

That runs:

- `npm run check`
- `npm test`
- `npm run test:e2e`
- `npm run pack:mac`
- `npm run release:check:artifacts`

## 2. Confirm required release secrets

Production releases should provide all of these:

- `DEVDECK_GITHUB_CLIENT_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_NOTARY_PROFILE`

If you are not using `APPLE_NOTARY_PROFILE`, provide:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

You can validate the environment before tagging with:

```bash
npm run release:check:prod
```

## 3. Create the release build locally if needed

```bash
npm run dist:mac
npm run release:check:final
```

## 4. Publish through GitHub Actions

Push a tag like:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The macOS release workflow will:

- run type checks
- run unit tests
- run Electron smoke tests
- validate release credentials
- build signed and notarized artifacts
- validate the signed `.app`
- upload the `.dmg` and `.zip`
- attach them to the GitHub release

## Notes

- Public releases should not ship with ad-hoc signing.
- Public releases should not rely on manual GitHub token entry as the only auth path.
- If `npm run release:check:final` fails, do not publish the build.
