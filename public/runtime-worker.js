const moduleCache = new Map();
let scopeSequence = 0;

const includePattern = /^\s*>>>>!?\s*include\s+["']([^"']+)["']\s*$/;
const directivePattern = /^\s*>>>>!\s*(.+?)\s*$/;
const scopeOpenPattern = /^\s*>>>>\+\s*(.+?)\s*$/;
const scopeClosePattern = /^\s*<<<<\+\s*(.+?)\s*$/;
const blockOpenPattern = /^\s*>>>>\s*(?![!+])(.+?)\s*$/;
const blockClosePattern = /^\s*<<<<\s*(?![!+])([A-Za-z_][\w.-]*)\s*$/;

function normalizePath(path, from = "") {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const raw = path.startsWith("/") ? path.slice(1) : `${base}${path}`;
  const parts = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function sourceHash(source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function splitExpression(input, separator = "|") {
  const parts = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (const character of input) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === "\\") { current += character; escaped = true; continue; }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; current += character; continue; }
    if (character === "[" || character === "{" || character === "(") depth += 1;
    if (character === "]" || character === "}" || character === ")") depth -= 1;
    if (character === separator && depth === 0) { parts.push(current.trim()); current = ""; }
    else current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function tokenizeStage(source) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (const character of source.trim()) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === "\\") { current += character; escaped = true; continue; }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; current += character; continue; }
    if (character === "[" || character === "{" || character === "(") depth += 1;
    if (character === "]" || character === "}" || character === ")") depth -= 1;
    if (/\s/.test(character) && depth === 0) {
      if (current) tokens.push(current);
      current = "";
    } else current += character;
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseValue(raw) {
  if (raw === undefined) return true;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    if (raw.startsWith('"')) {
      try { return JSON.parse(raw); } catch { return raw.slice(1, -1); }
    }
    return raw.slice(1, -1).replace(/\\'/g, "'");
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return splitExpression(inner, ",").map((item) => parseValue(item.trim()));
  }
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function parseStage(source, line) {
  const tokens = tokenizeStage(source);
  const name = tokens.shift();
  if (!name || !/^@?[A-Za-z_][\w.-]*$/.test(name)) {
    throw new Error(`Rad ${line}: ogiltigt steg i “${source}”.`);
  }
  const args = {};
  for (const token of tokens) {
    const equals = token.indexOf("=");
    const key = equals === -1 ? token : token.slice(0, equals);
    const value = equals === -1 ? undefined : token.slice(equals + 1);
    if (!/^@?[A-Za-z_][\w.-]*$/.test(key)) throw new Error(`Rad ${line}: ogiltigt argument “${token}”.`);
    args[key] = parseValue(value);
  }
  return { name, args, line };
}

function withoutSystemArgs(args) {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith("@")));
}

function serializableMeta(name, descriptor, modulePath) {
  return {
    name,
    modulePath,
    description: descriptor.description || "Ingen beskrivning angiven.",
    args: descriptor.args || {},
    accepts: descriptor.accepts || "text",
    returns: descriptor.returns || "text",
    behavior: descriptor.behavior || "unspecified",
  };
}

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
  const executableSource = source.split("\n").filter((line) => !includePattern.test(line)).join("\n");
  try {
    new Function("define", `"use strict";\n${executableSource}\n`)(define);
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const compiled = Object.entries(definitions).map(([name, raw]) => {
    const descriptor = typeof raw === "function" ? { transform: raw } : raw;
    if (!descriptor || typeof descriptor.transform !== "function") {
      throw new Error(`${path}: funktionen “${name}” saknar transform(input, args, context).`);
    }
    return { name, descriptor, modulePath: path };
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
    const include = line.match(includePattern);
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

function stringifyResult(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n");
  return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

async function callFunction(stage, input, registry, diagnostics, contextExtra = {}) {
  const entry = registry.get(stage.name);
  if (!entry) throw new Error(`Rad ${stage.line}: okänd funktion “${stage.name}”.`);
  const warnings = [];
  const context = {
    functionName: stage.name,
    modulePath: entry.modulePath,
    warn(message) { warnings.push(String(message)); },
    ...contextExtra,
  };
  const output = await entry.descriptor.transform(input, withoutSystemArgs(stage.args), context);
  for (const message of warnings) diagnostics.push({ level: "warning", line: stage.line, message });
  return output;
}

function sortScopes(scopes, direction = "asc") {
  return [...scopes].sort((left, right) => {
    const a = Number.isFinite(left.order) ? left.order : left.sequence;
    const b = Number.isFinite(right.order) ? right.order : right.sequence;
    return direction === "desc" ? b - a : a - b;
  });
}

function selectScopes(scopes, controls = {}) {
  const mode = controls.mode || "default";
  const selection = Array.isArray(controls.selection) ? controls.selection.map(String) : [];
  let selected = scopes;
  const matches = (scope) => selection.includes(scope.id) || selection.includes(`@${scope.id}`) || selection.includes(scope.name);
  if (mode === "none" || mode === "explicit") selected = [];
  if (mode === "only") selected = scopes.filter(matches);
  if (mode === "except") selected = scopes.filter((scope) => !matches(scope));
  return sortScopes(selected, controls.order || "asc");
}

async function applyScopes(value, scopes, registry, diagnostics, line, controls = {}) {
  let output = value;
  for (const scope of selectScopes(scopes, controls)) {
    output = await callFunction(
      { name: scope.name, args: scope.args, line },
      output,
      registry,
      diagnostics,
      { modality: "interval", scopeId: scope.id },
    );
  }
  return output;
}

function stripPropertySyntax(source) {
  return source
    .split("\n")
    .filter((line) => !/^\s*\{(?:[.#][\w-]+|[\w-]+=(?:"[^"]*"|'[^']*'|[^\s}]+))(?:\s+(?:[.#][\w-]+|[\w-]+=(?:"[^"]*"|'[^']*'|[^\s}]+)))*\}\s*$/.test(line))
    .map((line) => line.replace(/^(#{1,6}\s+.*?)\s+\{[^{}]+\}\s*$/, "$1"))
    .join("\n");
}

async function renderDocument(documentSource, registry, diagnostics, config) {
  const lines = documentSource.split("\n");

  async function renderSequence(startIndex, expectedClose = null, inheritedForbidden = [], blockCross = "error") {
    let index = startIndex;
    let output = "";
    let buffer = "";
    let scopes = [];

    const flush = async (line) => {
      if (!buffer) return;
      output += stringifyResult(await applyScopes(stripPropertySyntax(buffer), scopes, registry, diagnostics, line, { order: config.scopeOrder }));
      buffer = "";
    };

    while (index < lines.length) {
      const line = lines[index];
      const blockClose = line.match(blockClosePattern);
      if (blockClose) {
        if (!expectedClose) throw new Error(`Rad ${index + 1}: oväntad slutmarkör för “${blockClose[1]}”.`);
        if (blockClose[1] !== expectedClose) {
          throw new Error(`Rad ${index + 1}: väntade <<<< ${expectedClose}, men hittade <<<< ${blockClose[1]}.`);
        }
        await flush(index + 1);
        if (scopes.length) {
          throw new Error(`Blocket “${expectedClose}” stängs medan intervallet “${scopes.at(-1).id}” fortfarande är öppet. Ange en korsningspolicy eller stäng intervallet först.`);
        }
        return { output, nextIndex: index + 1 };
      }

      if (includePattern.test(line) || directivePattern.test(line)) { index += 1; continue; }

      const scopeOpen = line.match(scopeOpenPattern);
      if (scopeOpen) {
        await flush(index + 1);
        const stage = parseStage(scopeOpen[1], index + 1);
        if (stage.name.startsWith("@")) throw new Error(`Rad ${index + 1}: ett intervall måste öppna en funktion.`);
        scopeSequence += 1;
        scopes.push({
          name: stage.name,
          args: withoutSystemArgs(stage.args),
          id: String(stage.args["@id"] || `${stage.name}-${scopeSequence}`),
          order: stage.args["@order"] === undefined ? null : Number(stage.args["@order"]),
          sequence: scopeSequence,
        });
        index += 1;
        continue;
      }

      const scopeClose = line.match(scopeClosePattern);
      if (scopeClose) {
        await flush(index + 1);
        const rawTarget = scopeClose[1].trim();
        const target = rawTarget.startsWith("@id=") ? rawTarget.slice(4) : rawTarget.replace(/^@/, "");
        let found = -1;
        for (let position = scopes.length - 1; position >= 0; position -= 1) {
          if (scopes[position].id === target || scopes[position].name === target) { found = position; break; }
        }
        if (found === -1) {
          if (inheritedForbidden.includes(target) && blockCross === "error") {
            throw new Error(`Rad ${index + 1}: intervallet “${target}” korsar blockgränsen. Default @cross=error stoppar tvetydig partiell överlappning.`);
          }
          throw new Error(`Rad ${index + 1}: inget aktivt intervall matchar “${target}”.`);
        }
        scopes.splice(found, 1);
        index += 1;
        continue;
      }

      const blockOpen = line.match(blockOpenPattern);
      if (blockOpen) {
        await flush(index + 1);
        let header = blockOpen[1].trim();
        let cursor = index + 1;
        while (cursor < lines.length && /^\s*(?:\||@)/.test(lines[cursor])) {
          header += ` ${lines[cursor].trim()}`;
          cursor += 1;
        }
        const stages = splitExpression(header).map((part) => parseStage(part, index + 1));
        const first = stages[0];
        if (!first || first.name.startsWith("@")) throw new Error(`Rad ${index + 1}: blocket måste börja med en funktion.`);
        const cross = String(first.args["@cross"] || "error");
        const ambient = [...scopes];
        const inner = await renderSequence(cursor, first.name, ambient.flatMap((scope) => [scope.id, scope.name]), cross);
        let value = inner.output;
        const explicitIntervalStage = stages.some((stage) => stage.name === "@intervals");
        for (const stage of stages) {
          if (stage.name === "@intervals") {
            value = await applyScopes(value, ambient, registry, diagnostics, stage.line, {
              mode: stage.args.only ? "only" : stage.args.except ? "except" : "default",
              selection: stage.args.only || stage.args.except || [],
              order: stage.args.order || config.scopeOrder,
            });
          } else {
            value = await callFunction(stage, value, registry, diagnostics, { modality: "block" });
          }
        }
        const inheritMode = String(first.args["@inherit"] || "default");
        if (!explicitIntervalStage && inheritMode !== "none" && inheritMode !== "explicit") {
          value = await applyScopes(value, ambient, registry, diagnostics, index + 1, {
            mode: inheritMode,
            selection: first.args["@intervals"] || [],
            order: config.scopeOrder,
          });
        }
        output += stringifyResult(value);
        index = inner.nextIndex;
        continue;
      }

      buffer += `${line}${index < lines.length - 1 ? "\n" : ""}`;
      index += 1;
    }

    await flush(lines.length);
    if (expectedClose) throw new Error(`Blocket “${expectedClose}” saknar slutmarkören <<<< ${expectedClose}.`);
    if (scopes.length) throw new Error(`Intervallet “${scopes.at(-1).id}” är fortfarande öppet vid dokumentets slut.`);
    return { output, nextIndex: index };
  }

  return stripPropertySyntax((await renderSequence(0)).output);
}

self.onmessage = async (event) => {
  const { runId, documentSource, modules } = event.data;
  const started = performance.now();
  const diagnostics = [];
  try {
    const files = Object.fromEntries(modules.map((module) => [normalizePath(module.path), module.content]));
    const registry = new Map();
    const loaded = new Set();
    const loading = new Set();
    const config = { scopeOrder: "asc" };
    for (const line of documentSource.split("\n")) {
      const include = line.match(includePattern);
      if (include) await loadModule(normalizePath(include[1]), files, registry, loaded, loading);
      const directive = line.match(directivePattern);
      if (directive && directive[1].startsWith("config ")) {
        const stage = parseStage(directive[1], 1);
        if (stage.args["scope-order"] === "declaration:desc") config.scopeOrder = "desc";
      }
    }
    const output = await renderDocument(documentSource, registry, diagnostics, config);
    self.postMessage({
      runId,
      ok: true,
      output,
      diagnostics,
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath)),
      modulesLoaded: loaded.size,
      duration: performance.now() - started,
    });
  } catch (error) {
    self.postMessage({
      runId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics,
      duration: performance.now() - started,
    });
  }
};
