import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { mkdir } from "fs/promises";
import path from "path";

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = (process.argv[2] === "production");
const outdir = "dist";

// Ensure the dist directory exists
try {
    await mkdir(outdir, { recursive: true });
} catch (err) {
    console.error(`Error creating ${outdir} directory:`, err);
}

const context = await esbuild.context({
    banner: {
        js: banner,
    },
    entryPoints: ["main.ts", "embed.js"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        ...builtins],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outdir: outdir,
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}
