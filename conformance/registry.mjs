import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";

export async function verifyRegistry(filename) {
  if (filename instanceof URL) filename = fileURLToPath(filename);
  const registry = parseStrictJson(await readFile(filename, "utf8"));
  if (registry.schema !== "textabana.package-registry/v1" || !Array.isArray(registry.packages)) throw new Error("Invalid registry schema.");
  const root = await realpath(dirname(filename));
  const identities = new Set();
  const packages = [];
  for (const entry of registry.packages) {
    const identity = `${entry.namespace}@${entry.version}`;
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/.test(entry.namespace) || !/^\d+\.\d+\.\d+$/.test(entry.version) || !["adapter", "module"].includes(entry.kind) || identities.has(identity)) throw new Error(`Invalid or duplicate package: ${identity}`);
    identities.add(identity);
    if (!entry.manifest || await canonicalDigest(entry.manifest) !== entry.manifestDigest || !Array.isArray(entry.files) || !entry.files.length) throw new Error(`Manifest mismatch: ${identity}`);
    const seen = new Set();
    for (const file of entry.files) {
      if (typeof file.path !== "string" || isAbsolute(file.path) || file.path.split(/[\\/]/).some((part) => !part || part === "." || part === "..") || seen.has(file.path)) throw new Error("Invalid or duplicate package path.");
      seen.add(file.path);
      const path = await realpath(resolve(root, file.path));
      const local = relative(root, path);
      if (local === ".." || local.startsWith("../") || isAbsolute(local)) throw new Error("Package path escapes registry root.");
      const actual = `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
      if (actual !== file.digest) throw new Error(`File digest mismatch: ${file.path}`);
    }
    if (!seen.has(entry.manifest.entrypoint)) throw new Error(`Entrypoint is not locked: ${identity}`);
    const { digest, ...payload } = entry;
    if (digest !== await canonicalDigest(payload)) throw new Error(`Package digest mismatch: ${identity}`);
    packages.push({ identity, kind: entry.kind, digest, status: "verified" });
  }
  return { schema: "textabana.registry-check/v1", registryDigest: await canonicalDigest(registry), packages, status: "passed", trust: "local-integrity-only", executesPackages: false };
}
