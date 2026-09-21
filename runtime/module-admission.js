import { normalizePath } from "./lab-values.js";

const moduleNamespacePattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/;
const moduleVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function sha256Digest(source) {
  if (!globalThis.crypto?.subtle) {
    const error = new Error("Säkra modulpaket kräver Web Crypto SHA-256 i hosten.");
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
    const error = new Error("Säkra modulpaket kräver options.moduleLock.packages."); error.code = "TBA-MODULE-LOCK-LAB"; throw error;
  }
  const lock = new Map(options.moduleLock.packages.map((entry) => [`${entry.namespace}@${entry.version}`, entry]));
  if (lock.size !== options.moduleLock.packages.length) { const error = new Error("Lockfilen innehåller duplicerade paket."); error.code = "TBA-MODULE-LOCK-LAB"; throw error; }
  const grants = new Set(Array.isArray(options.capabilityGrants) ? options.capabilityGrants.map(String) : []);
  const seen = new Set();
  for (const moduleFile of modules) {
    const manifest = moduleFile.manifest;
    if (!record(manifest) || manifest.schema !== "textabana.module-manifest/lab-v1") {
      const error = new Error(`Modulen ${moduleFile.path || "–"} saknar ett giltigt manifest.`); error.code = "TBA-MODULE-MANIFEST-LAB"; throw error;
    }
    const namespace = String(manifest.namespace || "");
    const version = String(manifest.version || "");
    const identity = `${namespace}@${version}`;
    if (typeof manifest.namespace !== "string" || typeof manifest.version !== "string" || !moduleNamespacePattern.test(namespace) || !moduleVersionPattern.test(version)) {
      const error = new Error(`Modulmanifestet har ogiltigt namespace eller version: ${identity}.`); error.code = "TBA-MODULE-IDENTITY-LAB"; throw error;
    }
    if (seen.has(identity)) { const error = new Error(`Modulpaketet ${identity} förekommer mer än en gång.`); error.code = "TBA-MODULE-DUPLICATE-LAB"; throw error; }
    seen.add(identity);
    if (!nonemptyString(manifest.entrypoint) || normalizePath(manifest.entrypoint) !== normalizePath(moduleFile.path)) {
      const error = new Error(`Modulpaketet ${identity} har en entrypoint som inte matchar transportens path.`); error.code = "TBA-MODULE-ENTRYPOINT-LAB"; throw error;
    }
    const actualDigest = await sha256Digest(String(moduleFile.content || ""));
    if (moduleFile.digest !== actualDigest || manifest.digest !== actualDigest) {
      const error = new Error(`Modulpaketet ${identity} matchar inte sitt SHA-256-digest.`); error.code = "TBA-MODULE-DIGEST-LAB"; throw error;
    }
    const locked = lock.get(identity);
    if (!locked || locked.digest !== actualDigest || normalizePath(locked.entrypoint) !== normalizePath(moduleFile.path)) {
      const error = new Error(`Lockfilen låser inte exakt ${identity}.`); error.code = "TBA-MODULE-LOCK-LAB"; throw error;
    }
    const capabilities = manifest.capabilities || {};
    if (!record(capabilities) || !["required", "channels", "resources"].every((field) => stringList(capabilities[field]))) {
      const error = new Error(`Modulpaketet ${identity} måste deklarera required, channel och resource capabilities.`); error.code = "TBA-MODULE-CAPABILITIES-LAB"; throw error;
    }
    const required = [...capabilities.required, ...capabilities.channels.map((name) => `channel:${name}`), ...capabilities.resources.map((name) => `resource:${name}`)];
    const denied = required.find((capability) => !grants.has(capability));
    if (denied) { const error = new Error(`Modulpaketet ${identity} saknar explicit grant för ${denied}.`); error.code = "TBA-MODULE-GRANT-LAB"; throw error; }
    if (!Array.isArray(manifest.functions) || manifest.functions.some((fn) => !record(fn) || !nonemptyString(fn.name) || !["pure", "run", "session"].includes(fn.state) || !["deterministic", "nondeterministic"].includes(fn.determinism) || !stringList(fn.effects)) || new Set(manifest.functions.map((fn) => fn.name)).size !== manifest.functions.length) {
      const error = new Error(`Modulpaketet ${identity} måste deklarera function state, determinism och effects.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
    }
  }
  if (lock.size !== seen.size) { const error = new Error("Lockfilen innehåller paket som inte finns i transporten."); error.code = "TBA-MODULE-LOCK-LAB"; throw error; }
  return modules;
}

function verifyLoadedModuleContracts(modules, registry) {
  for (const moduleFile of modules.filter((item) => item.manifest)) {
    const declared = new Map(moduleFile.manifest.functions.map((fn) => [fn.name, fn]));
    const loaded = [...registry.values()].filter((entry) => entry.modulePath === moduleFile.path);
    if (loaded.length !== declared.size) {
      const error = new Error(`Modulpaketet ${moduleFile.manifest.namespace}@${moduleFile.manifest.version} exporterar inte exakt de låsta funktionerna.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
    }
    for (const entry of loaded) {
      const expected = declared.get(entry.name);
      const descriptor = entry.descriptor || {};
      if (!expected || expected.state !== descriptor.state || expected.determinism !== descriptor.determinism || JSON.stringify(expected.effects) !== JSON.stringify(descriptor.effects || [])) {
        const error = new Error(`Funktionen ${entry.name} avviker från det deklarerade modulmanifestet.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
      }
    }
  }
}

export { verifyLoadedModuleContracts, verifyModulePackages };

