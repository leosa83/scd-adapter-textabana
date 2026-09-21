import { normalizePath } from "./lab-values.js";

const moduleNamespacePattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/;
const moduleVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function sha256Digest(source) {
  if (!globalThis.crypto?.subtle) {
    const error = new Error("Verified module packages require Web Crypto SHA-256 in the host.");
    error.code = "TBA-MODULE-CRYPTO-LAB";
    throw error;
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function verifyModulePackages(modules, options) {
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const nonemptyString = (value) => typeof value === "string" && value.trim().length > 0;
  const stringList = (value) => Array.isArray(value) && value.every(nonemptyString);
  if (!options.moduleLock && !modules.some((module) => module.manifest || module.digest)) return modules;
  if (options.moduleLock?.schema !== "textabana.module-lock/lab-v1" || !Array.isArray(options.moduleLock?.packages) || options.moduleLock.packages.some((entry) => !record(entry) || !["namespace", "version", "entrypoint", "digest"].every((key) => nonemptyString(entry[key])))) {
    const error = new Error("Verified module packages require options.moduleLock.packages."); error.code = "TBA-MODULE-LOCK-LAB"; throw error;
  }
  const lock = new Map(options.moduleLock.packages.map((entry) => [`${entry.namespace}@${entry.version}`, entry]));
  if (lock.size !== options.moduleLock.packages.length) { const error = new Error("The lockfile contains duplicate packages."); error.code = "TBA-MODULE-LOCK-LAB"; throw error; }
  const grants = new Set(Array.isArray(options.capabilityGrants) ? options.capabilityGrants.map(String) : []);
  const seen = new Set();
  for (const moduleFile of modules) {
    const manifest = moduleFile.manifest;
    if (!record(manifest) || manifest.schema !== "textabana.module-manifest/lab-v1") {
      const error = new Error(`Module ${moduleFile.path || "–"} is missing a valid manifest.`); error.code = "TBA-MODULE-MANIFEST-LAB"; throw error;
    }
    const namespace = String(manifest.namespace || "");
    const version = String(manifest.version || "");
    const identity = `${namespace}@${version}`;
    if (typeof manifest.namespace !== "string" || typeof manifest.version !== "string" || !moduleNamespacePattern.test(namespace) || !moduleVersionPattern.test(version)) {
      const error = new Error(`The module manifest has an invalid namespace or version: ${identity}.`); error.code = "TBA-MODULE-IDENTITY-LAB"; throw error;
    }
    if (seen.has(identity)) { const error = new Error(`Module package ${identity} occurs more than once.`); error.code = "TBA-MODULE-DUPLICATE-LAB"; throw error; }
    seen.add(identity);
    if (!nonemptyString(manifest.entrypoint) || normalizePath(manifest.entrypoint) !== normalizePath(moduleFile.path)) {
      const error = new Error(`Module package ${identity} has an entrypoint that does not match the transport path.`); error.code = "TBA-MODULE-ENTRYPOINT-LAB"; throw error;
    }
    const actualDigest = await sha256Digest(String(moduleFile.content || ""));
    if (moduleFile.digest !== actualDigest || manifest.digest !== actualDigest) {
      const error = new Error(`Module package ${identity} does not match its SHA-256 digest.`); error.code = "TBA-MODULE-DIGEST-LAB"; throw error;
    }
    const locked = lock.get(identity);
    if (!locked || locked.digest !== actualDigest || normalizePath(locked.entrypoint) !== normalizePath(moduleFile.path)) {
      const error = new Error(`The lockfile does not pin exactly ${identity}.`); error.code = "TBA-MODULE-LOCK-LAB"; throw error;
    }
    const capabilities = manifest.capabilities || {};
    if (!record(capabilities) || !["required", "channels", "resources"].every((field) => stringList(capabilities[field]))) {
      const error = new Error(`Module package ${identity} must declare required, channel and resource capabilities.`); error.code = "TBA-MODULE-CAPABILITIES-LAB"; throw error;
    }
    const required = [...capabilities.required, ...capabilities.channels.map((name) => `channel:${name}`), ...capabilities.resources.map((name) => `resource:${name}`)];
    const denied = required.find((capability) => !grants.has(capability));
    if (denied) { const error = new Error(`Module package ${identity} has no explicit grant for ${denied}.`); error.code = "TBA-MODULE-GRANT-LAB"; throw error; }
    if (!Array.isArray(manifest.functions) || manifest.functions.some((fn) => !record(fn) || !nonemptyString(fn.name) || !["pure", "run", "session"].includes(fn.state) || !["deterministic", "nondeterministic"].includes(fn.determinism) || !stringList(fn.effects)) || new Set(manifest.functions.map((fn) => fn.name)).size !== manifest.functions.length) {
      const error = new Error(`Module package ${identity} must declare function state, determinism and effects.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
    }
  }
  if (lock.size !== seen.size) { const error = new Error("The lockfile contains packages absent from the transport."); error.code = "TBA-MODULE-LOCK-LAB"; throw error; }
  return modules;
}

function verifyLoadedModuleContracts(modules, registry) {
  for (const moduleFile of modules.filter((item) => item.manifest)) {
    const declared = new Map(moduleFile.manifest.functions.map((fn) => [fn.name, fn]));
    const loaded = [...registry.values()].filter((entry) => entry.modulePath === moduleFile.path);
    if (loaded.length !== declared.size) {
      const error = new Error(`Module package ${moduleFile.manifest.namespace}@${moduleFile.manifest.version} does not export exactly the pinned functions.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
    }
    for (const entry of loaded) {
      const expected = declared.get(entry.name);
      const descriptor = entry.descriptor || {};
      if (!expected || expected.state !== descriptor.state || expected.determinism !== descriptor.determinism || JSON.stringify(expected.effects) !== JSON.stringify(descriptor.effects || [])) {
        const error = new Error(`Function ${entry.name} differs from the declared module manifest.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
      }
    }
  }
}

export { verifyLoadedModuleContracts, verifyModulePackages };
