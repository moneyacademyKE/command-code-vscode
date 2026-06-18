import { build, context } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const options = {
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

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(options);
  console.log("Build complete.");
}