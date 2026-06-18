import { build, context } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: path.join(outdir, "extension.js"),
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
  treeShaking: true,
};

const webviewOptions = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  outfile: path.join(outdir, "webview/main.js"),
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
  treeShaking: true,
};

if (watch) {
  const ctxExt = await context(extensionOptions);
  const ctxWebview = await context(webviewOptions);
  await Promise.all([ctxExt.watch(), ctxWebview.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([build(extensionOptions), build(webviewOptions)]);
  await copyFile("src/webview/style.css", path.join(outdir, "webview/style.css"));
  console.log("Build complete.");
}