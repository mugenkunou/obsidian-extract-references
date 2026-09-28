import esbuild from "esbuild";
import builtins from "builtin-modules";

esbuild.build({
	entryPoints: ["extract.ts"],
	bundle: true,
	external: [...builtins],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: false,
	treeShaking: true,
	outfile: "extract.js",
}).catch(() => process.exit(1));
