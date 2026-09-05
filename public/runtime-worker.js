const moduleCache = new Map();
let scopeSequence = 0;

const channelNamePattern = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

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
    outputs: Array.isArray(descriptor.outputs) && descriptor.outputs.length
      ? descriptor.outputs.map(String)
      : ["render"],
    channels: serializableValue(descriptor.channels || {}),
  };
}

function serializableValue(value, seen = new WeakSet()) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (Array.isArray(value)) return value.map((item) => serializableValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = serializableValue(item, seen);
    seen.delete(value);
    return result;
  }
  return String(value);
}

function valueKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function valueSummary(value) {
  let serialized;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(serializableValue(value));
  } catch {
    serialized = String(value);
  }
  const normalized = String(serialized ?? "").replace(/\s+/g, " ").trim();
  return {
    kind: valueKind(value),
    length: normalized.length,
    hash: `fnv1a:${sourceHash(normalized)}`,
    preview: normalized.length > 132 ? `${normalized.slice(0, 129)}…` : normalized,
  };
}

function inferChannelDescriptor(name, value) {
  const kind = valueKind(value);
  return {
    name,
    payloadKind: kind === "array" ? "array" : kind === "object" ? "object" : kind === "string" ? "text" : kind,
    mediaType: kind === "string" ? "text/plain" : "application/json",
    schemaRef: `schema:playground/${name}/inferred`,
    delivery: "snapshot",
    persistence: name === "diagnostics" ? "transient" : "durable",
    ordering: "global-sequence",
    key: [],
    required: false,
    sensitivity: "internal",
    declared: false,
  };
}

function validatePayload(descriptor, value) {
  const schema = descriptor && descriptor.schema;
  if (!schema || typeof schema !== "object") return null;
  const actual = valueKind(value);
  const expected = schema.type;
  const compatible = expected === undefined
    || expected === actual
    || (expected === "number" && actual === "number")
    || (expected === "integer" && actual === "number" && Number.isInteger(value));
  if (!compatible) return `payload måste vara ${expected}, men fick ${actual}`;
  if (expected === "object" && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (!Object.hasOwn(value || {}, field)) return `payload saknar obligatoriska fältet “${field}”`;
    }
  }
  if (expected === "object" && schema.properties && typeof schema.properties === "object") {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value || {}, field) || !fieldSchema || typeof fieldSchema !== "object" || !fieldSchema.type) continue;
      const fieldValue = value[field];
      const actualFieldType = valueKind(fieldValue);
      const validField = fieldSchema.type === actualFieldType
        || (fieldSchema.type === "integer" && actualFieldType === "number" && Number.isInteger(fieldValue));
      if (!validField) return `fältet “${field}” måste vara ${fieldSchema.type}, men fick ${actualFieldType}`;
    }
  }
  return null;
}

function serializationProblem(value, seen = new WeakSet(), path = "payload") {
  if (value === undefined) return `${path} är undefined`;
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return `${path} har typen ${typeof value}`;
  if (typeof value === "number" && !Number.isFinite(value)) return `${path} är inte ett ändligt tal`;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return `${path} är cyklisk`;
  seen.add(value);
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, item] of entries) {
    const problem = serializationProblem(item, seen, `${path}.${key}`);
    if (problem) return problem;
  }
  seen.delete(value);
  return null;
}

function createChannelBus({ runId, documentVersion, documentPath, documentSource, strictChannels = false }) {
  const channels = new Map();
  const descriptors = new Map();
  const anchors = new Map();
  const sourceMaps = [];
  const executionTrace = [];
  const documentLines = documentSource.split("\n");
  let sequence = 0;
  let stageSequence = 0;

  const declare = (name, rawDescriptor = {}) => {
    const channel = String(name || "").trim();
    if (!channelNamePattern.test(channel) || channel === "render") return;
    const descriptor = {
      name: channel,
      payloadKind: rawDescriptor.payloadKind || "object",
      mediaType: rawDescriptor.mediaType || "application/json",
      schemaRef: rawDescriptor.schemaRef || `schema:playground/${channel}/v1`,
      delivery: rawDescriptor.delivery || "snapshot",
      persistence: rawDescriptor.persistence || (channel === "diagnostics" ? "transient" : "durable"),
      ordering: rawDescriptor.ordering || "global-sequence",
      key: Array.isArray(rawDescriptor.key) ? rawDescriptor.key.map(String) : [],
      required: Boolean(rawDescriptor.required),
      sensitivity: rawDescriptor.sensitivity || "internal",
      declared: rawDescriptor.declared !== false,
      ...(rawDescriptor.schema ? { schema: serializableValue(rawDescriptor.schema) } : {}),
    };
    if (!descriptors.has(channel)) descriptors.set(channel, descriptor);
  };

  declare("system.out", {
    payloadKind: "object",
    schemaRef: "textabana.system.out/v2",
    key: ["target.anchorRef"],
    declared: true,
  });
  declare("diagnostics", {
    payloadKind: "object",
    schemaRef: "textabana.diagnostic/v1",
    persistence: "transient",
    declared: true,
  });

  const positionForLine = (line) => {
    const prefix = documentLines.slice(0, Math.max(0, line - 1)).join("\n");
    const start = Array.from(prefix + (line > 1 ? "\n" : "")).length;
    const exact = documentLines[Math.max(0, line - 1)] || "";
    return { start, end: start + Array.from(exact).length, exact };
  };

  const createAnchor = ({ line, row, rowId, mode, column, endLine, source, execution }) => {
    const position = positionForLine(line);
    const stablePart = mode === "row" && rowId
      ? `row:${sourceHash(String(rowId))}`
      : `line:${documentVersion}:${line}:${column || 1}`;
    const anchorId = `anchor:${stablePart}`;
    const previousLine = documentLines[Math.max(0, line - 2)] || "";
    const nextLine = documentLines[line] || "";
    const anchor = {
      anchorId,
      target: {
        resourceId: `doc:${documentPath}`,
        version: `fnv1a:${documentVersion}`,
        view: "source",
        cellId: null,
      },
      selectors: [
        {
          type: "TextPositionSelector",
          start: position.start,
          end: position.end,
          unit: "unicode-code-point",
        },
        {
          type: "TextQuoteSelector",
          exact: position.exact,
          prefix: previousLine.slice(-48),
          suffix: nextLine.slice(0, 48),
        },
      ],
      projections: {
        row,
        rowId,
        line,
        ...(column ? { column } : {}),
        ...(endLine ? { endLine } : {}),
      },
      origin: {
        stageId: execution.stageId,
        function: execution.functionName,
        module: execution.modulePath,
      },
    };
    anchors.set(anchorId, anchor);
    return anchor;
  };

  const emit = (channelName, value, location = {}, execution = {}) => {
    const channel = String(channelName || "").trim();
    if (!channelNamePattern.test(channel)) {
      throw new Error(`Ogiltigt kanalnamn “${channel}”. Använd bokstäver, siffror, punkt, kolon, bindestreck eller understreck.`);
    }
    if (channel === "render") {
      throw new Error("Kanalen “render” skrivs med funktionens return-värde, inte med context.emit(...).");
    }
    if (channel.startsWith("system.") && channel !== "system.out") {
      throw new Error(`Kanalnamnet “${channel}” är reserverat av Textabana-kärnan.`);
    }

    if (!descriptors.has(channel)) {
      if (strictChannels) {
        throw new Error(`Kanalen “${channel}” saknar deklarerad ChannelDescriptor i strict channel mode.`);
      }
      descriptors.set(channel, inferChannelDescriptor(channel, value));
    }
    if (strictChannels) {
      const problem = serializationProblem(value);
      if (problem) throw new Error(`Kanalen “${channel}”: ${problem} och kan inte serialiseras förlustfritt.`);
    }
    const descriptor = descriptors.get(channel);
    const validationError = validatePayload(descriptor, value);
    if (validationError) throw new Error(`Kanalen “${channel}”: ${validationError}.`);

    const source = execution.source || { startLine: execution.stageLine || 1, endLine: execution.stageLine || 1 };
    const row = Number.isInteger(Number(location.row)) && Number(location.row) > 0
      ? Number(location.row)
      : 1;
    const explicitLine = Number(location.line);
    const lineOffset = Number(location.lineOffset);
    const line = Number.isInteger(explicitLine) && explicitLine > 0
      ? explicitLine
      : Number.isInteger(lineOffset)
        ? Math.max(1, source.startLine + lineOffset)
        : source.startLine;
    const column = Number(location.column);
    const endLine = Number(location.endLine);
    const requestedMapping = location.mapping || source.mapping;
    const mapping = ["exact", "derived", "synthetic"].includes(requestedMapping)
      ? requestedMapping
      : "exact";
    const mode = String(location.mode || location.type || (channel === "system.out" ? "line" : "line"));
    const kind = String(location.kind || (channel === "diagnostics" ? "diagnostic" : channel === "system.out" ? "annotation" : "event"));
    const rowId = location.rowId === undefined
      ? `${documentVersion}:${execution.functionName}:${line}:${row}`
      : String(location.rowId);
    const anchor = createAnchor({ line, row, rowId, mode, column, endLine, source, execution });

    sequence += 1;
    const eventId = `event:${documentVersion}:${String(sequence).padStart(4, "0")}`;
    const event = {
      schema: "textabana.event/v1",
      eventId,
      id: eventId,
      runId,
      runRef: `run:${runId}`,
      documentVersion,
      sequence,
      channel,
      kind,
      phase: "run",
      target: {
        mode,
        anchorRef: anchor.anchorId,
        rowSet: String(location.rowSet || "document"),
        rowId,
        row,
        line,
        ...(Number.isInteger(column) && column > 0 ? { column } : {}),
        ...(Number.isInteger(endLine) && endLine >= line ? { endLine } : {}),
      },
      type: mode,
      row,
      rowId,
      line,
      payload: serializableValue(value),
      source: {
        path: source.path || "document.md",
        startLine: source.startLine,
        endLine: source.endLine,
        mapping,
      },
      origin: {
        stageId: execution.stageId,
        function: execution.functionName,
        module: execution.modulePath,
        modality: execution.modality || "block",
        stageLine: execution.stageLine,
        ...(execution.scopeId ? { scopeId: execution.scopeId } : {}),
      },
      ...(Number.isInteger(column) && column > 0 ? { column } : {}),
      ...(Number.isInteger(endLine) && endLine >= line ? { endLine } : {}),
      provenanceRef: `activity:${execution.stageId}`,
      state: "tentative",
      extensions: {},
    };

    if (!channels.has(channel)) channels.set(channel, []);
    channels.get(channel).push(event);
    sourceMaps.push({
      mappingId: `mapping:${eventId}`,
      outputRef: eventId,
      inputAnchorRefs: [anchor.anchorId],
      mapping: event.source.mapping,
      generatingActivity: event.provenanceRef,
    });
    return event;
  };

  return {
    declare,
    emit,
    recordStage(stage) {
      stageSequence += 1;
      executionTrace.push({
        schema: "textabana.execution-step/lab-v1",
        step: stageSequence,
        stageId: stage.execution.stageId,
        function: stage.execution.functionName,
        module: stage.execution.modulePath,
        modality: stage.execution.modality,
        scopeId: stage.execution.scopeId || null,
        line: stage.execution.stageLine,
        source: stage.execution.source,
        args: serializableValue(stage.args),
        orderKey: [stageSequence, 1, 0],
        status: stage.status,
        input: valueSummary(stage.input),
        output: valueSummary(stage.output),
        duration: stage.duration,
        ...(stage.error ? { error: stage.error } : {}),
      });
    },
    snapshot() {
      return Object.fromEntries([...channels.entries()].map(([name, events]) => [
        name,
        events.map((event) => ({ ...event, state: "committed" })),
      ]));
    },
    descriptorSnapshot() {
      return Object.fromEntries([...descriptors.entries()].map(([name, descriptor]) => [name, descriptor]));
    },
    anchorSnapshot() {
      return [...anchors.values()];
    },
    sourceMapSnapshot() {
      return [...sourceMaps];
    },
    traceSnapshot() {
      return [...executionTrace];
    },
    get size() { return sequence; },
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

async function callFunction(stage, input, registry, diagnostics, channelBus, contextExtra = {}) {
  const entry = registry.get(stage.name);
  if (!entry) throw new Error(`Rad ${stage.line}: okänd funktion “${stage.name}”.`);
  for (const [channelName, descriptor] of Object.entries(entry.descriptor.channels || {})) {
    channelBus.declare(channelName, descriptor);
  }
  const warnings = [];
  const source = contextExtra.source || { startLine: stage.line, endLine: stage.line };
  const execution = {
    stageId: `${contextExtra.modality || "block"}:${contextExtra.scopeId || stage.name}:${stage.line}`,
    functionName: stage.name,
    modulePath: entry.modulePath,
    modality: contextExtra.modality || "block",
    scopeId: contextExtra.scopeId,
    stageLine: stage.line,
    source,
  };
  const emit = (channel, value, location) => channelBus.emit(channel, value, location, execution);
  const systemOut = (value, location) => emit("system.out", value, location);
  systemOut.line = (value, location = {}) => emit("system.out", value, { ...location, mode: location.mode || "line" });
  systemOut.row = (rowId, value, location = {}) => emit("system.out", value, {
    ...location,
    rowId,
    mode: location.mode || "row",
  });
  const context = {
    ...contextExtra,
    functionName: stage.name,
    modulePath: entry.modulePath,
    source: { ...source, stageLine: stage.line },
    emit,
    system: { out: systemOut },
    annotate(value, location = {}) { return emit("system.out", value, { ...location, kind: location.kind || "annotation" }); },
    warn(message, location) {
      const normalized = String(message);
      warnings.push({ message: normalized, location });
      emit("diagnostics", { severity: "warning", level: "warning", message: normalized }, { ...location, kind: "diagnostic" });
    },
  };
  const args = withoutSystemArgs(stage.args);
  const started = performance.now();
  let output;
  try {
    output = await entry.descriptor.transform(input, args, context);
    channelBus.recordStage({
      execution,
      args,
      input,
      output,
      status: "succeeded",
      duration: performance.now() - started,
    });
  } catch (error) {
    channelBus.recordStage({
      execution,
      args,
      input,
      output: null,
      status: "failed",
      duration: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  for (const warning of warnings) {
    const warningLine = Number(warning.location?.line);
    const warningOffset = Number(warning.location?.lineOffset);
    diagnostics.push({
      level: "warning",
      line: Number.isInteger(warningLine) && warningLine > 0
        ? warningLine
        : Number.isInteger(warningOffset)
          ? Math.max(1, source.startLine + warningOffset)
          : source.startLine,
      message: warning.message,
    });
  }
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

async function applyScopes(value, scopes, registry, diagnostics, channelBus, source, controls = {}) {
  let output = value;
  for (const scope of selectScopes(scopes, controls)) {
    output = await callFunction(
      { name: scope.name, args: scope.args, line: scope.openLine },
      output,
      registry,
      diagnostics,
      channelBus,
      { modality: "interval", scopeId: scope.id, source },
    );
  }
  return output;
}

function stripPropertySyntax(source) {
  return source
    .split("\n")
    .map((line) => /^\s*\{(?:[.#][\w-]+|[\w-]+=(?:"[^"]*"|'[^']*'|[^\s}]+))(?:\s+(?:[.#][\w-]+|[\w-]+=(?:"[^"]*"|'[^']*'|[^\s}]+)))*\}\s*$/.test(line)
      ? ""
      : line.replace(/^(#{1,6}\s+.*?)\s+\{[^{}]+\}\s*$/, "$1"))
    .join("\n");
}

async function renderDocument(documentSource, registry, diagnostics, channelBus, config) {
  const lines = documentSource.split("\n");

  async function renderSequence(startIndex, expectedClose = null, inheritedForbidden = [], blockCross = "error") {
    let index = startIndex;
    let output = "";
    let buffer = "";
    let bufferStartLine = null;
    let bufferEndLine = null;
    let scopes = [];

    const flush = async () => {
      if (!buffer) return;
      const source = {
        path: config.documentPath,
        startLine: bufferStartLine || 1,
        endLine: bufferEndLine || bufferStartLine || 1,
      };
      output += stringifyResult(await applyScopes(
        stripPropertySyntax(buffer),
        scopes,
        registry,
        diagnostics,
        channelBus,
        source,
        { order: config.scopeOrder },
      ));
      buffer = "";
      bufferStartLine = null;
      bufferEndLine = null;
    };

    while (index < lines.length) {
      const line = lines[index];
      const blockClose = line.match(blockClosePattern);
      if (blockClose) {
        if (!expectedClose) throw new Error(`Rad ${index + 1}: oväntad slutmarkör för “${blockClose[1]}”.`);
        if (blockClose[1] !== expectedClose) {
          throw new Error(`Rad ${index + 1}: väntade <<<< ${expectedClose}, men hittade <<<< ${blockClose[1]}.`);
        }
        await flush();
        if (scopes.length) {
          throw new Error(`Blocket “${expectedClose}” stängs medan intervallet “${scopes.at(-1).id}” fortfarande är öppet. Ange en korsningspolicy eller stäng intervallet först.`);
        }
        return { output, nextIndex: index + 1 };
      }

      if (includePattern.test(line) || directivePattern.test(line)) {
        await flush();
        index += 1;
        continue;
      }

      const scopeOpen = line.match(scopeOpenPattern);
      if (scopeOpen) {
        await flush();
        const stage = parseStage(scopeOpen[1], index + 1);
        if (stage.name.startsWith("@")) throw new Error(`Rad ${index + 1}: ett intervall måste öppna en funktion.`);
        scopeSequence += 1;
        scopes.push({
          name: stage.name,
          args: withoutSystemArgs(stage.args),
          id: String(stage.args["@id"] || `${stage.name}-${scopeSequence}`),
          order: stage.args["@order"] === undefined ? null : Number(stage.args["@order"]),
          sequence: scopeSequence,
          openLine: stage.line,
        });
        index += 1;
        continue;
      }

      const scopeClose = line.match(scopeClosePattern);
      if (scopeClose) {
        await flush();
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
        await flush();
        const stageSources = splitExpression(blockOpen[1].trim()).map((source) => ({ source, line: index + 1 }));
        let cursor = index + 1;
        while (cursor < lines.length && /^\s*(?:\||@)/.test(lines[cursor])) {
          const continuation = lines[cursor].trim().replace(/^\|\s*/, "");
          for (const source of splitExpression(continuation)) stageSources.push({ source, line: cursor + 1 });
          cursor += 1;
        }
        const stages = stageSources.map((part) => parseStage(part.source, part.line));
        const first = stages[0];
        if (!first || first.name.startsWith("@")) throw new Error(`Rad ${index + 1}: blocket måste börja med en funktion.`);
        const cross = String(first.args["@cross"] || "error");
        const ambient = [...scopes];
        const inner = await renderSequence(cursor, first.name, ambient.flatMap((scope) => [scope.id, scope.name]), cross);
        let value = inner.output;
        const blockSource = {
          path: config.documentPath,
          startLine: Math.min(lines.length, cursor + 1),
          endLine: Math.max(Math.min(lines.length, cursor + 1), inner.nextIndex - 1),
        };
        const explicitIntervalStage = stages.some((stage) => stage.name === "@intervals");
        for (const stage of stages) {
          if (stage.name === "@intervals") {
            value = await applyScopes(value, ambient, registry, diagnostics, channelBus, blockSource, {
              mode: stage.args.only ? "only" : stage.args.except ? "except" : "default",
              selection: stage.args.only || stage.args.except || [],
              order: stage.args.order || config.scopeOrder,
            });
          } else {
            value = await callFunction(stage, value, registry, diagnostics, channelBus, {
              modality: "block",
              source: blockSource,
            });
          }
        }
        const inheritMode = String(first.args["@inherit"] || "default");
        if (!explicitIntervalStage && inheritMode !== "none" && inheritMode !== "explicit") {
          value = await applyScopes(value, ambient, registry, diagnostics, channelBus, blockSource, {
            mode: inheritMode,
            selection: first.args["@intervals"] || [],
            order: config.scopeOrder,
          });
        }
        output += stringifyResult(value);
        index = inner.nextIndex;
        continue;
      }

      if (bufferStartLine === null) bufferStartLine = index + 1;
      bufferEndLine = index + 1;
      buffer += `${line}${index < lines.length - 1 ? "\n" : ""}`;
      index += 1;
    }

    await flush();
    if (expectedClose) throw new Error(`Blocket “${expectedClose}” saknar slutmarkören <<<< ${expectedClose}.`);
    if (scopes.length) throw new Error(`Intervallet “${scopes.at(-1).id}” är fortfarande öppet vid dokumentets slut.`);
    return { output, nextIndex: index };
  }

  return stripPropertySyntax((await renderSequence(0)).output);
}

function inspectDocument(documentSource, documentPath, config) {
  const lines = documentSource.split("\n");
  const sourceLines = [];
  const nodes = [];
  const scopes = [];
  const blocks = [];
  const activeScopes = [];
  const blockStack = [];
  let scopeDeclaration = 0;
  let blockDeclaration = 0;

  const closeTarget = (raw) => raw.trim().startsWith("@id=")
    ? raw.trim().slice(4)
    : raw.trim().replace(/^@/, "");

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    const line = index + 1;
    let kind = text.trim() ? "text" : "blank";
    let detail = {};
    const scopesBefore = activeScopes.map((scope) => scope.id);
    const blocksBefore = blockStack.map((block) => block.blockId);

    const include = text.match(includePattern);
    const directive = text.match(directivePattern);
    const scopeOpen = text.match(scopeOpenPattern);
    const scopeClose = text.match(scopeClosePattern);
    const blockOpen = text.match(blockOpenPattern);
    const blockClose = text.match(blockClosePattern);
    const property = /^\s*\{[^{}]+\}\s*$/.test(text) || /^(#{1,6}\s+.*?)\s+\{[^{}]+\}\s*$/.test(text);

    if (include) {
      kind = "include";
      detail = { path: normalizePath(include[1], documentPath) };
    } else if (scopeOpen) {
      kind = "scope-open";
      const stage = parseStage(scopeOpen[1], line);
      scopeDeclaration += 1;
      const scope = {
        scopeId: `scope:${String(scopeDeclaration).padStart(3, "0")}`,
        id: String(stage.args["@id"] || `${stage.name}-${scopeDeclaration}`),
        name: stage.name,
        args: withoutSystemArgs(stage.args),
        order: stage.args["@order"] === undefined ? scopeDeclaration : Number(stage.args["@order"]),
        declarationOrder: scopeDeclaration,
        openLine: line,
        closeLine: null,
        blockId: blockStack.at(-1)?.blockId || null,
        segments: [],
      };
      scopes.push(scope);
      activeScopes.push(scope);
      detail = { scopeId: scope.scopeId, id: scope.id, name: scope.name, order: scope.order };
    } else if (scopeClose) {
      kind = "scope-close";
      const target = closeTarget(scopeClose[1]);
      const found = activeScopes.findLastIndex((scope) => scope.id === target || scope.name === target);
      if (found >= 0) {
        activeScopes[found].closeLine = line;
        detail = { scopeId: activeScopes[found].scopeId, id: activeScopes[found].id, target };
        activeScopes.splice(found, 1);
      } else {
        detail = { target, unresolved: true };
      }
    } else if (blockOpen) {
      kind = "block-open";
      const pipelineSources = splitExpression(blockOpen[1].trim());
      let cursor = index + 1;
      while (cursor < lines.length && /^\s*(?:\||@)/.test(lines[cursor])) {
        const continuation = lines[cursor].trim().replace(/^\|\s*/, "");
        pipelineSources.push(...splitExpression(continuation));
        cursor += 1;
      }
      const stages = pipelineSources.map((source) => parseStage(source, line));
      const first = stages[0];
      blockDeclaration += 1;
      const block = {
        blockId: `block:${String(blockDeclaration).padStart(3, "0")}`,
        name: first?.name || "unknown",
        openLine: line,
        closeLine: null,
        parentBlockId: blockStack.at(-1)?.blockId || null,
        activeScopeIds: scopesBefore,
        inherit: String(first?.args?.["@inherit"] || "default"),
        cross: String(first?.args?.["@cross"] || "error"),
        pipeline: stages.map((stage, stageIndex) => ({
          stage: stageIndex + 1,
          name: stage.name,
          args: withoutSystemArgs(stage.args),
          controls: Object.fromEntries(Object.entries(stage.args).filter(([key]) => key.startsWith("@"))),
          line: stage.line,
        })),
      };
      blocks.push(block);
      blockStack.push(block);
      detail = { blockId: block.blockId, name: block.name, inherit: block.inherit, cross: block.cross };
    } else if (blockClose) {
      kind = "block-close";
      const block = blockStack.at(-1);
      if (block && block.name === blockClose[1]) {
        block.closeLine = line;
        detail = { blockId: block.blockId, name: block.name };
        blockStack.pop();
      } else {
        detail = { name: blockClose[1], unresolved: true };
      }
    } else if (directive) {
      kind = "directive";
      detail = { value: directive[1] };
    } else if (/^\s*(?:\||@)/.test(text) && blockStack.length) {
      kind = "pipeline-continuation";
      detail = { blockId: blockStack.at(-1).blockId };
    } else if (property) {
      kind = "property";
      detail = { hiddenFromRender: true };
    }

    const effectiveScopes = kind === "scope-close" ? scopesBefore : activeScopes.map((scope) => scope.id);
    const effectiveBlocks = kind === "block-close" ? blocksBefore : blockStack.map((block) => block.blockId);
    const sourceLine = {
      line,
      text,
      kind,
      activeScopeIds: effectiveScopes,
      activeBlockIds: effectiveBlocks,
      detail,
    };
    sourceLines.push(sourceLine);
    nodes.push({
      nodeId: `node:${String(line).padStart(4, "0")}`,
      kind,
      sourceSpan: { startLine: line, endLine: line },
      activeScopeIds: effectiveScopes,
      activeBlockIds: effectiveBlocks,
      detail,
    });
  }

  for (const scope of scopes) {
    let current = null;
    for (const sourceLine of sourceLines) {
      const active = sourceLine.activeScopeIds.includes(scope.id) && ["text", "blank", "property"].includes(sourceLine.kind);
      if (active && current === null) current = { startLine: sourceLine.line, endLine: sourceLine.line };
      else if (active) current.endLine = sourceLine.line;
      else if (current) { scope.segments.push(current); current = null; }
    }
    if (current) scope.segments.push(current);
  }

  return {
    schema: "textabana.ir/lab-v1",
    languageVersion: "0.4-playground-subset",
    sourceRef: {
      documentId: `doc:${documentPath}`,
      version: `fnv1a:${sourceHash(documentSource)}`,
    },
    configuration: { scopeOrder: config.scopeOrder, crossPolicy: "error" },
    nodes,
    scopes,
    blocks,
    sourceLines,
    unsupported: [
      "cross:split",
      "cross:promote",
      "cross:truncate",
      "cross:preserve",
      "canonical-sha256",
    ],
  };
}

function buildPlan(ir, trace) {
  return {
    schema: "textabana.execution-plan/lab-v1",
    languageVersion: ir.languageVersion,
    sourceRef: ir.sourceRef,
    deterministic: true,
    steps: trace,
    unsupported: ["typed-edges", "capability-grants", "cache-boundaries", "parallel-merge"],
  };
}

function buildResultEnvelope({ runId, ok, output, error, diagnostics, channels, descriptors, anchors, sourceMaps, plan, ir, duration }) {
  const status = ok ? "succeeded" : "failed";
  const committedChannels = ok ? channels : {};
  const channelSnapshots = Object.fromEntries(Object.entries(descriptors)
    .filter(([name]) => ok && (committedChannels[name] || descriptors[name].required))
    .map(([name, descriptor]) => [name, { descriptor, events: committedChannels[name] || [] }]));
  const semanticSeed = JSON.stringify({
    status,
    source: ir?.sourceRef || null,
    output: ok ? output : "",
    channels: channelSnapshots,
    diagnostics,
  });
  return {
    schema: "textabana.result/lab-v1",
    resultId: `lab:${sourceHash(semanticSeed)}`,
    run: {
      runId: `run:${runId}`,
      profile: "fresh",
      status,
      committed: ok,
    },
    source: ir?.sourceRef || null,
    render: {
      kind: "text",
      mediaType: "text/markdown",
      data: ok ? output : "",
    },
    channelSnapshots,
    anchors: ok ? anchors : [],
    sourceMaps: ok ? sourceMaps : [],
    artifacts: [],
    provenance: {
      entities: [],
      activities: ok ? (plan?.steps || []).map((step) => ({
        activityId: `activity:${step.stageId}`,
        stageId: step.stageId,
        function: step.function,
        orderKey: step.orderKey,
      })) : [],
      agents: [],
    },
    diagnostics,
    hashes: {
      ir: ir ? `fnv1a:${sourceHash(JSON.stringify(ir))}` : null,
      environment: "lab:web-worker:0.4-subset",
    },
    extensions: {
      "textabana.playground": {
        canonical: false,
        note: "Interaktiv 0.4-subset; använd inte som full profilkonformitet.",
        duration,
        ...(error ? { error } : {}),
      },
    },
  };
}

self.onmessage = async (event) => {
  const { runId, documentSource, modules, documentPath = "document.md", options = {} } = event.data;
  const started = performance.now();
  const diagnostics = [];
  scopeSequence = 0;
  const channelBus = createChannelBus({
    runId,
    documentVersion: sourceHash(documentSource),
    documentPath,
    documentSource,
    strictChannels: Boolean(options.strictChannels),
  });
  const registry = new Map();
  const loaded = new Set();
  let inspection = null;
  try {
    const files = Object.fromEntries(modules.map((module) => [normalizePath(module.path), module.content]));
    const loading = new Set();
    const config = { scopeOrder: "asc", documentPath };
    for (const line of documentSource.split("\n")) {
      const include = line.match(includePattern);
      if (include) await loadModule(normalizePath(include[1]), files, registry, loaded, loading);
      const directive = line.match(directivePattern);
      if (directive && directive[1].startsWith("config ")) {
        const stage = parseStage(directive[1], 1);
        if (stage.args["scope-order"] === "declaration:desc") config.scopeOrder = "desc";
      }
    }
    inspection = inspectDocument(documentSource, documentPath, config);
    const output = await renderDocument(documentSource, registry, diagnostics, channelBus, config);
    const channels = channelBus.snapshot();
    const channelDescriptors = channelBus.descriptorSnapshot();
    const executionTrace = channelBus.traceSnapshot();
    const plan = buildPlan(inspection, executionTrace);
    const duration = performance.now() - started;
    const resultEnvelope = buildResultEnvelope({
      runId,
      ok: true,
      output,
      diagnostics,
      channels,
      descriptors: channelDescriptors,
      anchors: channelBus.anchorSnapshot(),
      sourceMaps: channelBus.sourceMapSnapshot(),
      plan,
      ir: inspection,
      duration,
    });
    self.postMessage({
      runId,
      ok: true,
      output,
      channels,
      channelDescriptors,
      emissions: channelBus.size,
      diagnostics,
      inspection,
      plan,
      anchors: channelBus.anchorSnapshot(),
      sourceMaps: channelBus.sourceMapSnapshot(),
      executionTrace,
      resultEnvelope,
      capabilities: {
        schema: "textabana.capabilities/lab-v1",
        profiles: {
          "language-core/0.4": "playground-subset",
          "runtime-json/1": "playground-subset",
          "editor/1": "playground-subset",
        },
        implemented: ["blocks", "pipelines", "intervals", "inheritance", "cross:error", "typed-channel-descriptors", "system.out-v2", "anchors", "source-map", "atomic-success-result"],
        unsupported: inspection.unsupported.concat(["reanchor", "lsp", "cancellation", "artifacts"]),
      },
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath)),
      modulesLoaded: loaded.size,
      duration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = {
      diagnosticId: `diag:run:${runId}:${String(diagnostics.length + 1).padStart(3, "0")}`,
      code: /include|Modulen|Cirkulär/.test(message) ? "TBA-RESOLVE-LAB" : /kanal|ChannelDescriptor|payload/.test(message) ? "TBA-TYPE-CHANNEL-LAB" : /Rad|block|intervall|markör/.test(message) ? "TBA-PARSE-LAB" : "TBA-RUN-LAB",
      severity: "error",
      level: "error",
      message,
      phase: "run",
      line: Number(message.match(/Rad (\d+)/)?.[1] || 1),
    };
    diagnostics.push(diagnostic);
    const duration = performance.now() - started;
    const plan = inspection ? buildPlan(inspection, channelBus.traceSnapshot()) : null;
    const resultEnvelope = buildResultEnvelope({
      runId,
      ok: false,
      output: "",
      error: message,
      diagnostics,
      channels: {},
      descriptors: {},
      anchors: [],
      sourceMaps: [],
      plan,
      ir: inspection,
      duration,
    });
    self.postMessage({
      runId,
      ok: false,
      output: "",
      error: message,
      diagnostics,
      channels: {},
      channelDescriptors: {},
      emissions: 0,
      inspection,
      plan,
      anchors: [],
      sourceMaps: [],
      executionTrace: channelBus.traceSnapshot(),
      resultEnvelope,
      capabilities: {
        schema: "textabana.capabilities/lab-v1",
        profiles: {
          "language-core/0.4": "playground-subset",
          "runtime-json/1": "playground-subset",
          "editor/1": "playground-subset",
        },
      },
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath)),
      modulesLoaded: loaded.size,
      duration,
    });
  }
};
