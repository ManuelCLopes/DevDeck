const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

module.exports = async function notarize(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const notaryProfile = process.env.APPLE_NOTARY_PROFILE;
  const appleId = process.env.APPLE_ID;
  const appleAppSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!notaryProfile && (!appleId || !appleAppSpecificPassword || !appleTeamId)) {
    console.log(
      "Skipping notarization: configure APPLE_NOTARY_PROFILE or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID.",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    console.log(`Skipping notarization: ${appPath} does not exist.`);
    return;
  }

  console.log(`Validating signature for ${appPath}...`);
  await execFileAsync("codesign", ["--verify", "--deep", "--strict", appPath]);

  console.log(`Submitting ${appPath} for notarization...`);
  const notarytoolArgs = ["notarytool", "submit", appPath, "--wait"];
  if (notaryProfile) {
    notarytoolArgs.push("--keychain-profile", notaryProfile);
  } else {
    notarytoolArgs.push(
      "--apple-id",
      appleId,
      "--password",
      appleAppSpecificPassword,
      "--team-id",
      appleTeamId,
    );
  }

  await execFileAsync("xcrun", notarytoolArgs);

  await execFileAsync("xcrun", ["stapler", "staple", appPath]);
  console.log(`Stapled notarization ticket to ${appPath}.`);
};
