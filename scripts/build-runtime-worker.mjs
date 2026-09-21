import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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
  banner: { js: "/* Generated from runtime/worker-entry.js and runtime/textabana.grammar. Third-party licenses: runtime-worker.NOTICES.txt */" },
});

// Preserve original notices for every dependency actually shipped in the Worker.
// A new dependency without this license path fails the build for explicit review.
const packages = [...new Set(Object.keys(result.metafile.inputs).flatMap((input) => {
  const match = input.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  return match ? [match[1]] : [];
}))].sort();
const notices = packages.map((name) => {
  const directory = path.join(projectRoot, "node_modules", name);
  const metadata = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  const license = readFileSync(path.join(directory, "LICENSE"), "utf8");
  return `${name}@${metadata.version}\n${"=".repeat(72)}\n${license}`;
});
writeFileSync(path.join(projectRoot, "public", "runtime-worker.NOTICES.txt"), `Third-party notices for runtime-worker.js\nGenerated from the bundled packages' original LICENSE files.\nThis is not a license grant for Textabana itself.\n\n${notices.join("\n\n")}\n`);

const bytes = result.metafile.outputs[outfile]?.bytes
  ?? Object.values(result.metafile.outputs)[0]?.bytes
  ?? 0;
console.log(`Built public/runtime-worker.js (${bytes} bytes)`);
