import { build, spawn } from "bun";

const common = {
	target: "browser",
	format: "iife",
	minify: true,
} as const;

const entrypoints = [
	{ src: "./src/index.ts", name: "databuddy" },
	{ src: "./src/vitals.ts", name: "vitals" },
	{ src: "./src/errors.ts", name: "errors" },
];

for (const { src, name } of entrypoints) {
	await build({
		...common,
		entrypoints: [src],
		outdir: "./dist",
		naming: `${name}.js`,
		define: {
			"process.env.DATABUDDY_DEBUG": "false",
		},
	});
}

for (const { src, name } of entrypoints) {
	await build({
		...common,
		entrypoints: [src],
		outdir: "./dist",
		naming: `${name}-debug.js`,
		define: {
			"process.env.DATABUDDY_DEBUG": "true",
		},
	});
}

console.log("Running tests...");

const testProcess = spawn(["bun", "run", "test:e2e"], {
	stdout: "inherit",
	stderr: "inherit",
	cwd: import.meta.dir,
});

const exitCode = await testProcess.exited;

if (exitCode !== 0) {
	console.error("Tests failed! Build/Release aborted.");
	process.exit(exitCode);
}

console.log("Tests passed!");
