import { mkdir, writeFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import standalone from "ajv/dist/standalone/index.js";
import { build } from "esbuild";
import { semanticBundleSchema } from "../contracts/semantic-bundle-v1.js";

export async function buildSemanticContract() {
  const ajv = new Ajv2020({ strict: true, allErrors: false, code: { source: true }, ownProperties: true });
  const validator = ajv.compile(semanticBundleSchema);
  const compiled = await build({ stdin: { contents: standalone(ajv, validator), resolveDir: new URL("..", import.meta.url).pathname, sourcefile: "semantic-validator.cjs", loader: "js" }, bundle: true, platform: "browser", format: "esm", target: "es2022", minify: true, write: false, legalComments: "none" });
  await mkdir(new URL("../public/contracts/", import.meta.url), { recursive: true });
  await writeFile(new URL("../public/contracts/semantic-bundle-v1.schema.json", import.meta.url), `${JSON.stringify(semanticBundleSchema, null, 2)}\n`);
  await writeFile(new URL("../runtime/generated/semantic-bundle-validator.js", import.meta.url), `// Generated from contracts/semantic-bundle-v1.js by scripts/build-semantic-contract.mjs.\n${compiled.outputFiles[0].text}`);
}

if (process.argv[1] && new URL(process.argv[1], "file:").href === import.meta.url) await buildSemanticContract();
