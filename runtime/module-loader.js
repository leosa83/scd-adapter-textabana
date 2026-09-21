import { normalizePath, sourceHash } from "./lab-values.js";

/** Trusted JavaScript loader with a cache owned by one kernel instance. */
export function createModuleLoader() {
  const moduleCache = new Map();

  const moduleIncludePattern = /^\s*>>>>!?\s*include\s+["']([^"']+)["']\s*$/;

  async function compileModule(path, source) {
    const cacheKey = `${path}:${sourceHash(source)}`;
    if (moduleCache.has(cacheKey)) return moduleCache.get(cacheKey);
    const definitions = {};
    const define = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path}: define(...) måste få ett objekt med funktioner.`);
      }
      Object.assign(definitions, value);
    };
    const executableSource = source.split("\n").filter((line) => !moduleIncludePattern.test(line)).join("\n");
    try {
      new Function("define", `"use strict";\n${executableSource}\n`)(define);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const moduleDigest = `fnv1a-lab:${sourceHash(source)}`;
    const compiled = Object.entries(definitions).map(([name, raw]) => {
      const descriptor = typeof raw === "function" ? { transform: raw } : raw;
      if (!descriptor || typeof descriptor.transform !== "function") {
        throw new Error(`${path}: funktionen “${name}” saknar transform(input, args, context).`);
      }
      return { name, descriptor, modulePath: path, moduleDigest, moduleSource: source };
    });
    moduleCache.set(cacheKey, compiled);
    return compiled;
  }

  async function loadModule(path, files, registry, loaded, loading) {
    const normalized = normalizePath(path);
    if (loaded.has(normalized)) return;
    if (loading.has(normalized)) throw new Error(`Cirkulär include upptäcktes vid “${normalized}”.`);
    const source = files[normalized];
    if (source === undefined) throw new Error(`Modulen “${normalized}” finns inte i projektet.`);
    loading.add(normalized);
    for (const line of source.split("\n")) {
      const include = line.match(moduleIncludePattern);
      if (include) await loadModule(normalizePath(include[1], normalized), files, registry, loaded, loading);
    }
    for (const entry of await compileModule(normalized, source)) {
      if (registry.has(entry.name)) {
        throw new Error(`Funktionen “${entry.name}” definieras i både ${registry.get(entry.name).modulePath} och ${normalized}.`);
      }
      registry.set(entry.name, entry);
    }
    loading.delete(normalized);
    loaded.add(normalized);
  }
  return { loadModule, clear: () => moduleCache.clear() };
}
