export type ProjectFile = {
  path: string;
  kind: "document" | "module";
  content: string;
};

export type LabId = "language" | "kernel" | "editor" | "channels" | "data" | "notebook" | "annotation" | "conformance";

export type FunctionMeta = {
  name: string;
  modulePath: string;
  moduleDigest: string;
  description: string;
  args: Record<string, { type?: string; default?: unknown; description?: string }>;
  accepts: string;
  returns: string;
  behavior?: string;
  execution: {
    schema: string;
    version: string | null;
    behavior: string;
    state: "pure" | "run" | "session" | "external" | "unknown";
    determinism: "deterministic" | "seeded" | "nondeterministic" | "external" | "unknown";
    effectsDeclared: boolean;
    observableEffects: string[];
    cacheEligibility: "candidate" | "ineligible";
    cacheBlockers: string[];
    parallelEligibility: "candidate" | "ineligible";
    parallelBlockers: string[];
  };
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
    notebookId?: string | null;
    cellId?: string | null;
    setId?: string;
    annotationId?: string;
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
    notebookId?: string;
    cellId?: string;
    setId?: string;
    annotationId?: string;
    revision?: number;
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
  runRef: string;
  step: number;
  stageId: string;
  invocationId: string;
  activityId: string;
  planNodeRef: string | null;
  function: string;
  module: string;
  modality: "block" | "interval" | string;
  scopeId: string | null;
  line: number;
  syntaxStageRef: string | null;
  syntaxSpan: SourceSpan | null;
  source: { path: string; startLine: number; endLine: number };
  args: Record<string, unknown>;
  orderKey: [number, number, number];
  status: "succeeded" | "failed" | "cancelled";
  executionMode: "fresh-transform" | "cache-reuse" | string;
  functionInvoked: boolean;
  input: { kind: string; length: number; hash: string; digest: string; preview: string };
  output: { kind: string; length: number; hash: string; digest: string; preview: string };
  cache: {
    mode: string;
    eligibility: "candidate" | "ineligible";
    staticKey: string;
    semanticKey: string;
    inputDigest: string | null;
    cacheEntryId: string | null;
    outputDigest: string | null;
    evidenceRefs: string[];
    evidenceRecords: Array<{ evidenceId: string; runRef: string; documentRevision: number; documentVersion: string; outputDigest: string }>;
    read: boolean;
    write: boolean;
    writePending: boolean;
    observationAttempted: boolean;
    hit: boolean;
    reused: boolean;
    lookup: "hit" | "miss" | "bypassed" | string;
    reason: string;
    evidence: number;
    verification: "unverified" | "probation" | "verified-by-two-observations" | "quarantined" | string;
  } | null;
  duration: number;
  error?: string;
};

export type SourceSpan = {
  start: number;
  end: number;
  unit: "unicode-code-point";
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  synthetic?: boolean;
};

export type SyntaxArgument = {
  name: string;
  value: unknown;
  valueKind: string;
  sourceSpan: SourceSpan;
};

export type SyntaxStage = {
  stageId: string;
  kind: "FunctionStage" | "IntervalInjectionStage";
  name: string;
  args: Record<string, unknown>;
  controls: Record<string, unknown>;
  arguments: SyntaxArgument[];
  line: number;
  sourceSpan: SourceSpan;
  executable: boolean;
};

type IrNodeBase = {
  nodeId: string;
  sourceSpan: SourceSpan;
  executable: boolean;
};

export type IrNode =
  | (IrNodeBase & {
      kind: "Text" | "Blank" | "Literal";
      line: number;
      text: string;
      renderText: string;
      activeScopeIds: string[];
      activeBlockIds: string[];
      detail: Record<string, unknown>;
    })
  | (IrNodeBase & {
      kind: "Property";
      line: number;
      attributes: Record<string, unknown>;
      raw: string;
      standalone: boolean;
      ownerNodeId: string | null;
    })
  | (IrNodeBase & {
      kind: "IncludeDirective";
      specifier: string;
      path: string;
      legacy: boolean;
    })
  | (IrNodeBase & {
      kind: "ConfigDirective";
      values: Record<string, unknown>;
      stage: SyntaxStage;
    })
  | (IrNodeBase & {
      kind: "IntervalOpen";
      scopeId: string;
      id: string;
      stage: SyntaxStage;
    })
  | (IrNodeBase & {
      kind: "IntervalClose";
      scopeId: string;
      id: string;
      target: string;
    })
  | (IrNodeBase & {
      kind: "Block";
      blockId: string;
      name: string;
      openSpan: SourceSpan;
      closeSpan: SourceSpan | null;
      activeScopeIds: string[];
      inherit: string;
      cross: string;
      pipeline: SyntaxStage[];
      complete: boolean;
    })
  | (IrNodeBase & {
      kind: "Recovery";
      recoveryId: string;
      recoveryKind: string;
      actual: string | null;
      expected: string | null;
      synthetic: boolean;
      detail: Record<string, unknown>;
    });

export type ScopeInspection = {
  scopeId: string;
  id: string;
  name: string;
  args: Record<string, unknown>;
  order: number;
  declarationOrder: number;
  openLine: number;
  closeLine: number | null;
  openSpan: SourceSpan;
  closeSpan: SourceSpan | null;
  sourceSpan: SourceSpan;
  blockId: string | null;
  segments: Array<{ startLine: number; endLine: number; sourceSpan: SourceSpan }>;
  complete: boolean;
};

export type BlockInspection = {
  blockId: string;
  name: string;
  nodeId: string;
  sourceSpan: SourceSpan;
  openSpan: SourceSpan;
  closeSpan: SourceSpan | null;
  openLine: number;
  headerEndLine: number;
  closeLine: number | null;
  parentBlockId: string | null;
  activeScopeIds: string[];
  inherit: string;
  cross: string;
  complete: boolean;
  executable: boolean;
  pipeline: Array<SyntaxStage & { stage: number }>;
};

export type SourceLineInspection = {
  line: number;
  text: string;
  kind: string;
  sourceSpan: SourceSpan;
  activeScopeIds: string[];
  activeBlockIds: string[];
  detail: Record<string, unknown>;
};

export type RuntimeInspection = {
  schema: string;
  languageVersion: string;
  parser: {
    schema: string;
    engine: string;
    grammarVersion: string;
    parseMode: string;
    coordinateUnit: string;
    recovery: string;
    incrementalReuse: boolean;
  };
  sourceRef: { documentId: string; version: string };
  sourceSpan: SourceSpan;
  validity: {
    status: "valid" | "recovered";
    executable: boolean;
    diagnosticCount: number;
    recoveryCount: number;
  };
  configuration: { scopeOrder: string; crossPolicy: string };
  syntax: {
    cst: {
      schema: string;
      grammarVersion: string;
      sourceSpan: SourceSpan;
      lossless: boolean;
      nodes: Array<{ nodeId: string; kind: string; lexeme: string; sourceSpan: SourceSpan }>;
    };
    ast: Record<string, unknown>;
  };
  nodes: IrNode[];
  scopes: ScopeInspection[];
  blocks: BlockInspection[];
  directives: IrNode[];
  diagnostics: RuntimeDiagnostic[];
  sourceLines: SourceLineInspection[];
  unsupported: string[];
};

export type RuntimePlan = {
  schema: "textabana.execution-plan/lab-v2" | string;
  languageVersion: string;
  sourceRef: { documentId: string; version: string };
  constructionPhase: "post-module-init-pre-transform" | string;
  deterministic: boolean;
  graph: {
    schema: "textabana.execution-graph/lab-v1" | string;
    graphId: string;
    nodes: Array<{
      nodeId: string;
      kind: "source" | "stage" | "merge" | "render" | string;
      orderKey: [number, number, number];
      sourceSpan?: SourceSpan;
      source?: { path: string; startLine: number; endLine: number };
      contentDigest?: string;
      syntaxStageRef?: string | null;
      syntaxSpan?: SourceSpan | null;
      function?: string;
      module?: string | null;
      moduleDigest?: string | null;
      modality?: string;
      scopeId?: string | null;
      args?: Record<string, unknown>;
      contract?: FunctionMeta["execution"];
      cache?: {
        mode: string;
        eligibility: "candidate" | "ineligible";
        blockers: string[];
        staticKey: string;
        ownKey: string;
        keyComponents: Record<string, string | null>;
      };
      [key: string]: unknown;
    }>;
    edges: Array<{
      edgeId: string;
      kind: "pipeline" | "interval" | "interval-injection" | "inheritance" | "merge" | "render" | string;
      from: { nodeId: string; port: string };
      to: { nodeId: string; port: string };
      orderKey: [number, number, number];
    }>;
    entryNodeIds: string[];
    terminalNodeId: string;
  };
  runtimePolicy: {
    profile: string;
    scheduler: "bounded-deterministic-ready-set" | string;
    execution: "full-concurrent-safe-branches" | "selective-concurrent-safe-branches" | string;
    cache: "disabled-non-editor" | "session-verified-two-observations" | string;
    parallel: boolean;
    parallelMode: "single-worker-async-overlap" | string;
    parallelEligibility: string;
    serialBarriers: string[];
    commitOrder: "plan-order" | string;
  };
  unsupported: string[];
};

export type InvalidationPreview = {
  schema: "textabana.invalidation-preview/lab-v1" | string;
  mode: "cold-no-baseline" | "baseline-diff" | string;
  advisory: boolean;
  basis: { documentRevision: number; documentVersion: string; graphId: string } | null;
  target: { documentVersion: string; graphId: string };
  directlyAffectedNodeIds: string[];
  transitivelyAffectedNodeIds: string[];
  unchangedNodeIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  forcedEffectNodeIds: string[];
  retainedCandidateNodeIds: string[];
  executionDisposition: { mode: "advisory" | string; plannedNodeIds: string[]; reusedNodeIds: string[] };
  cacheStats: { reads: number; writes: number; hits: number; misses: number; reused: number };
  reasons: Array<{ code: string; nodeIds: string[] }>;
};

export type ExecutionStats = {
  planned: number;
  executed: number;
  reads: number;
  hits: number;
  misses: number;
  reused: number;
  bypassed: number;
  observations: number;
  observationAttempts: number;
  verified: number;
  writes: number;
  writeAttempts: number;
  quarantined: number;
};

export type ExecutionReport = {
  schema: "textabana.execution-report/lab-v1" | string;
  mode: "editor-session-verified-cache" | "fresh-cache-disabled" | string;
  transactionState: string;
  sessionId: string | null;
  documentRevision: number | null;
  verificationPolicy: "two-distinct-committed-revisions" | string;
  nodeResolutions: Array<{
    planNodeRef: string;
    disposition: "executed" | "reused";
    functionInvoked: boolean;
    lookup: "hit" | "miss" | "bypassed" | string;
    reason: string;
    cache: {
      eligibility: "candidate" | "ineligible";
      semanticKey: string;
      inputDigest: string | null;
      cacheEntryId: string | null;
      outputDigest: string | null;
      evidenceRefs: string[];
      evidenceRecords: Array<{ evidenceId: string; runRef: string; documentRevision: number; documentVersion: string; outputDigest: string }>;
      read: boolean;
      hit: boolean;
      reused: boolean;
      write: boolean;
      writePending: boolean;
      observationAttempted: boolean;
      evidence: number;
      verification: string;
    };
  }>;
  stats: ExecutionStats;
  limits: { scope: string; maxEntries: number; maxValueBytes: number; maxTotalValueBytes: number; maxWitnessBytes: number; maxQuarantines: number; maxQuarantineBytes: number; persistent: boolean; shared: boolean };
  scheduling: {
    schema: "textabana.scheduler-report/lab-v1" | string;
    mode: "bounded-safe-branch-concurrency" | string;
    eligibility: string;
    maxConcurrency: number;
    peakConcurrency: number;
    waveCount: number;
    parallelizedNodeRefs: string[];
    barrierNodeRefs: string[];
    waves: Array<{
      waveId: string;
      mode: "concurrent" | "safe-single" | "cache-materialization" | "barrier" | string;
      nodeRefs: string[];
      freshNodeRefs: string[];
      reusedNodeRefs: string[];
      commitOrder: "plan-order" | string;
    }>;
    commitOrder: "plan-order" | string;
    hostMode: "single-worker-async-overlap" | string;
    cpuParallel: boolean;
  };
  resources: {
    schema: "textabana.resource-report/lab-v1" | string;
    requested: Record<string, number | null>;
    effective: { maxParallelism: number; maxStageResolutions: number; maxChannelEvents: number; maxRenderBytes: number; deadlineMs: number | null };
    hostCeilings: Record<string, number>;
    enforcement: Record<string, string | boolean>;
    usage: { elapsedMs: number; plannedStageResolutions: number; resolvedStageResolutions: number; freshStageInvocations: number; channelEvents: number; renderBytes: number; checkpointCount: number; peakConcurrency: number };
    status: string;
    diagnosticCode: string | null;
  };
};

export type RuntimeDiagnostic = {
  diagnosticId?: string;
  code?: string;
  severity?: string;
  level: string;
  line: number;
  message: string;
  phase?: string;
  diagnosticKey?: string;
  sourceSpan?: SourceSpan;
  recoveryNodeId?: string;
  related?: Array<{ message: string; sourceSpan: SourceSpan }>;
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

export type ConformanceStatus = "passed" | "failed" | "not-run";

export type ConformanceRequirement = {
  requirementId: string;
  status: ConformanceStatus;
  message: string;
  evidenceRefs: string[];
};

export type ConformanceProfile = {
  profile: string;
  declaredSupport: AdapterSupport;
  status: ConformanceStatus;
  derivedSupport: AdapterSupport | null;
  applicable: boolean;
  claimable: boolean;
  requirements: ConformanceRequirement[];
};

export type ConformanceReport = {
  schema: "textabana.conformance-report/lab-v1";
  reportId: string;
  sourceResultRef: string;
  suite: { suiteId: string; version: string };
  case: {
    caseId: string;
    fixtureId: string;
    expectedOutcome: "succeeded" | "failed" | "cancelled";
    actualOutcome: "succeeded" | "failed" | "cancelled";
    expectedDiagnosticCode?: string;
    registered?: boolean;
    requirements?: ConformanceRequirement[];
  };
  selectedProfiles: string[];
  profiles: ConformanceProfile[];
  stages: Array<{
    stage: "source" | "ir" | "plan" | "result" | "projection";
    status: ConformanceStatus;
    message: string;
    evidenceRefs: string[];
  }>;
  structuralSnapshot: Record<string, unknown>;
  structuralDigest: string;
  normalization?: { policy: string; ignoredPaths: string[] };
  golden?: {
    baselineId: string | null;
    expectedStructuralDigest: string | null;
    actualStructuralDigest: string;
    status: ConformanceStatus;
  };
  negativeFixtures: Array<{
    fixtureId: string;
    caseId: string;
    expectedOutcome: "failed";
    expectedDiagnosticCode: string;
    purpose: string;
  }>;
  cancellation: {
    support: "cooperative-runtime-boundary" | string;
    status: ConformanceStatus;
    requested: boolean;
    observed: boolean;
    diagnosticCode: string;
    limitation: string;
  };
  summary: {
    passed: number;
    failed: number;
    notRun: number;
    claimableProfiles: string[];
  };
  gate: {
    status: "passed" | "failed";
    blockingRequirementIds: string[];
  };
  extensions: Record<string, unknown>;
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
    notebookId?: string;
    cellId?: string;
    setId?: string;
    annotationId?: string;
    revision?: number;
    column?: string;
  };
  inputSelectors?: Array<Record<string, unknown>>;
};

export type EditorMetadataItem = {
  identity: string;
  stableIdentity: boolean;
  eventRef: string;
  channel: string;
  kind: string;
  payload: unknown;
  target: {
    mode: string;
    anchorRef: string | null;
    rowSet: string;
    rowId: string;
    row: number;
    line: number;
    column?: number;
    endLine?: number;
  };
  origin: { function: string | null; module: string | null; modality: string | null; scopeId: string | null };
};

export type EditorAnchorTransition = {
  status: "retained" | "moved" | "relinked" | "ambiguous" | "orphaned" | "added";
  method: string;
  confidence: number;
  from: Record<string, unknown> | null;
  to: Record<string, unknown> | null;
  contentChanged?: boolean;
  candidates?: Array<Record<string, unknown>>;
};

export type EditorMetadataDelta = {
  schema: "textabana.metadata-delta/lab-v1";
  documentId: string;
  cursor: string;
  basis: { documentRevision: number; documentVersion: string; resultId: string } | null;
  target: { documentRevision: number; documentVersion: string; resultId: string | null };
  state: "committed" | "failed" | "cancelled" | string;
  mode: "initial-snapshot" | "delta" | "not-committed";
  channelFilter: string[];
  collections: {
    added: EditorMetadataItem[];
    removed: EditorMetadataItem[];
    changed: Array<{ identity: string; before: EditorMetadataItem; after: EditorMetadataItem; positionChanged: boolean }>;
    moved: Array<{ identity: string; before: EditorMetadataItem; after: EditorMetadataItem }>;
    unchanged: EditorMetadataItem[];
  };
  summary: { added: number; removed: number; changed: number; moved: number; unchanged: number };
  anchorContinuity: {
    schema: "textabana.anchor-continuity/lab-v1";
    transitions: EditorAnchorTransition[];
    summary: Record<string, number>;
  };
  render: { mode: "replace" | "none"; changed: boolean };
};

export type EditorKernelRun = {
  schema: "textabana.editor-kernel-run/lab-v1";
  protocol: "textabana.editor-kernel/lab-v1";
  session?: {
    sessionId: string;
    documentId: string;
    path: string;
    documentRevision: number;
    documentVersion: string;
    publishedRevision: number | null;
    characters?: number;
  };
  evaluatedSnapshot?: {
    documentId: string;
    path: string;
    documentRevision: number;
    documentVersion: string;
  };
  run: { runId: number; status: "succeeded" | "failed" | "cancelled" | "rejected" | "stale"; committed: boolean; published?: boolean; resultId: string | null };
  change?: {
    schema: string;
    changeSetId: string;
    status: "accepted";
    baseRevision: number;
    documentRevision: number;
    coordinateUnit: "unicode-code-point";
    changes: Array<Record<string, unknown>>;
  } | null;
  subscription?: {
    subscriptionId: string;
    documentId: string;
    channels: string[];
    delivery: string;
    cursor: number;
  } | null;
  metadataDelta?: EditorMetadataDelta | null;
  deliveries?: Array<Record<string, unknown>>;
  trace?: Array<Record<string, unknown>>;
  capabilities: {
    schema: string;
    protocol: string;
    documentTransport: string;
    coordinateUnit: string;
    parseMode: string;
    parser: string;
    parserSchema: string;
    irSchema: string;
    errorRecovery: string;
    commands: string[];
    planConstruction: string;
    executionGraph: string;
    invalidationPreview: string;
    cacheMode: string;
    scheduler: string;
    executionMode: string;
    parallelMode: string;
    concurrentBranchScheduling: boolean;
    deltaMode: string;
    reanchorMode: string;
    subscriptionMode: string;
    persistentHistory: boolean;
    collaborativeMerge: boolean;
    parallelExecution: boolean;
    canonical: boolean;
  };
  limitations?: string[];
  error?: RuntimeDiagnostic;
  extensions: Record<string, unknown>;
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
  invalidationPreview: InvalidationPreview | null;
  executionTrace: ExecutionStep[];
  executionReport: ExecutionReport | null;
  executionStats: ExecutionStats;
  resultEnvelope: Record<string, unknown> | null;
  adapterRun: AdapterRun | null;
  conformanceReport: ConformanceReport | null;
  editorKernel: EditorKernelRun | null;
  capabilities: Record<string, unknown> | null;
  cancelled?: boolean;
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
  conformance?: {
    caseId: string;
    expectedOutcome: "succeeded" | "failed" | "cancelled";
    expectedDiagnosticCode?: string;
    autoCancelAfterMs?: number;
  };
};
