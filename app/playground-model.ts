export type ProjectFile = {
  path: string;
  kind: "document" | "module";
  content: string;
};

export type LabId = "language" | "editor" | "channels" | "data";

export type FunctionMeta = {
  name: string;
  modulePath: string;
  description: string;
  args: Record<string, { type?: string; default?: unknown; description?: string }>;
  accepts: string;
  returns: string;
  behavior?: string;
  outputs: string[];
  channels?: Record<string, ChannelDescriptor>;
};

export type ChannelDescriptor = {
  name: string;
  payloadKind: string;
  mediaType: string;
  schemaRef: string;
  delivery: "snapshot" | "stream" | string;
  persistence: "durable" | "transient" | string;
  ordering: string;
  key: string[];
  required: boolean;
  sensitivity: string;
  declared: boolean;
  schema?: unknown;
};

export type RuntimeAnchor = {
  anchorId: string;
  target: {
    resourceId: string;
    version: string;
    view: string;
    cellId?: string | null;
  };
  selectors: Array<Record<string, unknown>>;
  projections: {
    row: number;
    rowId: string;
    line: number;
    column?: number;
    endLine?: number;
  };
  origin: {
    stageId: string;
    invocationId?: string;
    function: string;
    module: string;
  };
};

export type ChannelEvent = {
  schema: string;
  eventId: string;
  id: string;
  runId: number;
  runRef: string;
  documentVersion: string;
  sequence: number;
  channel: string;
  kind: string;
  phase: string;
  type: string;
  row: number;
  rowId: string;
  line: number;
  column?: number;
  endLine?: number;
  target: {
    mode: string;
    anchorRef: string;
    rowSet: string;
    rowId: string;
    row: number;
    line: number;
    datasetId?: string;
    recordId?: string;
    columnName?: string;
    column?: number;
    endLine?: number;
  };
  payload: unknown;
  source: {
    path: string;
    startLine: number;
    endLine: number;
    mapping: "exact" | "derived" | "synthetic";
  };
  origin: {
    stageId: string;
    invocationId?: string;
    function: string;
    module: string;
    modality: string;
    stageLine: number;
    scopeId?: string;
  };
  provenanceRef: string;
  state: "tentative" | "committed";
};

export type ExecutionStep = {
  schema: string;
  step: number;
  stageId: string;
  invocationId: string;
  activityId: string;
  function: string;
  module: string;
  modality: "block" | "interval" | string;
  scopeId: string | null;
  line: number;
  source: { path: string; startLine: number; endLine: number };
  args: Record<string, unknown>;
  orderKey: [number, number, number];
  status: "succeeded" | "failed";
  input: { kind: string; length: number; hash: string; preview: string };
  output: { kind: string; length: number; hash: string; preview: string };
  duration: number;
  error?: string;
};

export type ScopeInspection = {
  scopeId: string;
  id: string;
  name: string;
  args: Record<string, unknown>;
  order: number;
  declarationOrder: number;
  openLine: number;
  closeLine: number | null;
  blockId: string | null;
  segments: Array<{ startLine: number; endLine: number }>;
};

export type BlockInspection = {
  blockId: string;
  name: string;
  openLine: number;
  closeLine: number | null;
  parentBlockId: string | null;
  activeScopeIds: string[];
  inherit: string;
  cross: string;
  pipeline: Array<{
    stage: number;
    name: string;
    args: Record<string, unknown>;
    controls: Record<string, unknown>;
    line: number;
  }>;
};

export type SourceLineInspection = {
  line: number;
  text: string;
  kind: string;
  activeScopeIds: string[];
  activeBlockIds: string[];
  detail: Record<string, unknown>;
};

export type RuntimeInspection = {
  schema: string;
  languageVersion: string;
  sourceRef: { documentId: string; version: string };
  configuration: { scopeOrder: string; crossPolicy: string };
  nodes: Array<Record<string, unknown>>;
  scopes: ScopeInspection[];
  blocks: BlockInspection[];
  sourceLines: SourceLineInspection[];
  unsupported: string[];
};

export type RuntimePlan = {
  schema: string;
  languageVersion: string;
  sourceRef: { documentId: string; version: string };
  deterministic: boolean;
  steps: ExecutionStep[];
  unsupported: string[];
};

export type RuntimeDiagnostic = {
  diagnosticId?: string;
  code?: string;
  severity?: string;
  level: string;
  line: number;
  message: string;
  phase?: string;
};

export type AdapterSupport = "playground-subset" | "contract-only" | "unsupported";

export type AdapterManifest = {
  schema: "textabana.adapter-manifest/lab-v1";
  adapterId: string;
  version: string;
  contract: "adapter-contract/1";
  profile: string;
  support: AdapterSupport;
  phase: "post-commit";
  execution: "pure" | string;
  accepts: {
    resultSchemas: string[];
    profiles: string[];
    channels: Array<{ name: string; schemaRef?: string; required: boolean }>;
    artifactKinds: string[];
  };
  produces: Array<{
    projectionKind: string;
    valueKind: string;
    mediaType: string;
    schemaRef: string;
  }>;
  capabilities: { required: string[]; optional: string[] };
  deterministic: boolean;
  fidelity: {
    mode: "lossless" | "selective" | "lossy";
    requiresSourceResult: boolean;
    omittedPaths: string[];
  };
  manifestDigest: string;
};

export type AdapterProjection = {
  schema: "textabana.adapter-projection/lab-v1";
  projectionId: string;
  adapterRef: {
    adapterId: string;
    version: string;
    manifestDigest: string;
  };
  sourceResultRef: {
    resultId: string;
    resultSchema: string;
    sourceVersion: string;
  };
  status: "succeeded" | "failed" | "unsupported";
  output?: {
    projectionKind: string;
    valueKind: string;
    mediaType: string;
    schemaRef: string;
    data: unknown;
    artifactRefs: string[];
  };
  mapping: "exact" | "derived" | "synthetic";
  fidelity: {
    mode: "lossless" | "selective" | "lossy";
    requiresSourceResult: boolean;
    omittedPaths: string[];
  };
  references: {
    eventRefs: string[];
    anchorRefs: string[];
    sourceMapRefs: string[];
    provenanceRefs: string[];
  };
  diagnostics: RuntimeDiagnostic[];
  extensions: Record<string, unknown>;
};

export type AdapterRun = {
  schema: "textabana.adapter-run/lab-v1";
  adapterRunId: string;
  sourceResultRef: string;
  status: "succeeded" | "partial" | "failed" | "skipped";
  requested: string[];
  manifests: AdapterManifest[];
  projections: AdapterProjection[];
  diagnostics: RuntimeDiagnostic[];
  verification: {
    beforeDigest: string;
    afterDigest: string;
    immutable: boolean;
  };
};

export type RuntimeSourceMap = {
  mappingId: string;
  outputRef: string;
  inputAnchorRefs: string[];
  mapping: "exact" | "derived" | "synthetic";
  generatingActivity: string;
  outputSelector?: {
    type: string;
    datasetId?: string;
    recordId?: string;
    column?: string;
  };
  inputSelectors?: Array<Record<string, unknown>>;
};

export type RuntimeResult = {
  runId?: number;
  ok: boolean;
  output: string;
  error?: string;
  diagnostics: RuntimeDiagnostic[];
  channels: Record<string, ChannelEvent[]>;
  channelDescriptors: Record<string, ChannelDescriptor>;
  anchors: RuntimeAnchor[];
  sourceMaps: RuntimeSourceMap[];
  inspection: RuntimeInspection | null;
  plan: RuntimePlan | null;
  executionTrace: ExecutionStep[];
  resultEnvelope: Record<string, unknown> | null;
  adapterRun: AdapterRun | null;
  capabilities: Record<string, unknown> | null;
  emissions: number;
  functions: FunctionMeta[];
  modulesLoaded: number;
  duration: number;
};

export type PlaygroundFixture = {
  id: string;
  title: string;
  summary: string;
  document: string;
};
