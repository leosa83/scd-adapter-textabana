import { parser as structuralParser } from "./generated/textabana-parser.js";

const NAME_PATTERN = /^@?[A-Za-z_][\w.-]*$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][\w.-]*$/;
const ATTRIBUTE_NAME_PATTERN = /^[A-Za-z_][\w.-]*$/;
const MARKER_PREFIX_PATTERN = /^\s*(?:>{3,}|<{3,})/;
const KNOWN_SCOPE_CONTROLS = new Set(["@id", "@order"]);
const KNOWN_BLOCK_CONTROLS = new Set(["@inherit", "@cross", "@intervals"]);
const KNOWN_INHERITANCE = new Set(["default", "none", "only", "except", "explicit"]);
const KNOWN_INTERVAL_STAGE_ARGS = new Set(["only", "except", "order"]);
const FORBIDDEN_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function hashSource(source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

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

function createSourceIndex(source) {
  const codeUnitToPoint = new Array(source.length + 1);
  const lineStartUnits = [0];
  const lineStartPoints = [0];
  let point = 0;
  let unit = 0;
  codeUnitToPoint[0] = 0;
  while (unit < source.length) {
    const first = source.charCodeAt(unit);
    const pair = first >= 0xd800 && first <= 0xdbff
      && unit + 1 < source.length
      && source.charCodeAt(unit + 1) >= 0xdc00
      && source.charCodeAt(unit + 1) <= 0xdfff;
    codeUnitToPoint[unit] = point;
    if (pair) codeUnitToPoint[unit + 1] = point;
    const consumed = pair ? 2 : 1;
    const character = source.slice(unit, unit + consumed);
    unit += consumed;
    point += 1;
    codeUnitToPoint[unit] = point;
    if (character === "\n") {
      lineStartUnits.push(unit);
      lineStartPoints.push(point);
    }
  }

  const positionAtUnit = (offset) => {
    let low = 0;
    let high = lineStartUnits.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (lineStartUnits[middle] <= offset) low = middle;
      else high = middle;
    }
    return {
      line: low + 1,
      column: codeUnitToPoint[offset] - lineStartPoints[low],
    };
  };

  const span = (fromUnit, toUnit, extra = {}) => {
    const startPosition = positionAtUnit(fromUnit);
    const endPosition = positionAtUnit(toUnit);
    return {
      start: codeUnitToPoint[fromUnit],
      end: codeUnitToPoint[toUnit],
      unit: "unicode-code-point",
      startLine: startPosition.line,
      startColumn: startPosition.column,
      endLine: endPosition.line,
      endColumn: endPosition.column,
      ...extra,
    };
  };

  const lineRecords = lineStartUnits.map((fromUnit, index) => {
    const next = lineStartUnits[index + 1];
    const toUnit = next === undefined ? source.length : next - 1;
    return {
      number: index + 1,
      fromUnit,
      toUnit,
      raw: source.slice(fromUnit, toUnit),
      lineBreak: next === undefined ? "" : "\n",
      sourceSpan: span(fromUnit, toUnit),
    };
  });

  return {
    source,
    length: point,
    lineRecords,
    span,
    pointAtUnit(offset) { return codeUnitToPoint[offset]; },
  };
}

function finiteJson(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteJson);
  if (value && typeof value === "object") return Object.values(value).every(finiteJson);
  return true;
}

function scopeReferenceList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && NAME_PATTERN.test(item));
}

function parseValueResult(raw) {
  if (raw === undefined) return { value: true, issue: null };
  if (raw === "true") return { value: true, issue: null };
  if (raw === "false") return { value: false, issue: null };
  if (raw === "null") return { value: null, issue: null };
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const value = Number(raw);
    return Number.isFinite(value) ? { value, issue: null } : { value: raw, issue: "NonFiniteNumber" };
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { return { value: JSON.parse(raw), issue: null }; } catch { return { value: raw.slice(1, -1), issue: null }; }
  }
  if (raw.startsWith("'") && raw.endsWith("'")) return { value: raw.slice(1, -1).replace(/\\'/g, "'"), issue: null };
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return { value: [], issue: null };
    const items = splitDelimited(inner, ",", 0).parts.map((part) => parseValueResult(part.text.trim()));
    return { value: items.map((item) => item.value), issue: items.find((item) => item.issue)?.issue || null };
  }
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const value = JSON.parse(raw);
      return finiteJson(value) ? { value, issue: null } : { value: raw, issue: "NonFiniteNumber" };
    } catch { return { value: raw, issue: null }; }
  }
  return { value: raw, issue: null };
}

function parseValue(raw) {
  return parseValueResult(raw).value;
}

function splitDelimited(input, separator = "|", baseUnit = 0) {
  const parts = [];
  const stack = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  let issue = null;
  const matching = { "]": "[", "}": "{", ")": "(" };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === "[" || character === "{" || character === "(") stack.push(character);
    else if (character === "]" || character === "}" || character === ")") {
      if (stack.at(-1) === matching[character]) stack.pop();
      else if (!issue) issue = { kind: "UnbalancedDelimiter", atUnit: baseUnit + index, actual: character };
    } else if (character === separator && stack.length === 0) {
      parts.push({ text: input.slice(start, index), fromUnit: baseUnit + start, toUnit: baseUnit + index });
      start = index + 1;
    }
  }
  parts.push({ text: input.slice(start), fromUnit: baseUnit + start, toUnit: baseUnit + input.length });
  if (!issue && quote) issue = { kind: "UnterminatedString", atUnit: baseUnit + input.length, actual: quote };
  if (!issue && stack.length) issue = { kind: "UnbalancedDelimiter", atUnit: baseUnit + input.length, actual: stack.at(-1) };
  return { parts, issue };
}

function tokenizeStage(input, baseUnit) {
  const tokens = [];
  const stack = [];
  let quote = null;
  let escaped = false;
  let start = null;
  const push = (end) => {
    if (start === null) return;
    tokens.push({ text: input.slice(start, end), fromUnit: baseUnit + start, toUnit: baseUnit + end });
    start = null;
  };
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (start === null && !/\s/.test(character)) start = index;
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === "[" || character === "{" || character === "(") stack.push(character);
    else if (character === "]" || character === "}" || character === ")") stack.pop();
    else if (/\s/.test(character) && stack.length === 0) push(index);
  }
  push(input.length);
  return tokens;
}

function trimPart(part) {
  const leading = part.text.match(/^\s*/)?.[0].length || 0;
  const trailing = part.text.match(/\s*$/)?.[0].length || 0;
  const end = Math.max(leading, part.text.length - trailing);
  return {
    text: part.text.slice(leading, end),
    fromUnit: part.fromUnit + leading,
    toUnit: part.fromUnit + end,
  };
}

function propertyAttributes(raw) {
  const body = raw.trim();
  const tokens = tokenizeStage(body, 0).map((token) => token.text);
  if (!tokens.length) return null;
  const attributes = {};
  const classes = [];
  for (const token of tokens) {
    if (/^\.[A-Za-z_][\w-]*$/.test(token)) { classes.push(token.slice(1)); continue; }
    if (/^#[A-Za-z_][\w-]*$/.test(token)) { attributes.id = token.slice(1); continue; }
    const equals = token.indexOf("=");
    if (equals < 1) return null;
    const name = token.slice(0, equals);
    if (!ATTRIBUTE_NAME_PATTERN.test(name) || FORBIDDEN_RECORD_KEYS.has(name)) return null;
    attributes[name] = parseValue(token.slice(equals + 1));
  }
  if (classes.length) attributes.class = classes;
  return attributes;
}

function parseInlineProperty(raw, lineFromUnit, index) {
  const clean = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  const match = clean.match(/^(.*?)(\s+\{([^{}]+)\})\s*$/);
  if (!match) return null;
  const attributes = propertyAttributes(match[3]);
  if (!attributes) return null;
  const propertyStart = match[1].length + match[2].indexOf("{");
  return {
    renderText: match[1],
    property: {
      attributes,
      raw: match[2].trim(),
      sourceSpan: index.span(lineFromUnit + propertyStart, lineFromUnit + propertyStart + match[2].trim().length),
    },
  };
}

function fenceMarker(raw) {
  const clean = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  const match = clean.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  return { character: match[1][0], length: match[1].length, tail: match[2] };
}

function publicStage(stage) {
  return {
    stageId: stage.stageId,
    kind: stage.name === "@intervals" ? "IntervalInjectionStage" : "FunctionStage",
    name: stage.name,
    args: stage.args,
    controls: stage.controls,
    arguments: stage.arguments,
    line: stage.line,
    sourceSpan: stage.sourceSpan,
    executable: stage.executable,
  };
}

export function parseDocument(source, { documentPath = "document.md", documentId = null } = {}) {
  const index = createSourceIndex(source);
  const sourceVersion = `fnv1a:${hashSource(source)}`;
  const tree = structuralParser.parse(source);
  const lexicalByStart = new Map();
  const cstNodes = [];
  let cstSequence = 0;
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === "Line") {
      const token = node.firstChild;
      lexicalByStart.set(node.from, token?.name || "TextLine");
      cstSequence += 1;
      cstNodes.push({
        nodeId: `cst:${String(cstSequence).padStart(4, "0")}`,
        kind: token?.name || "TextLine",
        lexeme: source.slice(node.from, node.to),
        sourceSpan: index.span(node.from, node.to),
      });
    } else if (node.name === "Newline") {
      cstSequence += 1;
      cstNodes.push({
        nodeId: `cst:${String(cstSequence).padStart(4, "0")}`,
        kind: "Newline",
        lexeme: source.slice(node.from, node.to),
        sourceSpan: index.span(node.from, node.to),
      });
    }
  }

  const diagnostics = [];
  const flatNodes = [];
  const sourceLines = [];
  const scopes = [];
  const blocks = [];
  const directives = [];
  const activeScopes = [];
  const intervalOpenNodes = new Map();
  const blockStack = [];
  const diagnosticKeyCounts = new Map();
  const root = {
    nodeId: "ast:document",
    kind: "Document",
    sourceSpan: index.span(0, source.length),
    executable: true,
    children: [],
  };
  let nodeSequence = 0;
  let scopeSequence = 0;
  let blockSequence = 0;
  let stageSequence = 0;
  let recoverySequence = 0;
  let fence = null;

  const nodeId = (kind) => {
    nodeSequence += 1;
    return `node:${String(nodeSequence).padStart(4, "0")}:${kind}`;
  };
  const currentChildren = () => blockStack.at(-1)?.children || root.children;
  const append = (node) => {
    currentChildren().push(node);
    flatNodes.push(node);
    return node;
  };
  const addDiagnostic = (code, message, sourceSpan, recoveryNode, related = []) => {
    const keyBase = `${code}:${hashSource(`${recoveryNode.recoveryKind}:${recoveryNode.actual || ""}:${recoveryNode.expected || ""}`)}`;
    const keyOccurrence = (diagnosticKeyCounts.get(keyBase) || 0) + 1;
    diagnosticKeyCounts.set(keyBase, keyOccurrence);
    const diagnosticKey = `${keyBase}:${keyOccurrence}`;
    const diagnostic = {
      diagnosticId: `diag:${sourceVersion}:${recoveryNode.nodeId}`,
      diagnosticKey,
      code,
      severity: "error",
      level: "error",
      message,
      phase: "parsing",
      line: sourceSpan.startLine,
      sourceSpan,
      recoveryNodeId: recoveryNode.nodeId,
      related,
    };
    diagnostics.push(diagnostic);
    return diagnostic;
  };
  const recover = (recoveryKind, code, message, sourceSpan, detail = {}, related = []) => {
    recoverySequence += 1;
    const recovery = append({
      nodeId: nodeId("recovery"),
      kind: "Recovery",
      recoveryKind,
      actual: detail.actual || null,
      expected: detail.expected || null,
      sourceSpan,
      synthetic: Boolean(detail.synthetic),
      executable: false,
      detail,
    });
    recovery.recoveryId = `recovery:${String(recoverySequence).padStart(3, "0")}`;
    addDiagnostic(code, message, sourceSpan, recovery, related);
    return recovery;
  };

  const parseStage = (part, context, ownerId) => {
    const trimmed = trimPart(part);
    if (!trimmed.text) {
      const span = index.span(trimmed.fromUnit, trimmed.toUnit, { synthetic: trimmed.fromUnit === trimmed.toUnit });
      recover("MissingStage", "TBA-PARSE-MISSING-STAGE-LAB", `Rad ${span.startLine}: pipelineledet saknar ett steg.`, span, { expected: "Stage", synthetic: true });
      return null;
    }
    const tokens = tokenizeStage(trimmed.text, trimmed.fromUnit);
    const nameToken = tokens.shift();
    if (!nameToken || !NAME_PATTERN.test(nameToken.text)) {
      const span = index.span(nameToken?.fromUnit ?? trimmed.fromUnit, nameToken?.toUnit ?? trimmed.toUnit);
      recover("InvalidStage", "TBA-PARSE-INVALID-STAGE-LAB", `Rad ${span.startLine}: ogiltigt steg i “${trimmed.text}”.`, span, { actual: nameToken?.text || trimmed.text, expected: "FunctionName" });
      return null;
    }
    stageSequence += 1;
    const stage = {
      stageId: `stage:syntax:${String(stageSequence).padStart(3, "0")}`,
      name: nameToken.text,
      args: {},
      controls: {},
      arguments: [],
      line: index.span(nameToken.fromUnit, nameToken.toUnit).startLine,
      sourceSpan: index.span(trimmed.fromUnit, trimmed.toUnit),
      executable: true,
      ownerId,
    };
    const argumentSpan = (name) => stage.arguments.find((candidate) => candidate.name === name)?.sourceSpan || stage.sourceSpan;
    for (const token of tokens) {
      const equals = token.text.indexOf("=");
      const key = equals === -1 ? token.text : token.text.slice(0, equals);
      const rawValue = equals === -1 ? undefined : token.text.slice(equals + 1);
      const tokenSpan = index.span(token.fromUnit, token.toUnit);
      if (!NAME_PATTERN.test(key) || FORBIDDEN_RECORD_KEYS.has(key)) {
        recover("InvalidArgument", "TBA-PARSE-INVALID-ARGUMENT-LAB", `Rad ${tokenSpan.startLine}: ogiltigt argument “${token.text}”.`, tokenSpan, { actual: token.text, expected: "Argument" });
        stage.executable = false;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(stage.args, key)) {
        recover("DuplicateArgument", "TBA-PARSE-DUPLICATE-ARGUMENT-LAB", `Rad ${tokenSpan.startLine}: argumentet “${key}” deklareras flera gånger.`, tokenSpan, { actual: key, expected: "UniqueArgument" });
        stage.executable = false;
        continue;
      }
      const parsedValue = parseValueResult(rawValue);
      const value = parsedValue.value;
      if (parsedValue.issue === "NonFiniteNumber") {
        recover("NonFiniteNumber", "TBA-PARSE-NUMBER-RANGE-LAB", `Rad ${tokenSpan.startLine}: talet i argumentet “${key}” ligger utanför det portabla JSON-intervallet.`, tokenSpan, { actual: rawValue, expected: "FiniteNumber" });
        stage.executable = false;
      }
      stage.args[key] = value;
      if (key.startsWith("@")) stage.controls[key] = value;
      stage.arguments.push({
        name: key,
        value,
        valueKind: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
        sourceSpan: tokenSpan,
      });
    }

    const allowedControls = context === "scope" ? KNOWN_SCOPE_CONTROLS : context === "block-first" ? KNOWN_BLOCK_CONTROLS : new Set();
    for (const key of Object.keys(stage.controls)) {
      if (!allowedControls.has(key)) {
        const argument = stage.arguments.find((candidate) => candidate.name === key);
        recover("UnknownEngineControl", "TBA-PARSE-UNKNOWN-CONTROL-LAB", `Rad ${stage.line}: okänd engine control “${key}”.`, argument?.sourceSpan || stage.sourceSpan, { actual: key });
        stage.executable = false;
      }
    }
    if (context === "scope") {
      if (stage.args["@id"] !== undefined && (typeof stage.args["@id"] !== "string" || !IDENTIFIER_PATTERN.test(stage.args["@id"]))) {
        recover("InvalidScopeId", "TBA-PARSE-SCOPE-ID-LAB", `Rad ${stage.line}: @id måste vara en enkel identifierare.`, argumentSpan("@id"), { actual: JSON.stringify(stage.args["@id"]), expected: "Identifier" });
        stage.executable = false;
      }
      if (stage.args["@order"] !== undefined && (typeof stage.args["@order"] !== "number" || !Number.isFinite(stage.args["@order"]))) {
        recover("InvalidOrder", "TBA-PARSE-INVALID-CONTROL-LAB", `Rad ${stage.line}: @order måste vara ett ändligt tal.`, argumentSpan("@order"), { actual: JSON.stringify(stage.args["@order"]), expected: "FiniteNumber" });
        stage.executable = false;
      }
    }
    if (context === "block-first") {
      const inheritValue = stage.args["@inherit"];
      if (inheritValue !== undefined && (typeof inheritValue !== "string" || !KNOWN_INHERITANCE.has(inheritValue))) {
        recover("InvalidInheritance", "TBA-PARSE-INVALID-CONTROL-LAB", `Rad ${stage.line}: @inherit måste vara en känd strängpolicy.`, argumentSpan("@inherit"), { actual: JSON.stringify(inheritValue), expected: [...KNOWN_INHERITANCE].join("|") });
        stage.executable = false;
      }
      const crossValue = stage.args["@cross"];
      if (crossValue !== undefined && typeof crossValue !== "string") {
        recover("InvalidCrossPolicy", "TBA-PARSE-INVALID-CONTROL-LAB", `Rad ${stage.line}: @cross måste vara en strängpolicy.`, argumentSpan("@cross"), { actual: JSON.stringify(crossValue), expected: "error" });
        stage.executable = false;
      } else if (crossValue !== undefined && crossValue !== "error") {
        recover("UnsupportedCrossPolicy", "TBA-PARSE-UNSUPPORTED-CROSS-LAB", `Rad ${stage.line}: @cross=${crossValue} är definierad men inte körbar i playground-subseten.`, argumentSpan("@cross"), { actual: crossValue, expected: "error" });
        stage.executable = false;
      }
      if (stage.args["@intervals"] !== undefined && !scopeReferenceList(stage.args["@intervals"])) {
        recover("InvalidInheritedIntervals", "TBA-PARSE-INVALID-CONTROL-LAB", `Rad ${stage.line}: @intervals måste vara en lista av scope-namn eller @id-referenser.`, argumentSpan("@intervals"), { actual: JSON.stringify(stage.args["@intervals"]), expected: "ScopeReference[]" });
        stage.executable = false;
      }
    }
    if (stage.name.startsWith("@")) {
      if (stage.name !== "@intervals" || context !== "block-stage") {
        recover("UnknownVirtualStage", "TBA-PARSE-VIRTUAL-STAGE-LAB", `Rad ${stage.line}: okänt eller felplacerat virtuellt steg “${stage.name}”.`, stage.sourceSpan, { actual: stage.name, expected: "@intervals in block pipeline" });
        stage.executable = false;
      } else {
        const unknownArgs = Object.keys(stage.args).filter((key) => !KNOWN_INTERVAL_STAGE_ARGS.has(key));
        for (const key of unknownArgs) {
          const argument = stage.arguments.find((candidate) => candidate.name === key);
          recover("InvalidIntervalsArgument", "TBA-PARSE-INTERVALS-STAGE-LAB", `Rad ${stage.line}: @intervals stöder endast only, except och order; hittade “${key}”.`, argument?.sourceSpan || stage.sourceSpan, { actual: key, expected: "only|except|order" });
          stage.executable = false;
        }
        if (stage.args.only !== undefined && stage.args.except !== undefined) {
          recover("ConflictingIntervalsSelection", "TBA-PARSE-INTERVALS-STAGE-LAB", `Rad ${stage.line}: @intervals får inte kombinera only och except.`, stage.sourceSpan, { actual: "only+except", expected: "only|except" });
          stage.executable = false;
        }
        for (const key of ["only", "except"]) {
          if (stage.args[key] !== undefined && !scopeReferenceList(stage.args[key])) {
            const argument = stage.arguments.find((candidate) => candidate.name === key);
            recover("InvalidIntervalsSelection", "TBA-PARSE-INTERVALS-STAGE-LAB", `Rad ${stage.line}: @intervals ${key} måste vara en lista av scope-namn eller @id-referenser.`, argument?.sourceSpan || stage.sourceSpan, { actual: JSON.stringify(stage.args[key]), expected: "ScopeReference[]" });
            stage.executable = false;
          }
        }
        if (stage.args.order !== undefined && (typeof stage.args.order !== "string" || !["asc", "desc"].includes(stage.args.order))) {
          const argument = stage.arguments.find((candidate) => candidate.name === "order");
          recover("InvalidIntervalsOrder", "TBA-PARSE-INTERVALS-STAGE-LAB", `Rad ${stage.line}: @intervals order måste vara strängen asc eller desc.`, argument?.sourceSpan || stage.sourceSpan, { actual: JSON.stringify(stage.args.order), expected: "asc|desc" });
          stage.executable = false;
        }
      }
    }
    return stage;
  };

  const parsePipeline = (text, fromUnit, context, ownerId) => {
    const diagnosticStart = diagnostics.length;
    const split = splitDelimited(text, "|", fromUnit);
    if (split.issue) {
      const at = Math.min(source.length, split.issue.atUnit);
      const span = index.span(at, at, { synthetic: true });
      const stringIssue = split.issue.kind === "UnterminatedString";
      recover(
        split.issue.kind,
        stringIssue ? "TBA-PARSE-UNTERMINATED-STRING-LAB" : "TBA-PARSE-UNBALANCED-DELIMITER-LAB",
        `Rad ${span.startLine}: ${stringIssue ? "strängen" : "värdeavgränsaren"} avslutades inte före radslutet.`,
        span,
        { actual: split.issue.actual, synthetic: true },
      );
    }
    const stages = split.parts.map((part, stageIndex) => parseStage(part, stageIndex === 0 ? context : "block-stage", ownerId)).filter(Boolean);
    if (diagnostics.length > diagnosticStart) stages.forEach((stage) => { stage.executable = false; });
    stages.executable = diagnostics.length === diagnosticStart;
    return stages;
  };

  const writeSourceLine = (line, kind, detail, activeScopeIds, activeBlockIds) => {
    sourceLines[line.number - 1] = {
      line: line.number,
      text: line.raw,
      kind,
      sourceSpan: line.sourceSpan,
      activeScopeIds: activeScopeIds || activeScopes.map((scope) => scope.id),
      activeBlockIds: activeBlockIds || blockStack.map((block) => block.blockId),
      detail: detail || {},
    };
  };

  const appendText = (line, kind = "Text", renderText = line.raw, detail = {}) => append({
    nodeId: nodeId(kind.toLowerCase()),
    kind,
    sourceSpan: line.sourceSpan,
    line: line.number,
    text: line.raw,
    renderText,
    lineBreak: line.lineBreak,
    activeScopeIds: activeScopes.map((scope) => scope.id),
    activeBlockIds: blockStack.map((block) => block.blockId),
    executable: true,
    detail,
  });

  const invalidateScope = (scope) => {
    scope.executable = false;
    const openNode = intervalOpenNodes.get(scope.scopeId);
    if (openNode) {
      openNode.executable = false;
      openNode.stage.executable = false;
    }
  };

  const closeLocalScopes = (block, closeSpan) => {
    for (let position = activeScopes.length - 1; position >= 0; position -= 1) {
      const scope = activeScopes[position];
      if (scope.blockId !== block.blockId) continue;
      recover(
        "MissingScopeClose",
        "TBA-PARSE-SCOPE-UNCLOSED-LAB",
        `Rad ${closeSpan.startLine}: intervallet “${scope.id}” är fortfarande öppet när blocket “${block.name}” stängs.`,
        { ...closeSpan, start: closeSpan.start, end: closeSpan.start, endLine: closeSpan.startLine, endColumn: closeSpan.startColumn, synthetic: true },
        { actual: scope.id, expected: `<<<<+ @id=${scope.id}`, synthetic: true },
        [{ message: "Intervallet öppnades här.", sourceSpan: scope.openSpan }],
      );
      scope.complete = false;
      invalidateScope(scope);
      activeScopes.splice(position, 1);
    }
  };

  for (let lineIndex = 0; lineIndex < index.lineRecords.length; lineIndex += 1) {
    const line = index.lineRecords[lineIndex];
    const lexical = lexicalByStart.get(line.fromUnit) || (line.raw ? "TextLine" : "BlankLine");
    const scopesBefore = activeScopes.map((scope) => scope.id);
    const blocksBefore = blockStack.map((block) => block.blockId);
    const clean = line.raw.endsWith("\r") ? line.raw.slice(0, -1) : line.raw;

    if (fence) {
      const candidate = fenceMarker(line.raw);
      const closes = candidate
        && candidate.character === fence.character
        && candidate.length >= fence.length
        && candidate.tail.trim() === "";
      appendText(line, "Literal", line.raw, { literalKind: closes ? "fence-close" : "fence-text" });
      writeSourceLine(line, closes ? "fence-close" : "fence-text", { literal: true }, scopesBefore, blocksBefore);
      if (closes) fence = null;
      continue;
    }

    if (lexical === "FenceLine") {
      const candidate = fenceMarker(line.raw);
      if (candidate) {
        fence = candidate;
        appendText(line, "Literal", line.raw, { literalKind: "fence-open", fence: candidate.character.repeat(candidate.length) });
        writeSourceLine(line, "fence-open", { literal: true, fence: candidate.character.repeat(candidate.length) }, scopesBefore, blocksBefore);
        continue;
      }
    }

    if (lexical === "EscapedMarkerLine") {
      const slash = line.raw.search(/\\(?=(?:>>>>|<<<<))/);
      const renderText = slash >= 0 ? `${line.raw.slice(0, slash)}${line.raw.slice(slash + 1)}` : line.raw;
      appendText(line, "Literal", renderText, { literalKind: "escaped-marker" });
      writeSourceLine(line, "literal-marker", { escaped: true }, scopesBefore, blocksBefore);
      continue;
    }

    if (lexical === "DirectiveLine") {
      const markerAt = line.raw.indexOf(">>>>!");
      const body = clean.slice(markerAt + 5).trim();
      const include = body.match(/^include\s+["']([^"']+)["']\s*$/);
      if (include) {
        const path = normalizePath(include[1], documentPath);
        const directive = append({
          nodeId: nodeId("include"),
          kind: "IncludeDirective",
          sourceSpan: line.sourceSpan,
          line: line.number,
          specifier: include[1],
          path,
          legacy: false,
          executable: false,
        });
        directives.push(directive);
        writeSourceLine(line, "include", { path, specifier: include[1] }, scopesBefore, blocksBefore);
        continue;
      }
      if (body.startsWith("config")) {
        const configAt = line.fromUnit + markerAt + 5 + clean.slice(markerAt + 5).indexOf("config");
        const stages = parsePipeline(body, configAt, "directive", "config");
        const stage = stages[0];
        if (!stage || stage.name !== "config" || stages.length !== 1) {
          recover("InvalidDirective", "TBA-PARSE-DIRECTIVE-LAB", `Rad ${line.number}: ogiltigt config-direktiv.`, line.sourceSpan, { actual: body, expected: "config" });
          writeSourceLine(line, "recovery", { recoveryKind: "InvalidDirective" }, scopesBefore, blocksBefore);
          continue;
        }
        const unknown = Object.keys(stage.args).filter((key) => key !== "scope-order");
        for (const key of unknown) {
          const argument = stage.arguments.find((candidate) => candidate.name === key);
          recover("UnknownConfig", "TBA-PARSE-UNKNOWN-CONFIG-LAB", `Rad ${line.number}: okänd config-nyckel “${key}”.`, argument?.sourceSpan || stage.sourceSpan, { actual: key });
          stage.executable = false;
        }
        const scopeOrder = stage.args["scope-order"] ?? "declaration:asc";
        if (typeof scopeOrder !== "string" || !["declaration:asc", "declaration:desc"].includes(scopeOrder)) {
          const argument = stage.arguments.find((candidate) => candidate.name === "scope-order");
          recover("InvalidConfig", "TBA-PARSE-INVALID-CONFIG-LAB", `Rad ${line.number}: scope-order måste vara strängen declaration:asc eller declaration:desc.`, argument?.sourceSpan || stage.sourceSpan, { actual: JSON.stringify(scopeOrder) });
          stage.executable = false;
        }
        const directive = append({
          nodeId: nodeId("config"),
          kind: "ConfigDirective",
          sourceSpan: line.sourceSpan,
          line: line.number,
          values: stage.args,
          stage: publicStage(stage),
          executable: false,
        });
        directives.push(directive);
        writeSourceLine(line, "directive", { name: "config", values: stage.args }, scopesBefore, blocksBefore);
        continue;
      }
      recover("UnknownDirective", "TBA-PARSE-DIRECTIVE-LAB", `Rad ${line.number}: okänt eller ofullständigt direktiv “${body}”.`, line.sourceSpan, { actual: body });
      writeSourceLine(line, "recovery", { recoveryKind: "UnknownDirective" }, scopesBefore, blocksBefore);
      continue;
    }

    if (lexical === "IntervalOpenLine") {
      const markerAt = line.raw.indexOf(">>>>+");
      const fromUnit = line.fromUnit + markerAt + 5;
      const stages = parsePipeline(clean.slice(markerAt + 5), fromUnit, "scope", `scope-open:${line.number}`);
      const stage = stages[0];
      if (!stage || stages.length !== 1 || stage.name.startsWith("@")) {
        if (stages.length > 1) {
          recover("InvalidIntervalPipeline", "TBA-PARSE-INTERVAL-PIPELINE-LAB", `Rad ${line.number}: ett intervall öppnar exakt en funktion; nästling uttrycks med flera intervallmarkörer.`, line.sourceSpan, { actual: String(stages.length), expected: "SingleStage" });
        } else if (stage?.name.startsWith("@")) {
          recover("InvalidIntervalStage", "TBA-PARSE-INVALID-STAGE-LAB", `Rad ${line.number}: ett intervall måste öppna en funktion.`, stage.sourceSpan, { actual: stage.name });
        }
        writeSourceLine(line, "recovery", { recoveryKind: "InvalidIntervalOpen" }, scopesBefore, blocksBefore);
        continue;
      }
      scopeSequence += 1;
      const requestedId = stage.args["@id"];
      const scopeId = typeof requestedId === "string" && IDENTIFIER_PATTERN.test(requestedId) ? requestedId : `${stage.name}-${scopeSequence}`;
      if (activeScopes.some((scope) => scope.id === scopeId)) {
        recover("DuplicateScopeId", "TBA-PARSE-SCOPE-ID-LAB", `Rad ${line.number}: ett aktivt intervall har redan @id=${scopeId}.`, stage.sourceSpan, { actual: scopeId, expected: "UniqueActiveScopeId" });
        writeSourceLine(line, "recovery", { recoveryKind: "DuplicateScopeId", id: scopeId }, scopesBefore, blocksBefore);
        continue;
      }
      const requestedOrder = stage.args["@order"] === undefined ? scopeSequence : stage.args["@order"];
      const scope = {
        scopeId: `scope:${String(scopeSequence).padStart(3, "0")}`,
        id: scopeId,
        name: stage.name,
        args: Object.fromEntries(Object.entries(stage.args).filter(([key]) => !key.startsWith("@"))),
        order: Number.isFinite(requestedOrder) ? requestedOrder : scopeSequence,
        declarationOrder: scopeSequence,
        openLine: line.number,
        closeLine: null,
        openSpan: line.sourceSpan,
        closeSpan: null,
        sourceSpan: line.sourceSpan,
        blockId: blockStack.at(-1)?.blockId || null,
        segments: [],
        complete: true,
        executable: stage.executable,
      };
      scopes.push(scope);
      activeScopes.push(scope);
      const intervalOpenNode = append({
        nodeId: nodeId("interval-open"),
        kind: "IntervalOpen",
        sourceSpan: line.sourceSpan,
        line: line.number,
        scopeId: scope.scopeId,
        id: scope.id,
        stage: publicStage(stage),
        executable: stage.executable,
      });
      intervalOpenNodes.set(scope.scopeId, intervalOpenNode);
      writeSourceLine(line, "scope-open", { scopeId: scope.scopeId, id: scope.id, name: scope.name, order: scope.order }, activeScopes.map((item) => item.id), blocksBefore);
      continue;
    }

    if (lexical === "IntervalCloseLine") {
      const markerAt = line.raw.indexOf("<<<<+");
      const rawTarget = clean.slice(markerAt + 5).trim();
      const match = rawTarget.match(/^(?:@id=)?(@?[A-Za-z_][\w.-]*)$/);
      const target = match ? match[1].replace(/^@/, "") : "";
      const found = target ? activeScopes.findLastIndex((scope) => scope.id === target || scope.name === target) : -1;
      if (!target || found < 0) {
        recover("UnresolvedScopeClose", "TBA-PARSE-SCOPE-UNRESOLVED-LAB", `Rad ${line.number}: inget aktivt intervall matchar “${rawTarget}”.`, line.sourceSpan, { actual: rawTarget, expected: "ActiveInterval" });
        writeSourceLine(line, "recovery", { recoveryKind: "UnresolvedScopeClose", target: rawTarget }, scopesBefore, blocksBefore);
        continue;
      }
      const scope = activeScopes[found];
      const currentBlock = blockStack.at(-1);
      if (currentBlock && scope.blockId !== currentBlock.blockId) {
        recover(
          "CrossingScopeClose",
          "TBA-PARSE-SCOPE-CROSSING-LAB",
          `Rad ${line.number}: intervallet “${target}” korsar blockgränsen. Default @cross=error stoppar tvetydig partiell överlappning.`,
          line.sourceSpan,
          { actual: target, expected: "CloseOutsideBlock" },
          [{ message: "Intervallet öppnades här.", sourceSpan: scope.openSpan }],
        );
        writeSourceLine(line, "recovery", { recoveryKind: "CrossingScopeClose", target }, scopesBefore, blocksBefore);
        continue;
      }
      scope.closeLine = line.number;
      scope.closeSpan = line.sourceSpan;
      append({
        nodeId: nodeId("interval-close"),
        kind: "IntervalClose",
        sourceSpan: line.sourceSpan,
        line: line.number,
        scopeId: scope.scopeId,
        id: scope.id,
        target,
        executable: scope.executable,
      });
      activeScopes.splice(found, 1);
      writeSourceLine(line, "scope-close", { scopeId: scope.scopeId, id: scope.id, target }, scopesBefore, blocksBefore);
      continue;
    }

    if (lexical === "BlockOpenLine") {
      const markerAt = line.raw.indexOf(">>>>");
      const header = clean.slice(markerAt + 4);
      const legacyInclude = header.trim().match(/^include\s+["']([^"']+)["']\s*$/);
      if (legacyInclude) {
        const path = normalizePath(legacyInclude[1], documentPath);
        const directive = append({
          nodeId: nodeId("include"),
          kind: "IncludeDirective",
          sourceSpan: line.sourceSpan,
          line: line.number,
          specifier: legacyInclude[1],
          path,
          legacy: true,
          executable: false,
        });
        directives.push(directive);
        writeSourceLine(line, "include", { path, specifier: legacyInclude[1], legacy: true }, scopesBefore, blocksBefore);
        continue;
      }

      blockSequence += 1;
      const blockId = `block:${String(blockSequence).padStart(3, "0")}`;
      const pipeline = parsePipeline(header, line.fromUnit + markerAt + 4, "block-first", blockId);
      let pipelineExecutable = pipeline.executable;
      const continuationLines = [];
      let cursor = lineIndex + 1;
      while (cursor < index.lineRecords.length) {
        const continuation = index.lineRecords[cursor];
        const continuationLexical = lexicalByStart.get(continuation.fromUnit);
        const continuationClean = continuation.raw.endsWith("\r") ? continuation.raw.slice(0, -1) : continuation.raw;
        const continuationMatch = continuationClean.match(/^[ \t]+\|(.*)$/);
        if (continuationLexical !== "PipelineContinuationLine" || !continuationMatch) break;
        const pipeAt = continuation.raw.indexOf("|");
        const continuationStages = parsePipeline(continuationMatch[1], continuation.fromUnit + pipeAt + 1, "block-stage", blockId);
        pipelineExecutable = pipelineExecutable && continuationStages.executable;
        pipeline.push(...continuationStages);
        continuationLines.push(continuation);
        cursor += 1;
      }
      const first = pipeline[0];
      if (!pipelineExecutable) pipeline.forEach((stage) => { stage.executable = false; });
      if (!first || first.name.startsWith("@")) {
        if (first?.name.startsWith("@")) recover("InvalidBlockStage", "TBA-PARSE-INVALID-STAGE-LAB", `Rad ${line.number}: blocket måste börja med en funktion.`, first.sourceSpan, { actual: first.name });
      }
      const block = {
        nodeId: nodeId("block"),
        kind: "Block",
        blockId,
        name: first?.name || "unknown",
        sourceSpan: line.sourceSpan,
        openSpan: line.sourceSpan,
        closeSpan: null,
        openLine: line.number,
        headerEndLine: continuationLines.at(-1)?.number || line.number,
        closeLine: null,
        parentBlockId: blockStack.at(-1)?.blockId || null,
        activeScopeIds: scopesBefore,
        inherit: typeof first?.args?.["@inherit"] === "string" && KNOWN_INHERITANCE.has(first.args["@inherit"]) ? first.args["@inherit"] : "default",
        cross: typeof first?.args?.["@cross"] === "string" ? first.args["@cross"] : "error",
        pipeline,
        children: [],
        complete: true,
        executable: Boolean(first) && pipelineExecutable && pipeline.every((stage) => stage.executable),
      };
      append(block);
      blocks.push(block);
      blockStack.push(block);
      writeSourceLine(line, "block-open", { blockId, name: block.name, inherit: block.inherit, cross: block.cross }, scopesBefore, blockStack.map((item) => item.blockId));
      for (const continuation of continuationLines) {
        writeSourceLine(continuation, "pipeline-continuation", { blockId, stages: pipeline.filter((stage) => stage.line === continuation.number).map((stage) => stage.stageId) }, scopesBefore, blockStack.map((item) => item.blockId));
      }
      lineIndex = cursor - 1;
      continue;
    }

    if (lexical === "BlockCloseLine") {
      const markerAt = line.raw.indexOf("<<<<");
      const body = clean.slice(markerAt + 4).trim();
      const match = body.match(/^([A-Za-z_][\w.-]*)$/);
      let block = blockStack.at(-1);
      if (!match) {
        recover("MalformedBlockClose", "TBA-PARSE-BLOCK-CLOSE-LAB", `Rad ${line.number}: ogiltig blockstängning “${body}”.`, line.sourceSpan, { actual: body, expected: "BlockName" });
        writeSourceLine(line, "recovery", { recoveryKind: "MalformedBlockClose" }, scopesBefore, blocksBefore);
        continue;
      }
      if (!block) {
        recover("OrphanBlockClose", "TBA-PARSE-BLOCK-ORPHAN-CLOSE-LAB", `Rad ${line.number}: oväntad slutmarkör för “${match[1]}”.`, line.sourceSpan, { actual: match[1], expected: "OpenBlock" });
        writeSourceLine(line, "recovery", { recoveryKind: "OrphanBlockClose", name: match[1] }, scopesBefore, blocksBefore);
        continue;
      }
      const ancestorPosition = blockStack.findLastIndex((candidate) => candidate.name === match[1]);
      if (block.name !== match[1] && ancestorPosition >= 0 && ancestorPosition < blockStack.length - 1) {
        while (blockStack.length - 1 > ancestorPosition) {
          const displaced = blockStack.at(-1);
          closeLocalScopes(displaced, line.sourceSpan);
          displaced.complete = false;
          displaced.executable = false;
          displaced.closeSpan = {
            ...line.sourceSpan,
            end: line.sourceSpan.start,
            endLine: line.sourceSpan.startLine,
            endColumn: line.sourceSpan.startColumn,
            synthetic: true,
          };
          displaced.sourceSpan = index.span(index.lineRecords[displaced.openLine - 1].fromUnit, line.fromUnit);
          recover(
            "MismatchedBlockClose",
            "TBA-PARSE-BLOCK-MISMATCH-LAB",
            `Rad ${line.number}: <<<< ${match[1]} stänger ett yttre block medan “${displaced.name}” fortfarande är öppet; en icke-körbar syntetisk close infogades.`,
            displaced.closeSpan,
            { actual: match[1], expected: displaced.name, synthetic: true },
            [
              { message: "Det inre blocket öppnades här.", sourceSpan: displaced.openSpan },
              { message: "Den författade stängningen hör till det yttre blocket.", sourceSpan: line.sourceSpan },
            ],
          );
          blockStack.pop();
        }
        block = blockStack.at(-1);
      }
      closeLocalScopes(block, line.sourceSpan);
      block.closeLine = line.number;
      block.closeSpan = line.sourceSpan;
      block.sourceSpan = index.span(block.openSpan.start === undefined ? line.fromUnit : index.lineRecords[block.openLine - 1].fromUnit, line.toUnit);
      if (block.name !== match[1]) {
        block.complete = false;
        block.executable = false;
        recover(
          "MismatchedBlockClose",
          "TBA-PARSE-BLOCK-MISMATCH-LAB",
          `Rad ${line.number}: väntade <<<< ${block.name}, men hittade <<<< ${match[1]}.`,
          line.sourceSpan,
          { actual: match[1], expected: block.name },
          [{ message: "Blocket öppnades här.", sourceSpan: block.openSpan }],
        );
      }
      blockStack.pop();
      writeSourceLine(line, block.name === match[1] ? "block-close" : "recovery", { blockId: block.blockId, name: match[1], expected: block.name }, scopesBefore, blocksBefore);
      continue;
    }

    if (lexical === "InvalidMarkerLine" || MARKER_PREFIX_PATTERN.test(clean) && !["TextLine", "PropertyLine"].includes(lexical)) {
      recover("MalformedMarker", "TBA-PARSE-MARKER-LAB", `Rad ${line.number}: ofullständig eller ogiltig kontrollmarkör.`, line.sourceSpan, { actual: clean.trim() });
      writeSourceLine(line, "recovery", { recoveryKind: "MalformedMarker" }, scopesBefore, blocksBefore);
      continue;
    }

    if (lexical === "PipelineContinuationLine" && /^[ \t]+\|/.test(clean)) {
      recover("OrphanPipelineContinuation", "TBA-PARSE-ORPHAN-PIPE-LAB", `Rad ${line.number}: pipelinefortsättningen hör inte direkt till ett blockhuvud.`, line.sourceSpan, { actual: clean.trim(), expected: "BlockHeader" });
      writeSourceLine(line, "recovery", { recoveryKind: "OrphanPipelineContinuation" }, scopesBefore, blocksBefore);
      continue;
    }

    if (lexical === "PropertyLine") {
      const trimmed = clean.trim();
      const attributes = trimmed.startsWith("{") && trimmed.endsWith("}") ? propertyAttributes(trimmed.slice(1, -1)) : null;
      if (attributes) {
        append({
          nodeId: nodeId("property"),
          kind: "Property",
          sourceSpan: line.sourceSpan,
          line: line.number,
          attributes,
          raw: trimmed,
          standalone: true,
          renderText: "",
          lineBreak: line.lineBreak,
          activeScopeIds: scopesBefore,
          activeBlockIds: blocksBefore,
          executable: false,
        });
        writeSourceLine(line, "property", { attributes, hiddenFromRender: true }, scopesBefore, blocksBefore);
        continue;
      }
    }

    const inlineProperty = parseInlineProperty(line.raw, line.fromUnit, index);
    const textNode = appendText(line, line.raw ? "Text" : "Blank", inlineProperty?.renderText ?? line.raw, inlineProperty ? { properties: [inlineProperty.property] } : {});
    if (inlineProperty) {
      const propertyNode = {
        nodeId: nodeId("property"),
        kind: "Property",
        sourceSpan: inlineProperty.property.sourceSpan,
        line: line.number,
        attributes: inlineProperty.property.attributes,
        raw: inlineProperty.property.raw,
        standalone: false,
        ownerNodeId: textNode.nodeId,
        executable: false,
      };
      textNode.properties = [propertyNode];
      flatNodes.push(propertyNode);
    }
    writeSourceLine(line, line.raw ? "text" : "blank", inlineProperty ? { properties: [inlineProperty.property], hiddenFromRender: true } : {}, scopesBefore, blocksBefore);
  }

  const eofSpan = index.span(source.length, source.length, { synthetic: true });
  while (blockStack.length) {
    const block = blockStack.at(-1);
    closeLocalScopes(block, eofSpan);
    block.complete = false;
    block.executable = false;
    block.sourceSpan = index.span(index.lineRecords[block.openLine - 1].fromUnit, source.length);
    recover(
      "MissingBlockClose",
      "TBA-PARSE-BLOCK-UNCLOSED-LAB",
      `Blocket “${block.name}” saknar slutmarkören <<<< ${block.name}.`,
      eofSpan,
      { actual: null, expected: `<<<< ${block.name}`, synthetic: true },
      [{ message: "Blocket öppnades här.", sourceSpan: block.openSpan }],
    );
    blockStack.pop();
  }
  for (let position = activeScopes.length - 1; position >= 0; position -= 1) {
    const scope = activeScopes[position];
    scope.complete = false;
    invalidateScope(scope);
    recover(
      "MissingScopeClose",
      "TBA-PARSE-SCOPE-UNCLOSED-LAB",
      `Intervallet “${scope.id}” är fortfarande öppet vid dokumentets slut.`,
      eofSpan,
      { actual: null, expected: `<<<<+ @id=${scope.id}`, synthetic: true },
      [{ message: "Intervallet öppnades här.", sourceSpan: scope.openSpan }],
    );
  }

  for (let position = blocks.length - 1; position >= 0; position -= 1) {
    const block = blocks[position];
    if (block.children.some((child) => child.kind === "Recovery" || (["Block", "IntervalOpen", "IntervalClose"].includes(child.kind) && child.executable === false))) {
      block.executable = false;
    }
  }

  for (const scope of scopes) {
    let current = null;
    for (const sourceLine of sourceLines.filter(Boolean)) {
      const active = sourceLine.activeScopeIds.includes(scope.id)
        && ["text", "blank", "property", "literal-marker", "fence-open", "fence-text", "fence-close"].includes(sourceLine.kind);
      if (active && current === null) current = { startLine: sourceLine.line, endLine: sourceLine.line, sourceSpan: sourceLine.sourceSpan };
      else if (active) {
        current.endLine = sourceLine.line;
        current.sourceSpan = {
          ...current.sourceSpan,
          end: sourceLine.sourceSpan.end,
          endLine: sourceLine.sourceSpan.endLine,
          endColumn: sourceLine.sourceSpan.endColumn,
        };
      } else if (current) { scope.segments.push(current); current = null; }
    }
    if (current) scope.segments.push(current);
  }

  diagnostics.sort((left, right) => left.sourceSpan.start - right.sourceSpan.start || left.code.localeCompare(right.code));
  const executable = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  root.executable = executable;

  const serializeNode = (node, nested = true) => {
    const common = {
      nodeId: node.nodeId,
      kind: node.kind,
      sourceSpan: node.sourceSpan,
      executable: node.executable,
    };
    if (node.kind === "Block") return {
      ...common,
      blockId: node.blockId,
      name: node.name,
      openSpan: node.openSpan,
      closeSpan: node.closeSpan,
      activeScopeIds: node.activeScopeIds,
      inherit: node.inherit,
      cross: node.cross,
      pipeline: node.pipeline.map(publicStage),
      complete: node.complete,
      ...(nested ? { children: node.children.map((child) => serializeNode(child, true)) } : {}),
    };
    if (node.kind === "IntervalOpen") return { ...common, scopeId: node.scopeId, id: node.id, stage: node.stage };
    if (node.kind === "IntervalClose") return { ...common, scopeId: node.scopeId, id: node.id, target: node.target };
    if (node.kind === "IncludeDirective") return { ...common, specifier: node.specifier, path: node.path, legacy: node.legacy };
    if (node.kind === "ConfigDirective") return { ...common, values: node.values, stage: node.stage };
    if (node.kind === "Property") return { ...common, attributes: node.attributes, raw: node.raw, standalone: node.standalone, ownerNodeId: node.ownerNodeId || null };
    if (node.kind === "Recovery") return { ...common, recoveryId: node.recoveryId, recoveryKind: node.recoveryKind, actual: node.actual, expected: node.expected, synthetic: node.synthetic, detail: node.detail };
    return {
      ...common,
      line: node.line,
      text: node.text,
      renderText: node.renderText,
      activeScopeIds: node.activeScopeIds,
      activeBlockIds: node.activeBlockIds,
      detail: node.detail,
      ...(nested && node.properties ? { properties: node.properties.map((property) => serializeNode(property, true)) } : {}),
    };
  };

  const publicBlocks = blocks.map((block) => ({
    blockId: block.blockId,
    nodeId: block.nodeId,
    name: block.name,
    sourceSpan: block.sourceSpan,
    openSpan: block.openSpan,
    closeSpan: block.closeSpan,
    openLine: block.openLine,
    headerEndLine: block.headerEndLine,
    closeLine: block.closeLine,
    parentBlockId: block.parentBlockId,
    activeScopeIds: block.activeScopeIds,
    inherit: block.inherit,
    cross: block.cross,
    complete: block.complete,
    executable: block.executable,
    pipeline: block.pipeline.map((stage, stageIndex) => ({ ...publicStage(stage), stage: stageIndex + 1 })),
  }));
  const publicScopes = scopes.map((scope) => ({ ...scope }));
  const publicNodes = flatNodes.map((node) => serializeNode(node, false));
  const configuration = { scopeOrder: "asc", crossPolicy: "error" };
  for (const directive of directives) {
    if (directive.kind === "ConfigDirective" && ["declaration:asc", "declaration:desc"].includes(directive.values["scope-order"])) {
      configuration.scopeOrder = directive.values["scope-order"].endsWith(":desc") ? "desc" : "asc";
    }
  }

  const cst = {
    schema: "textabana.cst/lab-v1",
    grammarVersion: "0.4",
    sourceSpan: index.span(0, source.length),
    nodes: cstNodes,
    lossless: cstNodes.map((node) => node.lexeme).join("") === source,
  };
  const ast = {
    schema: "textabana.ast/lab-v1",
    grammarVersion: "0.4",
    nodeId: root.nodeId,
    kind: root.kind,
    sourceSpan: root.sourceSpan,
    executable,
    children: root.children.map((node) => serializeNode(node, true)),
  };
  const ir = {
    schema: "textabana.ir/lab-v2",
    languageVersion: "0.4-playground-subset",
    parser: {
      schema: "textabana.parser/lab-v1",
      engine: "lezer-lr",
      grammarVersion: "0.4",
      parseMode: "full-document",
      coordinateUnit: "unicode-code-point",
      recovery: "local-non-executable",
      incrementalReuse: false,
    },
    sourceRef: { documentId: documentId || `doc:${documentPath}`, version: sourceVersion },
    sourceSpan: index.span(0, source.length),
    validity: {
      status: executable ? "valid" : "recovered",
      executable,
      diagnosticCount: diagnostics.length,
      recoveryCount: recoverySequence,
    },
    configuration,
    syntax: { cst, ast },
    nodes: publicNodes,
    scopes: publicScopes,
    blocks: publicBlocks,
    directives: directives.map((node) => serializeNode(node, false)),
    diagnostics,
    sourceLines: sourceLines.filter(Boolean),
    unsupported: [
      "incremental-parser",
      "cross:split",
      "cross:promote",
      "cross:truncate",
      "cross:preserve",
      "canonical-sha256",
    ],
  };

  return { cst, ast, ir, program: root, directives, diagnostics, executable, sourceIndex: index };
}
