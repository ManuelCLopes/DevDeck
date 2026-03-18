const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");

const execFileAsync = promisify(execFile);

module.exports = async function notarize(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleAppSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleAppSpecificPassword || !appleTeamId) {
    console.log("Skipping notarization: Apple notarization credentials are not configured.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`Submitting ${appPath} for notarization...`);

  await execFileAsync("xcrun", [
    "notarytool",
    "submit",
    appPath,
    "--apple-id",
    appleId,
    "--password",
    appleAppSpecificPassword,
    "--team-id",
    appleTeamId,
    "--wait",
  ]);

  await execFileAsync("xcrun", ["stapler", "staple", appPath]);
};
