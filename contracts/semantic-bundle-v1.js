// Authoritative schema definition. The build emits portable JSON and a CSP-safe validator.
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const str = { type: "string" };
const name = { type: "string", minLength: 1 };
const bool = { type: "boolean" };
const integer = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const positive = { ...integer, minimum: 1 };
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const list = (items, extra = {}) => ({ type: "array", items, ...extra });
const obj = (properties, required = Object.keys(properties), additionalProperties = false) => ({ type: "object", properties, required, additionalProperties });
const constant = (value) => ({ const: value });
const choice = (...values) => ({ enum: values });
const bag = { type: "object", additionalProperties: true };
const sha = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const strings = list(name);
const sourceFields = { path: name, startLine: positive, endLine: positive };
const nodeFields = { nodeId: name, kind: name, orderKey: ref("orderKey"), outputPort: ref("port") };
const stageFields = { stageId: name, kind: choice("FunctionStage", "IntervalInjectionStage"), name, args: bag, arguments: list(ref("argument")), controls: bag, line: positive, sourceSpan: ref("span"), executable: bool, stage: positive };
const irNodeFields = { nodeId: name, kind: choice("Text", "Blank", "Literal", "Property", "Block", "IntervalOpen", "IntervalClose", "IncludeDirective", "ConfigDirective", "Recovery"), sourceSpan: ref("span"), executable: bool };
const defs = {
  sha,
  orderKey: { type: "array", prefixItems: [positive, integer, integer], items: false, minItems: 3, maxItems: 3 },
  span: obj({ unit: constant("unicode-code-point"), start: integer, end: integer, startLine: positive, endLine: positive, startColumn: integer, endColumn: integer, synthetic: bool }, ["unit", "start", "end", "startLine", "endLine", "startColumn", "endColumn"]),
  sourceLocation: obj(sourceFields),
  port: obj({ name, valueKind: name }),
  diagnostic: obj({ code: name, phase: name, severity: choice("error", "warning", "info"), message: str, level: name, sourceSpan: nullable(ref("span")) }, ["message"], true),
  argument: obj({ name, value: {}, sourceSpan: ref("span") }, ["name", "value", "sourceSpan"], true),
  stage: obj(stageFields, Object.keys(stageFields).filter((key) => key !== "stage")),
  irNode: obj({ ...irNodeFields, children: list(ref("irNode")), properties: list(ref("irNode")), pipeline: list(ref("stage")), stage: ref("stage"), openSpan: ref("span"), closeSpan: nullable(ref("span")), scopeId: name, activeScopeIds: strings, activeBlockIds: strings }, Object.keys(irNodeFields), true),
  block: obj({ blockId: name, nodeId: name, name, sourceSpan: ref("span"), openSpan: ref("span"), closeSpan: nullable(ref("span")), parentBlockId: nullable(name), activeScopeIds: strings, complete: bool, executable: bool, pipeline: list(ref("stage")) }, ["blockId", "nodeId", "sourceSpan", "openSpan", "closeSpan", "parentBlockId", "activeScopeIds", "complete", "executable", "pipeline"], true),
  scope: obj({ scopeId: name, id: name, name, blockId: nullable(name), sourceSpan: ref("span"), openSpan: ref("span"), closeSpan: nullable(ref("span")), openLine: positive, closeLine: nullable(positive), complete: bool, executable: bool, segments: list(obj({ startLine: positive, endLine: positive, sourceSpan: ref("span") })) }, ["scopeId", "id", "name", "blockId", "sourceSpan", "openSpan", "closeSpan", "openLine", "closeLine", "complete", "executable", "segments"], true),
  cstNode: obj({ nodeId: name, kind: name, lexeme: str, sourceSpan: ref("span") }),
  sourceLine: obj({ line: positive, text: str, kind: name, sourceSpan: ref("span"), activeScopeIds: strings, activeBlockIds: strings, detail: bag }),
  irBody: obj({
    schema: constant("textabana.ir/lab-v2"), languageVersion: constant("0.4-playground-subset"),
    parser: obj({ schema: constant("textabana.parser/lab-v1"), engine: constant("lezer-lr"), grammarVersion: constant("0.4"), coordinateUnit: constant("unicode-code-point"), recovery: constant("local-non-executable") }),
    sourceSpan: ref("span"), validity: obj({ status: choice("valid", "recovered"), executable: bool, diagnosticCount: integer, recoveryCount: integer }),
    configuration: obj({ scopeOrder: choice("asc", "desc"), crossPolicy: constant("error") }),
    syntax: obj({
      cst: obj({ schema: constant("textabana.cst/lab-v1"), grammarVersion: constant("0.4"), sourceSpan: ref("span"), nodes: list(ref("cstNode")), lossless: constant(true) }),
      ast: obj({ schema: constant("textabana.ast/lab-v1"), grammarVersion: constant("0.4"), nodeId: name, kind: constant("Document"), sourceSpan: ref("span"), executable: bool, children: list(ref("irNode")) }),
    }),
    nodes: list(ref("irNode")), scopes: list(ref("scope")), blocks: list(ref("block")), directives: list(ref("irNode")), diagnostics: list(ref("diagnostic")), sourceLines: list(ref("sourceLine")),
  }),
  executionContract: obj({ schema: constant("textabana.function-execution-contract/lab-v2"), version: nullable(str), behavior: name, state: choice("pure", "run", "session", "external", "unknown"), determinism: choice("deterministic", "seeded", "nondeterministic", "external", "unknown"), effectsDeclared: bool, observableEffects: strings, cacheEligibility: choice("candidate", "ineligible"), cacheBlockers: strings, parallelEligibility: choice("candidate", "ineligible"), parallelBlockers: strings }),
  graphNode: { oneOf: [
    obj({ ...nodeFields, kind: constant("source"), source: ref("sourceLocation"), sourceSpan: ref("span"), valueKind: constant("text"), value: obj({ kind: constant("text"), data: str }), contentDigest: sha }),
    obj({ ...nodeFields, kind: constant("stage"), function: name, module: nullable(name), moduleDigest: sha, modality: choice("block", "interval"), args: bag, scopeId: nullable(name), syntaxStageRef: name, syntaxSpan: ref("span"), source: ref("sourceLocation"), inputPort: ref("port"), contract: ref("executionContract") }, [...Object.keys(nodeFields), "function", "module", "modality", "args", "scopeId", "syntaxStageRef", "syntaxSpan", "source", "inputPort", "contract"]),
    obj({ ...nodeFields, kind: constant("merge"), sourceSpan: ref("span"), strategy: constant("ordered-stringify-concatenate"), deterministic: constant(true), inputPorts: list(ref("port")) }),
    obj({ ...nodeFields, kind: constant("render"), mediaType: constant("text/markdown"), inputPort: ref("port") }),
  ] },
  edge: obj({ edgeId: name, kind: choice("pipeline", "interval", "interval-injection", "inheritance", "merge", "render"), from: obj({ nodeId: name, port: name }), to: obj({ nodeId: name, port: name }), orderKey: ref("orderKey") }),
  graph: obj({ schema: constant("textabana.execution-graph/lab-v1"), nodes: list(ref("graphNode"), { minItems: 1 }), edges: list(ref("edge")), entryNodeIds: strings, terminalNodeId: name }),
  origin: obj({ function: name, module: name, modality: choice("block", "interval"), stageLine: positive, scopeId: name }, ["function", "module"]),
  anchorTarget: obj({ resourceId: name, version: sha, view: constant("source"), cellId: nullable(str), notebookId: str, setId: str, annotationId: str }, ["resourceId", "version", "view", "cellId"]),
  selector: { oneOf: [obj({ type: constant("TextPositionSelector"), start: integer, end: integer, unit: constant("unicode-code-point") }), obj({ type: constant("TextQuoteSelector"), exact: str, prefix: str, suffix: str })] },
  anchor: obj({ anchorId: name, target: ref("anchorTarget"), selectors: list(ref("selector"), { minItems: 2, maxItems: 2 }), projections: bag, origin: ref("origin") }),
  eventTarget: obj({ anchorRef: name, mode: choice("line", "row"), rowSet: str, rowId: str, row: positive, line: positive, datasetId: str, recordId: str, notebookId: str, cellId: str, setId: str, annotationId: str, revision: { type: "integer" }, columnName: str, column: positive, endLine: positive }, ["anchorRef", "mode", "rowSet", "rowId", "row", "line"]),
  event: obj({ schema: constant("textabana.event/v1"), channel: name, eventId: name, sourceId: sha, sequence: positive, kind: name, phase: constant("run"), target: ref("eventTarget"), type: choice("row", "line"), row: positive, rowId: str, line: positive, column: positive, endLine: positive, payload: {}, source: obj({ ...sourceFields, mapping: choice("exact", "derived", "unknown") }), origin: ref("origin"), provenanceRef: name, state: constant("committed"), extensions: bag }, ["schema", "channel", "eventId", "sourceId", "sequence", "kind", "phase", "target", "type", "row", "rowId", "line", "payload", "source", "origin", "provenanceRef", "state", "extensions"]),
  descriptor: obj({ name, payloadKind: name, mediaType: name, schemaRef: name, delivery: constant("snapshot"), persistence: constant("durable"), ordering: name, key: strings, required: bool, sensitivity: name, declared: bool, schema: {} }, ["name", "payloadKind", "mediaType", "schemaRef", "delivery", "persistence", "ordering", "key", "required", "sensitivity", "declared"], true),
  snapshot: obj({ descriptor: ref("descriptor"), events: list(ref("event")) }),
  sourceMap: obj({ mappingId: name, outputRef: name, inputAnchorRefs: list(name, { minItems: 1 }), mapping: choice("exact", "derived", "unknown"), generatingActivity: name, outputSelector: bag, inputSelectors: list(bag) }, ["mappingId", "outputRef", "inputAnchorRefs", "mapping", "generatingActivity"]),
  source: obj({ schema: constant("textabana.semantic-source/v1"), documentId: name, path: name, contentDigest: sha }),
  context: obj({ schema: constant("textabana.semantic-context/v1"), sourceId: sha,
    modules: list(obj({ path: name, contentDigest: sha, manifest: nullable(bag) })), moduleLock: nullable(bag), capabilityGrants: strings,
    profile: constant("fresh"), strictChannels: bool,
    limits: obj({ deadlineMs: nullable({ ...positive, maximum: 60000 }), maxChannelEvents: { ...positive, maximum: 2048 }, maxParallelism: { ...positive, maximum: 8 }, maxRenderBytes: { ...positive, maximum: 1048576 }, maxStageResolutions: { ...positive, maximum: 512 } }),
    language: constant("textabana/0.4"), runtimeSemantics: constant("textabana/interop-0.7"),
  }),
  ir: obj({ schema: constant("textabana.semantic-ir/v1"), sourceId: sha, body: ref("irBody") }),
  plan: obj({ schema: constant("textabana.semantic-plan/v1"), irId: sha, contextId: sha, initializedModules: list(obj({ path: name, digest: sha })), languageVersion: constant("0.4-playground-subset"), constructionPhase: constant("post-module-init-pre-transform"), deterministic: constant(true),
    runtimePolicy: obj({ profile: constant("fresh"), scheduler: constant("bounded-deterministic-ready-set"), parallel: constant(true), parallelMode: constant("single-worker-async-overlap"), parallelEligibility: constant("pure-deterministic-effects-free-render-only"), serialBarriers: constant(["unknown-stage", "stateful-stage", "effectful-stage", "merge", "render"]), commitOrder: constant("plan-order") }), graph: ref("graph"),
  }),
  result: obj({ schema: constant("textabana.semantic-result/v1"), sourceId: sha, contextId: sha, irId: sha, planId: sha, status: constant("succeeded"), committed: constant(true), render: obj({ kind: constant("text"), mediaType: constant("text/markdown"), data: str }), channelSnapshots: { type: "object", additionalProperties: ref("snapshot") }, anchors: list(ref("anchor")), sourceMaps: list(ref("sourceMap")), artifacts: list(bag), diagnostics: list(ref("diagnostic")) }),
};
const entry = (kind) => obj({ id: sha, artifact: ref(kind) });
export const semanticBundleSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:textabana:semantic-bundle:v1",
  title: "Textabana semantic bundle v1 — structural contract",
  description: "Structure only. Digest, identity-chain, source-byte and internal-reference checks are additional required steps. Carrier detail bags, payload, args, manifests and extensions remain JSON; language execution is not certified.",
  ...obj({ schema: constant("textabana.semantic-bundle/v1"), profile: constant("textabana.semantic-artifacts/v1"), serialization: constant("RFC8785"), source: entry("source"), context: entry("context"), ir: nullable(entry("ir")), plan: nullable(entry("plan")), result: nullable(entry("result")), claims: obj({ artifactIdentity: constant("computed"), profileConformance: constant("not-evaluated"), fullRuntimeConformance: constant(false) }) }),
  $defs: defs,
};
