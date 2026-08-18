import { build, context } from "esbuild";
import path from "path";

const isWatchMode = process.argv.includes("--watch");
const root = path.resolve(import.meta.dirname, "..");

const sharedConfig = {
  bundle: true,
  entryPoints: {
    main: path.join(root, "electron", "main.ts"),
    preload: path.join(root, "electron", "preload.ts"),
  },
  format: "cjs" as const,
  logLevel: "info" as const,
  // electron/persistence/sqlite-driver.ts falls back to
  // `createRequire(import.meta.url)` only when the real CJS `require` is
  // absent (i.e. never in this bundle) — esbuild still warns about
  // `import.meta` in "cjs" output even though that branch is dead here.
  logOverride: { "empty-import-meta": "silent" as const },
  outdir: path.join(root, "dist-electron"),
  outExtension: {
    ".js": ".cjs",
  },
  platform: "node" as const,
  sourcemap: true,
  target: "node20",
  external: ["electron", "node-pty", "better-sqlite3"],
};

async function run() {
  if (isWatchMode) {
    const buildContext = await context(sharedConfig);
    await buildContext.watch();
    console.log("watching electron bundles...");
    return;
  }

  await build(sharedConfig);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
