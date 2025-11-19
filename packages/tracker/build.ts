import { build } from "bun";

await build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "browser",
    minify: true,
    naming: "databuddy.js",
});

await build({
    entrypoints: ["./src/vitals.ts"],
    outdir: "./dist",
    target: "browser",
    minify: true,
    naming: "vitals.js",
});

await build({
    entrypoints: ["./src/errors.ts"],
    outdir: "./dist",
    target: "browser",
    minify: true,
    naming: "errors.js",
});
