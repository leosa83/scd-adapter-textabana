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

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function withoutKeys(value, keys) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));
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

function adapterManifest(raw) {
  const manifest = {
    schema: "textabana.adapter-manifest/lab-v1",
    contract: "adapter-contract/1",
    phase: "post-commit",
    execution: "pure",
    deterministic: true,
    ...raw,
  };
  return {
    ...manifest,
    manifestDigest: `fnv1a:${sourceHash(canonicalJson(manifest))}`,
  };
}

const adapterManifests = [
  adapterManifest({
    adapterId: "org.textabana.result-summary",
    version: "1.0.0-lab.1",
    profile: "adapter-contract/1",
    support: "playground-subset",
    accepts: {
      resultSchemas: ["textabana.result/lab-v1"],
      profiles: ["runtime-json/1"],
      channels: [],
      artifactKinds: [],
    },
    produces: [{
      projectionKind: "result-summary",
      valueKind: "object",
      mediaType: "application/json",
      schemaRef: "textabana.result-summary/lab-v1",
    }],
    capabilities: {
      required: ["atomic-success-result", "typed-channel-descriptors"],
      optional: ["anchors", "source-map"],
    },
    fidelity: {
      mode: "selective",
      requiresSourceResult: true,
      omittedPaths: [
        "render.data",
        "channelSnapshots.*.events[*].payload",
        "anchors[*].selectors",
        "sourceMaps[*]",
      ],
    },
  }),
  adapterManifest({
    adapterId: "org.textabana.data-table",
    version: "1.0.0-lab.1",
    profile: "data/1",
    support: "playground-subset",
    accepts: {
      resultSchemas: ["textabana.result/lab-v1"],
      profiles: ["runtime-json/1", "data/1"],
      channels: [
        { name: "data.datasets", schemaRef: "schema:textabana/dataset/lab-v1", required: true },
        { name: "data.input.records", schemaRef: "schema:textabana/data-record/lab-v1", required: true },
        { name: "data.output.records", schemaRef: "schema:textabana/data-record/lab-v1", required: true },
        { name: "data.lineage", schemaRef: "schema:textabana/data-lineage/lab-v1", required: true },
        { name: "data.aggregates", schemaRef: "schema:textabana/data-aggregate/lab-v1", required: false },
      ],
      artifactKinds: [],
    },
    produces: [{
      projectionKind: "table",
      valueKind: "table",
      mediaType: "application/json",
      schemaRef: "textabana.data-table-projection/lab-v1",
    }],
    capabilities: {
      required: ["stable-record-id", "source-map", "derived-multi-input-source-map", "json-record-projection"],
      optional: ["artifacts", "arrow-ipc", "parquet", "openlineage-export"],
    },
    fidelity: {
      mode: "selective",
      requiresSourceResult: true,
      omittedPaths: [
        "render",
        "channelSnapshots.<non-data>",
        "anchors[*].selectors.TextQuoteSelector.context",
        "provenance.entities",
      ],
    },
  }),
  adapterManifest({
    adapterId: "org.textabana.notebook",
    version: "1.0.0-lab.1",
    profile: "notebook/1",
    support: "playground-subset",
    accepts: {
      resultSchemas: ["textabana.result/lab-v1"],
      profiles: ["runtime-json/1", "notebook/1"],
      channels: [
        { name: "notebook.snapshot", schemaRef: "schema:textabana/notebook-snapshot/lab-v1", required: true },
        { name: "notebook.cells", schemaRef: "schema:textabana/notebook-cell/lab-v1", required: true },
        { name: "notebook.outputs", schemaRef: "schema:textabana/notebook-output/lab-v1", required: true },
        { name: "notebook.state", schemaRef: "schema:textabana/notebook-state/lab-v1", required: true },
      ],
      artifactKinds: [],
    },
    produces: [{
      projectionKind: "notebook-view",
      valueKind: "notebook",
      mediaType: "application/json",
      schemaRef: "textabana.notebook-projection/lab-v1",
    }],
    capabilities: {
      required: ["stable-cell-id", "whole-snapshot", "mime-bundle", "stale-output-detection"],
      optional: ["jupyter-messaging", "nbformat-roundtrip", "session-kernel", "attached-kernel"],
    },
    fidelity: {
      mode: "selective",
      requiresSourceResult: true,
      omittedPaths: ["render", "channelSnapshots.<non-notebook>", "artifacts", "provenance.entities"],
    },
  }),
  adapterManifest({
    adapterId: "org.textabana.annotation-review",
    version: "1.0.0-contract.1",
    profile: "ml-lineage/1",
    support: "contract-only",
    accepts: {
      resultSchemas: ["textabana.result/v1", "textabana.result/lab-v1"],
      profiles: ["runtime-json/1", "editor/1", "ml-lineage/1"],
      channels: [{ name: "system.out", schemaRef: "textabana.system.out/v2", required: true }],
      artifactKinds: [],
    },
    produces: [{
      projectionKind: "annotation-set",
      valueKind: "object",
      mediaType: "application/ld+json",
      schemaRef: "https://www.w3.org/ns/anno.jsonld",
    }],
    capabilities: {
      required: ["anchors", "review-revisions"],
      optional: ["w3c-annotation", "label-studio-export"],
    },
    fidelity: { mode: "selective", requiresSourceResult: true, omittedPaths: [] },
  }),
];

const adapterCatalog = new Map(adapterManifests.map((manifest) => [manifest.adapterId, manifest]));

const playgroundImplementedCapabilities = [
  "blocks",
  "pipelines",
  "intervals",
  "inheritance",
  "cross:error",
  "typed-channel-descriptors",
  "system.out-v2",
  "anchors",
  "source-map",
  "atomic-success-result",
  "adapter-contract",
  "post-commit-adapter-fanout",
  "explicit-fidelity-report",
  "dataset-schema-events",
  "stable-record-id",
  "json-record-projection",
  "inner-join",
  "cell-lineage",
  "derived-aggregation",
  "derived-multi-input-source-map",
  "stable-cell-id",
  "whole-snapshot",
  "mime-bundle",
  "stale-output-detection",
];

function adapterDiagnostic(code, message, adapterId, severity = "error") {
  return {
    diagnosticId: `diag:adapter:${sourceHash(`${code}:${adapterId}:${message}`)}`,
    code,
    severity,
    level: severity,
    line: 1,
    message,
    phase: "adapter",
    adapterId,
  };
}

function validateAdapterManifest(manifest) {
  const problems = [];
  if (manifest.schema !== "textabana.adapter-manifest/lab-v1") problems.push("ogiltigt manifestschema");
  if (!manifest.adapterId || !manifest.version || !manifest.profile) problems.push("id, version och profil krävs");
  if (manifest.contract !== "adapter-contract/1" || manifest.phase !== "post-commit") problems.push("adaptern måste vara post-commit");
  if (!Array.isArray(manifest.accepts?.resultSchemas) || !manifest.accepts.resultSchemas.length) problems.push("accepterade resultatscheman saknas");
  if (!Array.isArray(manifest.produces) || !manifest.produces.length) problems.push("producerade projektioner saknas");
  if (!["playground-subset", "contract-only", "unsupported"].includes(manifest.support)) problems.push("ogiltig supportnivå");
  if (!["lossless", "selective", "lossy"].includes(manifest.fidelity?.mode)) problems.push("fidelity mode saknas");
  if (manifest.fidelity?.mode !== "lossless" && !manifest.fidelity?.requiresSourceResult) problems.push("selektiv eller förlustbringande projektion måste behålla source result reference");
  return problems;
}

function allCommittedEvents(result) {
  return Object.values(result.channelSnapshots || {}).flatMap((snapshot) => snapshot.events || []);
}

function buildResultSummaryProjection(result, manifest) {
  const events = allCommittedEvents(result);
  const activities = result.provenance?.activities || [];
  const outputContract = manifest.produces[0];
  const summary = {
    resultId: result.resultId,
    source: result.source,
    render: {
      kind: result.render.kind,
      mediaType: result.render.mediaType,
      characters: Array.from(String(result.render.data || "")).length,
    },
    channels: Object.entries(result.channelSnapshots || {}).map(([name, snapshot]) => ({
      name,
      schemaRef: snapshot.descriptor.schemaRef,
      events: snapshot.events.length,
    })),
    anchors: result.anchors.length,
    sourceMaps: result.sourceMaps.length,
    activities: activities.length,
    artifacts: result.artifacts.length,
  };
  const projectionSeed = {
    adapterId: manifest.adapterId,
    adapterVersion: manifest.version,
    manifestDigest: manifest.manifestDigest,
    sourceResultId: result.resultId,
    output: summary,
  };
  return {
    schema: "textabana.adapter-projection/lab-v1",
    projectionId: `projection:${sourceHash(canonicalJson(projectionSeed))}`,
    adapterRef: {
      adapterId: manifest.adapterId,
      version: manifest.version,
      manifestDigest: manifest.manifestDigest,
    },
    sourceResultRef: {
      resultId: result.resultId,
      resultSchema: result.schema,
      sourceVersion: result.source?.version || "unknown",
    },
    status: "succeeded",
    output: {
      ...outputContract,
      data: summary,
      artifactRefs: [],
    },
    mapping: "derived",
    fidelity: manifest.fidelity,
    references: {
      eventRefs: events.map((event) => event.eventId),
      anchorRefs: result.anchors.map((anchor) => anchor.anchorId),
      sourceMapRefs: result.sourceMaps.map((mapping) => mapping.mappingId),
      provenanceRefs: activities.map((activity) => activity.activityId),
    },
    diagnostics: [],
    extensions: {
      "textabana.playground": {
        canonical: false,
        note: "Körbar referensprojektion för adapter-contract/1; inte ett domänadapteranspråk.",
      },
    },
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function buildDataTableProjection(result, manifest) {
  const snapshots = result.channelSnapshots || {};
  const datasetEvents = snapshots["data.datasets"]?.events || [];
  const inputEvents = snapshots["data.input.records"]?.events || [];
  const outputEvents = snapshots["data.output.records"]?.events || [];
  const lineageEvents = snapshots["data.lineage"]?.events || [];
  const aggregateEvents = snapshots["data.aggregates"]?.events || [];
  const outputDatasetEvents = datasetEvents.filter((event) => event.payload?.role === "output");
  if (outputDatasetEvents.length !== 1) throw new Error("data.datasets måste innehålla exakt ett output-dataset i denna playground-subset");
  const outputDatasetEvent = outputDatasetEvents[0];

  const datasetId = String(outputDatasetEvent.payload.datasetId);
  const rowsForDataset = outputEvents.filter((event) => event.payload?.datasetId === datasetId);
  const lineageForDataset = lineageEvents.filter((event) => event.payload?.output?.datasetId === datasetId);
  const recordLineage = lineageForDataset.filter((event) => event.payload?.granularity === "record");
  const cellLineage = lineageForDataset.filter((event) => event.payload?.granularity === "cell");
  if (outputDatasetEvent.payload.recordCount !== rowsForDataset.length) throw new Error("output-datasetets recordCount matchar inte data.output.records");
  const recordIds = rowsForDataset.map((event) => String(event.payload?.recordId || ""));
  if (recordIds.some((recordId) => !recordId) || new Set(recordIds).size !== recordIds.length) throw new Error("data.output.records måste ha unika recordId");
  const fields = outputDatasetEvent.payload.fields || [];
  const fieldNames = fields.map((field) => field.name);
  const inputRecordIds = new Set(inputEvents.map((event) => event.payload?.recordId));
  const knownAnchors = new Set((result.anchors || []).map((anchor) => anchor.anchorId));
  const sourceMapByOutput = new Map((result.sourceMaps || []).map((mapping) => [mapping.outputRef, mapping]));
  for (const event of rowsForDataset) {
    for (const field of fields) {
      if (!Object.hasOwn(event.payload?.values || {}, field.name)) throw new Error(`record ${event.payload.recordId} saknar kolumnen ${field.name}`);
      const value = event.payload.values[field.name];
      if (value === null && field.nullable) continue;
      if (field.type === "integer" && !Number.isInteger(value)) throw new Error(`kolumnen ${field.name} måste innehålla heltal`);
      if (field.type === "utf8" && typeof value !== "string") throw new Error(`kolumnen ${field.name} måste innehålla text`);
    }
    const lineageEvent = recordLineage.find((candidate) => candidate.payload?.output?.recordId === event.payload.recordId);
    if (!lineageEvent) throw new Error(`record ${event.payload.recordId} saknar record-lineage`);
    if (lineageEvent.payload.inputRecordIds?.length !== 2 || !lineageEvent.payload.inputRecordIds.every((recordId) => inputRecordIds.has(recordId))) {
      throw new Error(`record ${event.payload.recordId} måste referera två kända input-records`);
    }
    const mapping = sourceMapByOutput.get(event.eventId);
    if (mapping?.mapping !== "derived" || mapping.inputAnchorRefs?.length !== 2 || !mapping.inputAnchorRefs.every((anchorRef) => knownAnchors.has(anchorRef))) {
      throw new Error(`record ${event.payload.recordId} saknar en derived SourceMap med två inputankare`);
    }
    if (mapping.outputSelector?.datasetId !== datasetId || mapping.outputSelector?.recordId !== event.payload.recordId) {
      throw new Error(`record ${event.payload.recordId} saknar matchande DataSelector`);
    }
  }
  for (const event of cellLineage) {
    if (!recordIds.includes(event.payload?.output?.recordId) || !fieldNames.includes(event.payload?.output?.column)) {
      throw new Error("cell-lineage pekar på en okänd outputcell");
    }
    if (!Array.isArray(event.payload?.inputs) || !event.payload.inputs.length || event.payload.inputs.some((selector) => !selector.column)) {
      throw new Error("cell-lineage måste ange minst en inputkolumn");
    }
    const mapping = sourceMapByOutput.get(event.eventId);
    if (mapping?.outputSelector?.column !== event.payload.output.column || mapping.mapping !== "derived") {
      throw new Error("cell-lineage saknar en derived SourceMap med kolumnselector");
    }
  }
  for (const event of aggregateEvents) {
    const mapping = sourceMapByOutput.get(event.eventId);
    if (event.payload?.mapping !== "derived" || mapping?.mapping !== "derived") throw new Error("aggregation måste ha derived lineage");
  }
  const consumedEvents = [
    ...datasetEvents,
    ...inputEvents,
    ...rowsForDataset,
    ...lineageForDataset,
    ...aggregateEvents,
  ];
  const eventRefs = uniqueStrings(consumedEvents.map((event) => event.eventId));
  const consumedSet = new Set(eventRefs);
  const sourceMaps = (result.sourceMaps || []).filter((mapping) => consumedSet.has(mapping.outputRef));
  const mappingByOutput = new Map(sourceMaps.map((mapping) => [mapping.outputRef, mapping]));
  const lineageByRecord = new Map(recordLineage.map((event) => [event.payload.output.recordId, event]));

  const rows = rowsForDataset.map((event) => {
    const lineageEvent = lineageByRecord.get(event.payload.recordId);
    const mapping = mappingByOutput.get(event.eventId);
    return {
      recordId: event.payload.recordId,
      values: event.payload.values,
      _textabana: {
        eventRef: event.eventId,
        anchorRef: event.target.anchorRef,
        sourceMapRef: mapping?.mappingId || null,
        provenanceRef: event.provenanceRef,
        lineageEventRef: lineageEvent?.eventId || null,
        inputRecordIds: lineageEvent?.payload?.inputRecordIds || [],
        inputAnchorRefs: lineageEvent?.payload?.inputAnchorRefs || mapping?.inputAnchorRefs || [],
      },
    };
  });
  const data = {
    schema: "textabana.data-table-projection/lab-v1",
    dataset: outputDatasetEvent.payload,
    columns: outputDatasetEvent.payload.fields || [],
    rows,
    recordLineage: recordLineage.map((event) => event.payload),
    cellLineage: cellLineage.map((event) => event.payload),
    aggregates: aggregateEvents.map((event) => event.payload),
  };
  const projectionSeed = {
    adapterId: manifest.adapterId,
    adapterVersion: manifest.version,
    manifestDigest: manifest.manifestDigest,
    sourceResultId: result.resultId,
    output: data,
  };
  const anchorRefs = uniqueStrings([
    ...consumedEvents.map((event) => event.target?.anchorRef),
    ...sourceMaps.flatMap((mapping) => mapping.inputAnchorRefs || []),
  ]);
  const provenanceRefs = uniqueStrings([
    ...consumedEvents.map((event) => event.provenanceRef),
    ...sourceMaps.map((mapping) => mapping.generatingActivity),
  ]);

  return {
    schema: "textabana.adapter-projection/lab-v1",
    projectionId: `projection:${sourceHash(canonicalJson(projectionSeed))}`,
    adapterRef: {
      adapterId: manifest.adapterId,
      version: manifest.version,
      manifestDigest: manifest.manifestDigest,
    },
    sourceResultRef: {
      resultId: result.resultId,
      resultSchema: result.schema,
      sourceVersion: result.source?.version || "unknown",
    },
    status: "succeeded",
    output: {
      ...manifest.produces[0],
      data,
      artifactRefs: [],
    },
    mapping: "derived",
    fidelity: manifest.fidelity,
    references: {
      eventRefs,
      anchorRefs,
      sourceMapRefs: uniqueStrings(sourceMaps.map((mapping) => mapping.mappingId)),
      provenanceRefs,
    },
    diagnostics: [],
    extensions: {
      "textabana.playground": {
        canonical: false,
        subset: "JSON table projection",
        unsupported: ["Arrow IPC", "Parquet", "DuckDB", "ArtifactRef persistence", "OpenLineage export"],
      },
    },
  };
}

function buildNotebookProjection(result, manifest) {
  const snapshots = result.channelSnapshots || {};
  const snapshotEvents = snapshots["notebook.snapshot"]?.events || [];
  const cellEvents = snapshots["notebook.cells"]?.events || [];
  const outputEvents = snapshots["notebook.outputs"]?.events || [];
  const stateEvents = snapshots["notebook.state"]?.events || [];
  if (snapshotEvents.length !== 1) throw new Error("notebook.snapshot måste innehålla exakt en whole snapshot");
  if (stateEvents.length !== 1) throw new Error("notebook.state måste innehålla exakt en explicit stateprofil");

  const snapshot = snapshotEvents[0].payload || {};
  const state = stateEvents[0].payload || {};
  if (snapshot.wholeSnapshot !== true || state.wholeSnapshot !== true) throw new Error("notebookadaptern accepterar endast whole snapshots");
  const notebookId = String(snapshot.notebookId || "");
  const snapshotId = String(snapshot.snapshotId || "");
  if (!notebookId || !snapshotId || state.notebookId !== notebookId || state.snapshotId !== snapshotId) throw new Error("notebook- och snapshotidentitet måste vara konsekvent");
  if (!["fresh", "session", "attached"].includes(state.requestedProfile) || state.profile !== snapshot.profile) throw new Error("notebook.state saknar en giltig explicit profil");
  if (state.requestedProfile === "fresh" && (state.executionSupport !== "playground-subset" || state.kernelState !== "not-used")) throw new Error("fresh-profilen måste vara strukturell och kernel-fri");
  if (state.requestedProfile !== "fresh" && (state.executionSupport !== "contract-only" || state.kernelState !== "external-unverified")) throw new Error("session och attached får inte simulera kernelstate");

  const orderedCellIds = cellEvents.map((event) => String(event.payload?.cellId || ""));
  if (!orderedCellIds.length || orderedCellIds.some((cellId) => !cellId) || new Set(orderedCellIds).size !== orderedCellIds.length) throw new Error("notebook.cells måste ha unika stabila cellId");
  if (snapshot.cellCount !== cellEvents.length || canonicalJson(snapshot.cellIds || []) !== canonicalJson(orderedCellIds)) throw new Error("snapshotens cellista måste matcha den författade cellordningen");
  if (outputEvents.length !== cellEvents.length) throw new Error("varje notebookcell måste ha exakt en output");

  const outputByCell = new Map(outputEvents.map((event) => [event.payload?.cellId, event]));
  const knownAnchors = new Set((result.anchors || []).map((anchor) => anchor.anchorId));
  const knownActivities = new Set((result.provenance?.activities || []).map((activity) => activity.activityId));
  const sourceMapByOutput = new Map((result.sourceMaps || []).map((mapping) => [mapping.outputRef, mapping]));
  const mimeTypes = ["text/plain", "text/markdown", "application/vnd.textabana.result+json"];

  const cells = cellEvents.map((cellEvent, index) => {
    const cell = cellEvent.payload || {};
    const outputEvent = outputByCell.get(cell.cellId);
    if (!outputEvent || outputEvent.payload?.notebookId !== notebookId || outputEvent.payload?.snapshotId !== snapshotId) throw new Error(`cellen ${cell.cellId} saknar matchande snapshot-bunden output`);
    const output = outputEvent.payload;
    if (cell.notebookId !== notebookId || cell.snapshotId !== snapshotId || cell.index !== index) throw new Error(`cellen ${cell.cellId} har inkonsekvent identitet eller ordning`);
    if (output.sourceDigest !== cell.sourceDigest || output.status !== "fresh") throw new Error(`output för ${cell.cellId} är stale mot aktuell cellkälla`);
    if (!output.mimeBundle || mimeTypes.some((mimeType) => !Object.hasOwn(output.mimeBundle, mimeType))) throw new Error(`output för ${cell.cellId} saknar obligatorisk MIME-representation`);
    const cellMap = sourceMapByOutput.get(cellEvent.eventId);
    const outputMap = sourceMapByOutput.get(outputEvent.eventId);
    for (const [event, mapping] of [[cellEvent, cellMap], [outputEvent, outputMap]]) {
      if (!knownAnchors.has(event.target?.anchorRef) || !mapping || !knownActivities.has(mapping.generatingActivity)) throw new Error(`cellen ${cell.cellId} har en oresolverbar Anchor, SourceMap eller provenanceaktivitet`);
      if (mapping.outputSelector?.type !== "CellSelector" || mapping.outputSelector.notebookId !== notebookId || mapping.outputSelector.cellId !== cell.cellId) throw new Error(`cellen ${cell.cellId} saknar matchande CellSelector`);
    }
    if (outputMap.mapping !== "derived" || !outputMap.inputAnchorRefs?.includes(cellEvent.target.anchorRef)) throw new Error(`output för ${cell.cellId} saknar derived källbindning`);
    return {
      cellId: cell.cellId,
      title: cell.title,
      index: cell.index,
      language: cell.language,
      source: cell.source,
      sourceDigest: cell.sourceDigest,
      metadata: cell.metadata,
      mimeBundle: output.mimeBundle,
      output: {
        outputDigest: output.outputDigest,
        sourceDigest: output.sourceDigest,
        outputSourceDigest: output.sourceDigest,
        stale: false,
        eventRef: outputEvent.eventId,
        anchorRef: outputEvent.target.anchorRef,
        sourceMapRef: outputMap.mappingId,
        provenanceRef: outputEvent.provenanceRef,
      },
    };
  });
  if (outputByCell.size !== cellEvents.length) throw new Error("notebook.outputs innehåller okända eller duplicerade celler");

  const consumedEvents = [...snapshotEvents, ...stateEvents, ...cellEvents, ...outputEvents];
  const eventRefs = uniqueStrings(consumedEvents.map((event) => event.eventId));
  const consumedSet = new Set(eventRefs);
  const sourceMaps = (result.sourceMaps || []).filter((mapping) => consumedSet.has(mapping.outputRef));
  const data = {
    schema: "textabana.notebook-projection/lab-v1",
    notebook: {
      notebookId,
      snapshotId,
      stateProfile: state.requestedProfile,
      executionSupport: state.executionSupport,
      kernelState: state.kernelState,
      wholeSnapshot: true,
      cellOrder: orderedCellIds,
      metadata: snapshot.metadata || {},
    },
    cells,
    state,
  };
  const projectionSeed = {
    adapterId: manifest.adapterId,
    adapterVersion: manifest.version,
    manifestDigest: manifest.manifestDigest,
    sourceResultId: result.resultId,
    output: data,
  };
  return {
    schema: "textabana.adapter-projection/lab-v1",
    projectionId: `projection:${sourceHash(canonicalJson(projectionSeed))}`,
    adapterRef: { adapterId: manifest.adapterId, version: manifest.version, manifestDigest: manifest.manifestDigest },
    sourceResultRef: { resultId: result.resultId, resultSchema: result.schema, sourceVersion: result.source?.version || "unknown" },
    status: "succeeded",
    output: { ...manifest.produces[0], data, artifactRefs: [] },
    mapping: "derived",
    fidelity: manifest.fidelity,
    references: {
      eventRefs,
      anchorRefs: uniqueStrings([
        ...consumedEvents.map((event) => event.target?.anchorRef),
        ...sourceMaps.flatMap((mapping) => mapping.inputAnchorRefs || []),
      ]),
      sourceMapRefs: uniqueStrings(sourceMaps.map((mapping) => mapping.mappingId)),
      provenanceRefs: uniqueStrings([
        ...consumedEvents.map((event) => event.provenanceRef),
        ...sourceMaps.map((mapping) => mapping.generatingActivity),
      ]),
    },
    diagnostics: [],
    extensions: {
      "textabana.playground": {
        canonical: false,
        subset: "host-neutral notebook snapshot projection",
        unsupported: ["Jupyter Messaging", "nbformat roundtrip", "session/attached kernel execution", "Comms/widgets"],
      },
    },
  };
}

const adapterImplementations = new Map([
  ["org.textabana.result-summary", buildResultSummaryProjection],
  ["org.textabana.data-table", buildDataTableProjection],
  ["org.textabana.notebook", buildNotebookProjection],
]);

function validateAdapterProjection(projection, result, manifest) {
  const problems = [];
  if (projection.schema !== "textabana.adapter-projection/lab-v1") problems.push("ogiltigt projektionsschema");
  if (projection.sourceResultRef?.resultId !== result.resultId) problems.push("sourceResultRef pekar inte på inputresultatet");
  if (projection.adapterRef?.manifestDigest !== manifest.manifestDigest) problems.push("manifest digest matchar inte");
  if (projection.output?.schemaRef !== manifest.produces[0]?.schemaRef) problems.push("output schema matchar inte manifestet");
  if (projection.fidelity?.mode !== "lossless" && !projection.fidelity?.omittedPaths?.length) problems.push("selektiv eller förlustbringande projektion måste redovisa omittedPaths");

  const knownEvents = new Set(allCommittedEvents(result).map((event) => event.eventId));
  const knownAnchors = new Set(result.anchors.map((anchor) => anchor.anchorId));
  const knownMappings = new Set(result.sourceMaps.map((mapping) => mapping.mappingId));
  const knownActivities = new Set((result.provenance?.activities || []).map((activity) => activity.activityId));
  const checks = [
    [projection.references?.eventRefs || [], knownEvents, "event"],
    [projection.references?.anchorRefs || [], knownAnchors, "anchor"],
    [projection.references?.sourceMapRefs || [], knownMappings, "SourceMap"],
    [projection.references?.provenanceRefs || [], knownActivities, "provenance"],
  ];
  for (const [references, known, kind] of checks) {
    for (const reference of references) if (!known.has(reference)) problems.push(`okänd ${kind}-referens ${reference}`);
  }
  return problems;
}

function unsupportedProjection(manifest, result, diagnostic) {
  return {
    schema: "textabana.adapter-projection/lab-v1",
    projectionId: `projection:unsupported:${sourceHash(`${manifest.manifestDigest}:${result.resultId}`)}`,
    adapterRef: {
      adapterId: manifest.adapterId,
      version: manifest.version,
      manifestDigest: manifest.manifestDigest,
    },
    sourceResultRef: {
      resultId: result.resultId,
      resultSchema: result.schema,
      sourceVersion: result.source?.version || "unknown",
    },
    status: "unsupported",
    mapping: "synthetic",
    fidelity: manifest.fidelity,
    references: { eventRefs: [], anchorRefs: [], sourceMapRefs: [], provenanceRefs: [] },
    diagnostics: [diagnostic],
    extensions: {},
  };
}

function runAdapters(result, requestedAdapterIds, availableCapabilities = []) {
  const requested = Array.isArray(requestedAdapterIds) && requestedAdapterIds.length
    ? [...new Set(requestedAdapterIds.map(String))]
    : ["org.textabana.result-summary"];
  const adapterRunId = `adapter-run:${result.run.runId}`;
  const resultBefore = canonicalJson(result);
  const beforeDigest = `fnv1a:${sourceHash(resultBefore)}`;
  if (result.run.status !== "succeeded" || !result.run.committed) {
    return {
      schema: "textabana.adapter-run/lab-v1",
      adapterRunId,
      sourceResultRef: result.resultId,
      status: "skipped",
      requested,
      manifests: adapterManifests,
      projections: [],
      diagnostics: [adapterDiagnostic("TBA-ADAPTER-SKIPPED-LAB", "Adapters körs endast efter en lyckad atomisk commit.", "adapter-run", "info")],
      verification: { beforeDigest, afterDigest: beforeDigest, immutable: true },
    };
  }

  const projections = [];
  const diagnostics = [];
  for (const adapterId of requested) {
    const manifest = adapterCatalog.get(adapterId);
    if (!manifest) {
      diagnostics.push(adapterDiagnostic("TBA-ADAPTER-UNKNOWN-LAB", `Okänd adapter “${adapterId}”.`, adapterId));
      continue;
    }
    const manifestProblems = validateAdapterManifest(manifest);
    if (manifestProblems.length) {
      diagnostics.push(adapterDiagnostic("TBA-ADAPTER-MANIFEST-LAB", `${adapterId}: ${manifestProblems.join("; ")}.`, adapterId));
      continue;
    }
    if (manifest.support !== "playground-subset") {
      const diagnostic = adapterDiagnostic(
        "TBA-ADAPTER-CONTRACT-ONLY-LAB",
        `${adapterId} är registrerad som contract-only och producerar ingen simulerad output.`,
        adapterId,
        "info",
      );
      projections.push(unsupportedProjection(manifest, result, diagnostic));
      diagnostics.push(diagnostic);
      continue;
    }
    if (!manifest.accepts.resultSchemas.includes(result.schema)) {
      const diagnostic = adapterDiagnostic("TBA-ADAPTER-INPUT-LAB", `${adapterId} accepterar inte ${result.schema}.`, adapterId);
      projections.push(unsupportedProjection(manifest, result, diagnostic));
      diagnostics.push(diagnostic);
      continue;
    }
    const missingCapability = manifest.capabilities.required.find((capability) => !availableCapabilities.includes(capability));
    if (missingCapability) {
      const diagnostic = adapterDiagnostic("TBA-ADAPTER-CAPABILITY-LAB", `${adapterId} kräver capability “${missingCapability}”.`, adapterId);
      projections.push(unsupportedProjection(manifest, result, diagnostic));
      diagnostics.push(diagnostic);
      continue;
    }
    const missingChannel = manifest.accepts.channels.find((requirement) => {
      if (!requirement.required) return false;
      const snapshot = result.channelSnapshots?.[requirement.name];
      return !snapshot || (requirement.schemaRef && snapshot.descriptor.schemaRef !== requirement.schemaRef);
    });
    if (missingChannel) {
      const diagnostic = adapterDiagnostic("TBA-ADAPTER-INPUT-LAB", `${adapterId} saknar kompatibel kanal “${missingChannel.name}”.`, adapterId);
      projections.push(unsupportedProjection(manifest, result, diagnostic));
      diagnostics.push(diagnostic);
      continue;
    }
    const implementation = adapterImplementations.get(adapterId);
    if (!implementation) {
      const diagnostic = adapterDiagnostic("TBA-ADAPTER-IMPLEMENTATION-LAB", `${adapterId} har ingen körbar implementation i denna playground.`, adapterId);
      projections.push(unsupportedProjection(manifest, result, diagnostic));
      diagnostics.push(diagnostic);
      continue;
    }
    try {
      const projection = implementation(JSON.parse(JSON.stringify(result)), manifest);
      const projectionProblems = validateAdapterProjection(projection, result, manifest);
      if (projectionProblems.length) throw new Error(projectionProblems.join("; "));
      projections.push(projection);
    } catch (error) {
      const diagnostic = adapterDiagnostic("TBA-ADAPTER-PROJECTION-LAB", `${adapterId}: ${error instanceof Error ? error.message : String(error)}`, adapterId);
      diagnostics.push(diagnostic);
      projections.push({
        ...unsupportedProjection(manifest, result, diagnostic),
        status: "failed",
        projectionId: `projection:failed:${sourceHash(`${manifest.manifestDigest}:${result.resultId}`)}`,
      });
    }
  }
  const resultAfter = canonicalJson(result);
  const afterDigest = `fnv1a:${sourceHash(resultAfter)}`;
  if (resultAfter !== resultBefore) {
    const diagnostic = adapterDiagnostic("TBA-ADAPTER-MUTATION-LAB", "En adapter försökte mutera sitt immutable källresultat.", "adapter-run");
    diagnostics.push(diagnostic);
  }
  const succeeded = projections.filter((projection) => projection.status === "succeeded").length;
  const failed = projections.filter((projection) => projection.status === "failed").length;
  return {
    schema: "textabana.adapter-run/lab-v1",
    adapterRunId,
    sourceResultRef: result.resultId,
    status: failed && !succeeded ? "failed" : diagnostics.length ? "partial" : "succeeded",
    requested,
    manifests: adapterManifests,
    projections,
    diagnostics,
    verification: { beforeDigest, afterDigest, immutable: resultAfter === resultBefore },
  };
}

function buildCapabilities(inspection) {
  return {
    schema: "textabana.capabilities/lab-v1",
    profiles: {
      "language-core/0.4": "playground-subset",
      "runtime-json/1": "playground-subset",
      "editor/1": "playground-subset",
      "adapter-contract/1": "playground-subset",
      "data/1": "playground-subset",
      "notebook/1": "playground-subset",
      "ml-lineage/1": "contract-only",
    },
    adapters: adapterManifests.map((manifest) => ({
      adapterId: manifest.adapterId,
      version: manifest.version,
      profile: manifest.profile,
      support: manifest.support,
      manifestDigest: manifest.manifestDigest,
    })),
    implemented: playgroundImplementedCapabilities,
    unsupported: [...new Set([
      ...(inspection?.unsupported || []),
      "reanchor",
      "lsp",
      "cancellation",
      "artifacts",
      "adapter-dependency-graph",
      "stateful-adapters",
      "sink-bindings",
      "arrow-ipc",
      "parquet",
      "duckdb",
      "artifact-store",
      "openlineage-export",
      "jupyter-messaging",
      "nbformat-roundtrip",
      "session-kernel-execution",
      "attached-kernel-execution",
      "jupyter-comms-widgets",
    ])],
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
  let invocationSequence = 0;

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

  const createAnchor = ({ line, row, rowId, mode, column, endLine, execution, notebookId, cellId }) => {
    const position = positionForLine(line);
    const stablePart = cellId
      ? `cell:${sourceHash(documentPath)}:${sourceHash(String(notebookId || "notebook"))}:${sourceHash(String(cellId))}`
      : mode === "row" && rowId
        ? `row:${sourceHash(documentPath)}:${sourceHash(String(rowId))}`
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
        ...(notebookId ? { notebookId: String(notebookId) } : {}),
        cellId: cellId ? String(cellId) : null,
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
        invocationId: execution.invocationId,
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
    const anchor = createAnchor({
      line,
      row,
      rowId,
      mode,
      column,
      endLine,
      execution,
      notebookId: location.notebookId,
      cellId: location.cellId,
    });
    const explicitInputAnchorRefs = location.inputAnchorRefs === undefined
      ? null
      : Array.isArray(location.inputAnchorRefs)
        ? uniqueStrings(location.inputAnchorRefs)
        : [];
    if (explicitInputAnchorRefs && !explicitInputAnchorRefs.length) {
      throw new Error(`Kanalen “${channel}”: inputAnchorRefs måste vara en icke-tom lista.`);
    }
    if (explicitInputAnchorRefs) {
      for (const anchorRef of explicitInputAnchorRefs) {
        if (!anchors.has(anchorRef)) throw new Error(`Kanalen “${channel}”: okänd input anchor “${anchorRef}”.`);
      }
    }
    const inputSelectors = location.inputSelectors === undefined
      ? undefined
      : serializableValue(location.inputSelectors);
    const outputSelector = location.outputSelector === undefined
      ? location.datasetId && location.recordId
        ? {
            type: "DataSelector",
            datasetId: String(location.datasetId),
            recordId: String(location.recordId),
            ...(location.columnName ? { column: String(location.columnName) } : {}),
          }
        : location.notebookId && location.cellId
          ? {
              type: "CellSelector",
              notebookId: String(location.notebookId),
              cellId: String(location.cellId),
            }
        : undefined
      : serializableValue(location.outputSelector);

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
        ...(location.datasetId ? { datasetId: String(location.datasetId) } : {}),
        ...(location.recordId ? { recordId: String(location.recordId) } : {}),
        ...(location.notebookId ? { notebookId: String(location.notebookId) } : {}),
        ...(location.cellId ? { cellId: String(location.cellId) } : {}),
        ...(location.columnName ? { columnName: String(location.columnName) } : {}),
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
        invocationId: execution.invocationId,
        function: execution.functionName,
        module: execution.modulePath,
        modality: execution.modality || "block",
        stageLine: execution.stageLine,
        ...(execution.scopeId ? { scopeId: execution.scopeId } : {}),
      },
      ...(Number.isInteger(column) && column > 0 ? { column } : {}),
      ...(Number.isInteger(endLine) && endLine >= line ? { endLine } : {}),
      provenanceRef: execution.activityId,
      state: "tentative",
      extensions: {},
    };

    if (!channels.has(channel)) channels.set(channel, []);
    channels.get(channel).push(event);
    sourceMaps.push({
      mappingId: `mapping:${eventId}`,
      outputRef: eventId,
      inputAnchorRefs: explicitInputAnchorRefs || [anchor.anchorId],
      mapping: event.source.mapping,
      generatingActivity: event.provenanceRef,
      ...(outputSelector ? { outputSelector } : {}),
      ...(inputSelectors ? { inputSelectors } : {}),
    });
    return event;
  };

  return {
    declare,
    emit,
    createExecution(base) {
      invocationSequence += 1;
      const ordinal = String(invocationSequence).padStart(4, "0");
      return {
        ...base,
        stageId: `stage:${ordinal}:${base.modality || "block"}:${base.scopeId || base.functionName}:${base.stageLine}`,
        invocationId: `invocation:${ordinal}`,
        activityId: `activity:invocation:${ordinal}`,
      };
    },
    recordStage(stage) {
      stageSequence += 1;
      executionTrace.push({
        schema: "textabana.execution-step/lab-v1",
        step: stageSequence,
        stageId: stage.execution.stageId,
        invocationId: stage.execution.invocationId,
        activityId: stage.execution.activityId,
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
  const execution = channelBus.createExecution({
    functionName: stage.name,
    modulePath: entry.modulePath,
    modality: contextExtra.modality || "block",
    scopeId: contextExtra.scopeId,
    stageLine: stage.line,
    source,
  });
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
        const authoredInput = lines.slice(blockSource.startLine - 1, blockSource.endLine).join("\n");
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
              authoredInput,
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

function buildResultEnvelope({ runId, profile = "fresh", ok, output, error, diagnostics, channels, descriptors, anchors, sourceMaps, plan, ir, duration }) {
  const status = ok ? "succeeded" : "failed";
  const committedChannels = ok ? channels : {};
  const channelSnapshots = Object.fromEntries(Object.entries(descriptors)
    .filter(([name]) => ok && descriptors[name].persistence !== "transient" && (committedChannels[name] || descriptors[name].required))
    .map(([name, descriptor]) => [name, { descriptor, events: committedChannels[name] || [] }]));
  const semanticChannelSnapshots = Object.fromEntries(Object.entries(channelSnapshots).map(([name, snapshot]) => [
    name,
    {
      descriptor: snapshot.descriptor,
      events: snapshot.events.map((event) => withoutKeys(event, ["runId", "runRef", "eventId", "id"])),
    },
  ]));
  const semanticSeed = canonicalJson({
    status,
    source: ir?.sourceRef || null,
    output: ok ? output : "",
    channels: semanticChannelSnapshots,
    diagnostics: diagnostics.map((diagnostic) => withoutKeys(diagnostic, ["diagnosticId"])),
  });
  return {
    schema: "textabana.result/lab-v1",
    resultId: `lab:${sourceHash(semanticSeed)}`,
    run: {
      runId: `run:${runId}`,
      profile,
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
        activityId: step.activityId,
        stageId: step.stageId,
        invocationId: step.invocationId,
        function: step.function,
        orderKey: step.orderKey,
      })) : [],
      agents: [],
    },
    diagnostics,
    hashes: {
      ir: ir ? `fnv1a:${sourceHash(JSON.stringify(ir))}` : null,
      environment: "lab:web-worker:0.5-subset",
    },
    extensions: {
      "textabana.playground": {
        canonical: false,
        note: "Interaktiv Interop 0.5-subset med language-core 0.4; använd inte som full profilkonformitet.",
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
  const runProfile = "fresh";
  moduleCache.clear();
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
      profile: runProfile,
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
    const capabilities = buildCapabilities(inspection);
    const adapterRun = runAdapters(resultEnvelope, options.adapters, capabilities.implemented);
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
      adapterRun,
      capabilities,
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
      profile: runProfile,
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
    const capabilities = buildCapabilities(inspection);
    const adapterRun = runAdapters(resultEnvelope, options.adapters, capabilities.implemented);
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
      adapterRun,
      capabilities,
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath)),
      modulesLoaded: loaded.size,
      duration,
    });
  }
};
