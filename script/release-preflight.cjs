const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));

const requireArtifacts = args.has("--require-artifacts");
const requireGitHubAuth = args.has("--require-github-auth");
const requireNotarization = args.has("--require-notarization");
const requireSigning = args.has("--require-signing");
const verifyCodesign = args.has("--verify-codesign");
const verifyNotarization = args.has("--verify-notarization");

const errors = [];
const warnings = [];
const notices = [];

function hasEnv(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function addNotice(message) {
  notices.push(message);
}

function expectFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    addError(`Missing required file: ${relativePath}`);
    return null;
  }

  addNotice(`Found ${relativePath}`);
  return absolutePath;
}

function findBuiltAppBundle() {
  const releaseDirectory = path.join(root, "release");
  if (!fs.existsSync(releaseDirectory)) {
    return null;
  }

  for (const entry of fs.readdirSync(releaseDirectory)) {
    const candidate = path.join(releaseDirectory, entry, "DevDeck.app");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function inspectBuiltIndexHtml() {
  const builtIndexPath = path.join(root, "dist", "public", "index.html");
  if (!fs.existsSync(builtIndexPath)) {
    if (requireArtifacts) {
      addError("Expected dist/public/index.html after building the desktop app.");
    } else {
      addWarning("Build artifacts are not present yet; skip asset path validation until after npm run build.");
    }
    return;
  }

  const html = fs.readFileSync(builtIndexPath, "utf8");
  if (html.includes('src="/assets/') || html.includes('href="/assets/')) {
    addError("dist/public/index.html still contains absolute /assets paths, which break packaged Electron file:// loads.");
    return;
  }

  if (!html.includes('src="./assets/') || !html.includes('href="./assets/')) {
    addWarning("dist/public/index.html does not appear to use relative ./assets paths. Re-check packaged Electron asset loading.");
    return;
  }

  addNotice("Built HTML uses relative asset paths for Electron packaging.");
}

function inspectPackageMetadata() {
  const packageJsonPath = expectFile("package.json");
  if (!packageJsonPath) {
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const buildConfig = packageJson.build ?? {};

  if (packageJson.main !== "dist-electron/main.cjs") {
    addError("package.json main must point to dist-electron/main.cjs for packaged desktop builds.");
  } else {
    addNotice("package.json main entry points to the bundled Electron main process.");
  }

  if (buildConfig.productName !== "DevDeck") {
    addError('electron-builder productName must stay set to "DevDeck".');
  } else {
    addNotice("electron-builder productName is set to DevDeck.");
  }

  if (buildConfig.afterSign !== "script/notarize.cjs") {
    addError("electron-builder afterSign hook must point to script/notarize.cjs.");
  } else {
    addNotice("electron-builder afterSign hook is configured.");
  }
}

function inspectCredentials() {
  const signingConfigured = hasEnv("CSC_LINK") && hasEnv("CSC_KEY_PASSWORD");
  const notarizationConfigured =
    hasEnv("APPLE_NOTARY_PROFILE") ||
    (hasEnv("APPLE_ID") &&
      hasEnv("APPLE_APP_SPECIFIC_PASSWORD") &&
      hasEnv("APPLE_TEAM_ID"));
  const githubOAuthConfigured = hasEnv("DEVDECK_GITHUB_CLIENT_ID");

  if (signingConfigured) {
    addNotice("Signing credentials are configured.");
  } else if (requireSigning) {
    addError("Missing signing credentials: configure CSC_LINK and CSC_KEY_PASSWORD.");
  } else {
    addWarning("Signing credentials are not configured; release artifacts will fall back to ad-hoc or unsigned output.");
  }

  if (notarizationConfigured) {
    addNotice("Notarization credentials are configured.");
  } else if (requireNotarization) {
    addError(
      "Missing notarization credentials: configure APPLE_NOTARY_PROFILE or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID.",
    );
  } else {
    addWarning("Notarization credentials are not configured; public macOS releases should not ship without them.");
  }

  if (githubOAuthConfigured) {
    addNotice("DEVDECK_GITHUB_CLIENT_ID is configured for in-app GitHub device flow.");
  } else if (requireGitHubAuth) {
    addError("Missing DEVDECK_GITHUB_CLIENT_ID; shipped builds should include GitHub device-flow sign-in.");
  } else {
    addWarning("DEVDECK_GITHUB_CLIENT_ID is not configured; users will need to paste a token manually.");
  }
}

function inspectArtifacts() {
  if (!requireArtifacts && !verifyCodesign && !verifyNotarization) {
    return;
  }

  const appBundlePath = findBuiltAppBundle();
  if (!appBundlePath) {
    addError("Expected a packaged DevDeck.app in release/mac-*/DevDeck.app.");
    return;
  }

  addNotice(`Found packaged app bundle at ${path.relative(root, appBundlePath)}.`);

  if (verifyCodesign) {
    try {
      execFileSync("codesign", ["--verify", "--deep", "--strict", appBundlePath], {
        stdio: "pipe",
      });
      addNotice("codesign verification passed.");
    } catch (error) {
      addError(
        `codesign verification failed for ${path.relative(root, appBundlePath)}.`,
      );
    }
  }

  if (verifyNotarization) {
    try {
      execFileSync("xcrun", ["stapler", "validate", appBundlePath], {
        stdio: "pipe",
      });
      addNotice("Notarization ticket validation passed.");
    } catch (error) {
      addError(
        `Notarization validation failed for ${path.relative(root, appBundlePath)}.`,
      );
    }
  }
}

const generatedIconPath = path.join(root, "build", "icon.icns");
expectFile("build/icon.svg");
expectFile("build/entitlements.mac.plist");
expectFile("script/notarize.cjs");

if (fs.existsSync(generatedIconPath)) {
  addNotice("Found build/icon.icns");
} else if (requireArtifacts || verifyCodesign || verifyNotarization) {
  addError("Missing required file: build/icon.icns");
} else {
  addWarning("build/icon.icns has not been generated yet; packaging will create it from build/icon.svg.");
}

inspectPackageMetadata();
inspectBuiltIndexHtml();
inspectCredentials();
inspectArtifacts();

for (const notice of notices) {
  console.log(`[release-check] OK: ${notice}`);
}

for (const warning of warnings) {
  console.warn(`[release-check] WARN: ${warning}`);
}

for (const error of errors) {
  console.error(`[release-check] ERROR: ${error}`);
}

if (errors.length > 0) {
  console.error(
    `[release-check] Failed with ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
  );
  process.exit(1);
}

console.log(
  `[release-check] Passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`,
);
