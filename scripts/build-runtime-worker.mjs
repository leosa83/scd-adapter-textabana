import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { build } from "esbuild";
import { buildSemanticContract } from "./build-semantic-contract.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generator = path.join(projectRoot, "node_modules", ".bin", "lezer-generator");
const grammar = path.join(projectRoot, "runtime", "textabana.grammar");
const generatedParser = path.join(projectRoot, "runtime", "generated", "textabana-parser.js");
const entry = path.join(projectRoot, "runtime", "worker-entry.js");
const outfile = path.join(projectRoot, "public", "runtime-worker.js");

await buildSemanticContract();

execFileSync(generator, [grammar, "--output", generatedParser], {
  cwd: projectRoot,
  stdio: "inherit",
});

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  treeShaking: true,
  metafile: true,
  banner: { js: "/* Generated from runtime/worker-entry.js and runtime/textabana.grammar. */" },
});

const bytes = result.metafile.outputs[outfile]?.bytes
  ?? Object.values(result.metafile.outputs)[0]?.bytes
  ?? 0;
console.log(`Built public/runtime-worker.js (${bytes} bytes)`);
