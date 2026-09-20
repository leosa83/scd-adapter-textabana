import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Keep these exact bytes unchanged between hashing and transporting the module.
export async function integrationPackage() {
  const content = await readFile(new URL("./module.js", import.meta.url), "utf8");
  const digest = `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
  const manifest = {
    schema: "textabana.module-manifest/lab-v1",
    namespace: "org.textabana.docs",
    version: "1.0.0",
    entrypoint: "examples/integration/module.js",
    digest,
    functions: [{ name: "documented_upper", state: "run", determinism: "deterministic", effects: ["channel:docs.metrics"] }],
    capabilities: { required: [], channels: ["docs.metrics"], resources: [] },
  };
  return {
    modules: [{ path: manifest.entrypoint, content, digest, manifest }],
    options: {
      moduleLock: { schema: "textabana.module-lock/lab-v1", packages: [{ namespace: manifest.namespace, version: manifest.version, entrypoint: manifest.entrypoint, digest }] },
      capabilityGrants: ["channel:docs.metrics"],
      strictChannels: true,
    },
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(`${JSON.stringify(await integrationPackage(), null, 2)}\n`);
}
