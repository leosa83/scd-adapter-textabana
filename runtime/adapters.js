import { canonicalJson, sourceHash, uniqueStrings } from "./lab-values.js";
import { normalizeOperationalReferences, operationalReferenceMap } from "./result-references.js";

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
    version: "1.0.0-lab.1",
    profile: "annotation/1",
    support: "playground-subset",
    accepts: {
      resultSchemas: ["textabana.result/lab-v1"],
      profiles: ["runtime-json/1", "editor/1", "annotation/1"],
      channels: [
        { name: "annotation.set", schemaRef: "schema:textabana/annotation-set/lab-v1", required: true },
        { name: "annotation.candidates", schemaRef: "schema:textabana/annotation-candidate/lab-v1", required: true },
        { name: "annotation.reviews", schemaRef: "schema:textabana/annotation-review/lab-v1", required: true },
        { name: "annotation.revisions", schemaRef: "schema:textabana/annotation-revision/lab-v1", required: true },
      ],
      artifactKinds: [],
    },
    produces: [{
      projectionKind: "annotation-review-bundle",
      valueKind: "object",
      mediaType: "application/json",
      schemaRef: "textabana.annotation-review-projection/lab-v1",
    }],
    capabilities: {
      required: ["stable-annotation-id", "immutable-candidate", "review-revision", "anchor-target", "w3c-web-annotation", "label-studio-task-subset"],
      optional: ["w3c-prov", "model-invocation", "openlineage-export", "mlflow-export", "otel-correlation"],
    },
    fidelity: {
      mode: "selective",
      requiresSourceResult: true,
      omittedPaths: ["render", "channelSnapshots.<non-annotation>", "artifacts", "provenance.entities"],
    },
  }),
  adapterManifest({
    adapterId: "org.textabana.ml-lineage",
    version: "1.0.0-contract.1",
    profile: "ml-lineage/1",
    support: "contract-only",
    accepts: {
      resultSchemas: ["textabana.result/v1", "textabana.result/lab-v1"],
      profiles: ["runtime-json/1", "ml-lineage/1"],
      channels: [],
      artifactKinds: [],
    },
    produces: [{
      projectionKind: "ml-lineage-bundle",
      valueKind: "object",
      mediaType: "application/json",
      schemaRef: "textabana.ml-lineage/contract-v1",
    }],
    capabilities: {
      required: ["model-invocation-provenance"],
      optional: ["w3c-prov", "openlineage-export", "mlflow-export", "otel-correlation"],
    },
    fidelity: { mode: "selective", requiresSourceResult: true, omittedPaths: ["unimplemented"] },
  }),
];

const adapterCatalog = new Map(adapterManifests.map((manifest) => [manifest.adapterId, manifest]));

const playgroundImplementedCapabilities = [
  "authoritative-lezer-parser",
  "lossless-cst",
  "typed-ir-v2",
  "local-error-recovery",
  "unicode-source-spans",
  "fenced-code-literals",
  "escaped-marker-literals",
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
  "stable-annotation-id",
  "immutable-candidate",
  "review-revision",
  "anchor-target",
  "w3c-web-annotation",
  "label-studio-task-subset",
  "cooperative-cancellation",
  "editor-document-protocol",
  "version-guarded-change-sets",
  "channel-subscriptions",
  "post-commit-metadata-delta",
  "anchor-continuity",
  "editor-analysis",
  "incremental-parser-tree-reuse",
  "compiled-revision-reuse",
  "host-cache-checkpoint",
  "post-commit-metadata-stream",
  "credit-backpressure",
  "framework-neutral-typescript-sdk",
  "codemirror-binding",
  "monaco-binding",
  "python-host-client",
  "jupyter-mime-projection",
  "sha256-module-package",
  "module-lock",
  "explicit-capability-grants",
  "manifest-before-entrypoint",
  "pre-execution-plan",
  "typed-execution-graph",
  "typed-execution-edges",
  "cache-key-recipes",
  "invalidation-preview",
  "editor-session-stage-cache",
  "verified-two-observation-reuse",
  "bounded-safe-branch-concurrency",
  "cooperative-run-deadline",
  "stage-resolution-budget",
  "channel-event-budget",
  "render-byte-budget",
  "deterministic-plan-order-commit",
  "atomic-cache-commit",
  "execution-report",
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

function adapterProjectionSeed(result, manifest, output) {
  const replacements = operationalReferenceMap({
    runInstanceId: result.run?.instanceId || null,
    channelSnapshots: result.channelSnapshots || {},
    sourceMaps: result.sourceMaps || [],
    activities: result.provenance?.activities || [],
  });
  return {
    adapterId: manifest.adapterId,
    adapterVersion: manifest.version,
    manifestDigest: manifest.manifestDigest,
    sourceResultId: result.resultId,
    output: normalizeOperationalReferences(output, replacements),
  };
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
  const projectionSeed = adapterProjectionSeed(result, manifest, summary);
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
  const projectionSeed = adapterProjectionSeed(result, manifest, data);
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
  const projectionSeed = adapterProjectionSeed(result, manifest, data);
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

function buildAnnotationReviewProjection(result, manifest) {
  const snapshots = result.channelSnapshots || {};
  const setEvents = snapshots["annotation.set"]?.events || [];
  const candidateEvents = snapshots["annotation.candidates"]?.events || [];
  const reviewEvents = snapshots["annotation.reviews"]?.events || [];
  const revisionEvents = snapshots["annotation.revisions"]?.events || [];
  if (setEvents.length !== 1) throw new Error("annotation.set måste innehålla exakt en whole snapshot");
  if (!candidateEvents.length) throw new Error("annotation.candidates måste innehålla minst en modellkandidat");

  const set = setEvents[0].payload || {};
  const setId = String(set.setId || "");
  if (!setId || set.wholeSnapshot !== true) throw new Error("annotation.set måste ha stabilt setId och wholeSnapshot=true");

  const knownAnchors = new Map((result.anchors || []).map((anchor) => [anchor.anchorId, anchor]));
  const knownActivities = new Set((result.provenance?.activities || []).map((activity) => activity.activityId));
  const sourceMapByOutput = new Map((result.sourceMaps || []).map((mapping) => [mapping.outputRef, mapping]));
  const candidateById = new Map();

  const validateBinding = (event, annotationId, revision, expectedMapping) => {
    const anchor = knownAnchors.get(event.target?.anchorRef);
    const mapping = sourceMapByOutput.get(event.eventId);
    if (!anchor || !mapping || !knownActivities.has(mapping.generatingActivity)) throw new Error(`${annotationId} har en oresolverbar Anchor, SourceMap eller provenanceaktivitet`);
    if (anchor.target?.setId !== setId || anchor.target?.annotationId !== annotationId) throw new Error(`${annotationId} pekar inte på rätt annotation-anchor`);
    if (mapping.outputSelector?.type !== "AnnotationSelector" || mapping.outputSelector.setId !== setId || mapping.outputSelector.annotationId !== annotationId || mapping.outputSelector.revision !== revision) {
      throw new Error(`${annotationId} saknar matchande AnnotationSelector för revision ${revision}`);
    }
    if (expectedMapping && mapping.mapping !== expectedMapping) throw new Error(`${annotationId} måste ha ${expectedMapping} SourceMap`);
    return { anchor, mapping };
  };

  for (const event of candidateEvents) {
    const candidate = event.payload || {};
    const annotationId = String(candidate.annotationId || "");
    if (!annotationId || candidateById.has(annotationId)) throw new Error("annotation.candidates måste ha unika stabila annotationId");
    if (candidate.setId !== setId || candidate.origin !== "ai" || candidate.status !== "candidate" || candidate.revision !== 0) throw new Error(`${annotationId} är inte en immutable modellkandidat på revision 0`);
    if (Object.hasOwn(candidate, "decision") || Object.hasOwn(candidate, "reviewer") || Object.hasOwn(candidate, "supersededBy")) throw new Error(`${annotationId} blandar in mänskligt review state i modellkandidaten`);
    if (!candidate.model?.id || !candidate.model?.version || !String(candidate.model?.digest || "").startsWith("fnv1a:")) throw new Error(`${annotationId} saknar modellidentitet eller modelldigest`);
    if (!candidate.prompt?.id || !String(candidate.prompt?.digest || "").startsWith("fnv1a:")) throw new Error(`${annotationId} saknar promptidentitet eller promptdigest`);
    if (!String(candidate.inputDigest || "").startsWith("fnv1a:") || candidate.inputDigest !== candidate.bodyDigest || !String(candidate.candidateDigest || "").startsWith("fnv1a:")) throw new Error(`${annotationId} saknar matchande kandidat-, input- eller bodydigest`);
    if (!Number.isFinite(candidate.confidence?.score) || candidate.confidence.score < 0 || candidate.confidence.score > 1 || !candidate.confidence?.method) throw new Error(`${annotationId} har ogiltig confidence eller confidence method`);
    validateBinding(event, annotationId, 0, "exact");
    candidateById.set(annotationId, event);
  }

  const reviewById = new Map();
  const knownReviewIds = new Set();
  for (const event of reviewEvents) {
    const review = event.payload || {};
    const annotationId = String(review.annotationId || "");
    const candidateEvent = candidateById.get(annotationId);
    if (!candidateEvent || reviewById.has(annotationId) || !review.reviewId || knownReviewIds.has(review.reviewId)) throw new Error(`review för ${annotationId || "okänd annotation"} saknar unik review- och kandidatidentitet`);
    if (review.setId !== setId || review.revision !== 1 || !["accept", "reject", "supersede"].includes(review.decision) || !review.reviewer) throw new Error(`${annotationId} har ett ogiltigt review-event`);
    if (review.candidateEventRef !== candidateEvent.eventId || !String(review.reviewDigest || "").startsWith("fnv1a:")) throw new Error(`${annotationId} review är inte digest- och eventbundet till kandidaten`);
    const { mapping } = validateBinding(event, annotationId, 1, "derived");
    if (!mapping.inputAnchorRefs?.includes(candidateEvent.target.anchorRef)) throw new Error(`${annotationId} review saknar kandidatens input-anchor`);
    knownReviewIds.add(review.reviewId);
    reviewById.set(annotationId, event);
  }
  if (reviewById.size !== candidateById.size) throw new Error("varje modellkandidat måste ha exakt ett review-event");

  const replacementById = new Map();
  const decisionRevisionById = new Map();
  const knownRevisionIds = new Set();
  for (const event of revisionEvents) {
    const revision = event.payload || {};
    const annotationId = String(revision.annotationId || "");
    if (!annotationId || revision.setId !== setId || !revision.revisionId || knownRevisionIds.has(revision.revisionId) || !String(revision.revisionDigest || "").startsWith("fnv1a:")) throw new Error("annotation.revisions innehåller en revision utan unik identitet eller digest");
    knownRevisionIds.add(revision.revisionId);
    if (revision.origin === "human" && revision.revision === 0) {
      if (replacementById.has(annotationId) || !revision.supersedes || revision.state !== "accepted") throw new Error(`${annotationId} är inte en giltig mänsklig ersättningsrevision`);
      validateBinding(event, annotationId, 0, "exact");
      replacementById.set(annotationId, event);
      continue;
    }
    const reviewEvent = reviewById.get(annotationId);
    const candidateEvent = candidateById.get(annotationId);
    if (!reviewEvent || !candidateEvent || decisionRevisionById.has(annotationId)) throw new Error(`${annotationId} saknar en unik review-revision`);
    if (revision.origin !== "human-review" || revision.revision !== 1 || revision.reviewEventRef !== reviewEvent.eventId || revision.basedOnEventRef !== candidateEvent.eventId) throw new Error(`${annotationId} review-revision saknar append-only kedja`);
    const expectedState = { accept: "accepted", reject: "rejected", supersede: "superseded" }[reviewEvent.payload.decision];
    if (revision.state !== expectedState) throw new Error(`${annotationId} review-state matchar inte beslutet`);
    validateBinding(event, annotationId, 1, "derived");
    decisionRevisionById.set(annotationId, event);
  }
  if (decisionRevisionById.size !== candidateById.size) throw new Error("varje review måste materialiseras som en ny revision");

  for (const [annotationId, reviewEvent] of reviewById) {
    const review = reviewEvent.payload;
    if (review.decision === "supersede") {
      const replacement = replacementById.get(review.supersededBy);
      if (!replacement || replacement.payload.supersedes !== annotationId) throw new Error(`${annotationId} supersede pekar inte på en matchande ersättningsrevision`);
      const reviewMap = sourceMapByOutput.get(reviewEvent.eventId);
      if (!reviewMap.inputAnchorRefs?.includes(replacement.target.anchorRef)) throw new Error(`${annotationId} supersede saknar ersättarens input-anchor`);
    } else if (review.supersededBy) {
      throw new Error(`${annotationId} får endast ange supersededBy vid supersede`);
    }
  }
  for (const [replacementId, event] of replacementById) {
    const visited = new Set([replacementId]);
    let cursor = event.payload.supersedes;
    while (cursor) {
      if (visited.has(cursor)) throw new Error(`supersede-kedjan för ${replacementId} är cyklisk`);
      visited.add(cursor);
      cursor = replacementById.get(cursor)?.payload?.supersedes || null;
    }
  }

  const candidateOrder = candidateEvents.map((event) => event.payload.annotationId);
  const authoredOrder = Array.isArray(set.authoredOrder) ? set.authoredOrder.map(String) : [];
  const replacementOrder = authoredOrder.filter((annotationId) => replacementById.has(annotationId));
  const allAnnotationIds = [...candidateOrder, ...replacementOrder];
  const currentIds = authoredOrder.filter((annotationId) => replacementById.has(annotationId) || reviewById.get(annotationId)?.payload?.decision === "accept");
  if (canonicalJson(set.candidateIds || []) !== canonicalJson(candidateOrder) || canonicalJson(set.annotationIds || []) !== canonicalJson(allAnnotationIds)) throw new Error("annotation.set identitetslistor matchar inte committed events");
  if (canonicalJson(set.currentIds || []) !== canonicalJson(currentIds)) throw new Error("annotation.set currentIds matchar inte reviewkedjan");
  if (set.candidateCount !== candidateEvents.length || set.reviewCount !== reviewEvents.length || set.revisionCount !== revisionEvents.length) throw new Error("annotation.set counts matchar inte committed channels");

  const anchorFor = (event) => knownAnchors.get(event.target.anchorRef);
  const exportTarget = (event) => {
    const anchor = anchorFor(event);
    return {
      source: anchor.target.resourceId,
      selector: anchor.selectors,
      "textabana:anchorRef": anchor.anchorId,
      "textabana:sourceVersion": anchor.target.version,
    };
  };
  const reviewChain = candidateOrder.map((annotationId) => {
    const candidateEvent = candidateById.get(annotationId);
    const reviewEvent = reviewById.get(annotationId);
    const revisionEvent = decisionRevisionById.get(annotationId);
    const replacementEvent = reviewEvent.payload.supersededBy ? replacementById.get(reviewEvent.payload.supersededBy) : null;
    return {
      annotationId,
      candidate: { ...candidateEvent.payload, eventRef: candidateEvent.eventId, anchorRef: candidateEvent.target.anchorRef },
      review: { ...reviewEvent.payload, eventRef: reviewEvent.eventId },
      revision: { ...revisionEvent.payload, eventRef: revisionEvent.eventId },
      replacement: replacementEvent ? { ...replacementEvent.payload, eventRef: replacementEvent.eventId, anchorRef: replacementEvent.target.anchorRef } : null,
    };
  });

  const w3cItems = [];
  for (const chain of reviewChain) {
    const candidateEvent = candidateById.get(chain.annotationId);
    const candidate = candidateEvent.payload;
    w3cItems.push({
      id: `urn:textabana:${setId}:${chain.annotationId}:r1`,
      type: "Annotation",
      motivation: "assessing",
      body: [
        { type: "TextualBody", value: candidate.body, purpose: "describing" },
        { type: "TextualBody", value: chain.revision.state, purpose: "classifying" },
      ],
      target: exportTarget(candidateEvent),
      creator: { type: "Software", name: candidate.model.id, "textabana:modelVersion": candidate.model.version },
      "textabana:annotationId": chain.annotationId,
      "textabana:reviewEventRef": chain.review.eventRef,
      ...(chain.review.supersededBy ? { "textabana:supersededBy": chain.review.supersededBy } : {}),
    });
  }
  for (const annotationId of replacementOrder) {
    const event = replacementById.get(annotationId);
    w3cItems.push({
      id: `urn:textabana:${setId}:${annotationId}:r0`,
      type: "Annotation",
      motivation: "assessing",
      body: [{ type: "TextualBody", value: event.payload.body, purpose: "describing" }, { type: "TextualBody", value: "accepted", purpose: "classifying" }],
      target: exportTarget(event),
      creator: { type: "Person", name: event.payload.reviewer },
      "textabana:annotationId": annotationId,
      "textabana:supersedes": event.payload.supersedes,
    });
  }

  const labelStudioTasks = reviewChain.map((chain) => {
    const candidateEvent = candidateById.get(chain.annotationId);
    const anchor = anchorFor(candidateEvent);
    return {
      id: chain.annotationId,
      data: { text: chain.candidate.body },
      annotations: [{
        id: chain.review.reviewId,
        completed_by: chain.review.reviewer,
        result: [{
          id: chain.revision.revisionId,
          from_name: "review_state",
          to_name: "text",
          type: "choices",
          value: { choices: [chain.review.decision] },
        }],
      }],
      meta: {
        textabana: {
          setId,
          annotationId: chain.annotationId,
          candidateEventRef: chain.candidate.eventRef,
          reviewEventRef: chain.review.eventRef,
          revisionEventRef: chain.revision.eventRef,
          anchorRef: candidateEvent.target.anchorRef,
          selectors: anchor.selectors,
          ...(chain.review.supersededBy ? { supersededBy: chain.review.supersededBy } : {}),
        },
      },
    };
  });

  const consumedEvents = [...setEvents, ...candidateEvents, ...reviewEvents, ...revisionEvents];
  const eventRefs = uniqueStrings(consumedEvents.map((event) => event.eventId));
  const consumedSet = new Set(eventRefs);
  const sourceMaps = (result.sourceMaps || []).filter((mapping) => consumedSet.has(mapping.outputRef));
  const data = {
    schema: "textabana.annotation-review-projection/lab-v1",
    set: {
      setId,
      wholeSnapshot: true,
      authoredOrder,
      candidateIds: candidateOrder,
      currentIds,
      digestAlgorithm: set.digestAlgorithm,
      setDigest: set.setDigest,
    },
    reviewChain,
    currentAnnotations: currentIds.map((annotationId) => {
      const chain = reviewChain.find((item) => item.annotationId === annotationId);
      if (chain) return { annotationId, state: "accepted", body: chain.candidate.body, anchorRef: chain.candidate.anchorRef, revision: 1 };
      const replacement = replacementById.get(annotationId);
      return { annotationId, state: "accepted", body: replacement.payload.body, anchorRef: replacement.target.anchorRef, revision: 0, supersedes: replacement.payload.supersedes };
    }),
    exports: {
      w3cWebAnnotation: {
        "@context": ["http://www.w3.org/ns/anno.jsonld", { textabana: "https://textabana.dev/ns#" }],
        id: `urn:textabana:${setId}:page`,
        type: "AnnotationPage",
        items: w3cItems,
      },
      labelStudioTasks,
    },
  };
  const projectionSeed = adapterProjectionSeed(result, manifest, data);
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
      anchorRefs: uniqueStrings([...consumedEvents.map((event) => event.target?.anchorRef), ...sourceMaps.flatMap((mapping) => mapping.inputAnchorRefs || [])]),
      sourceMapRefs: uniqueStrings(sourceMaps.map((mapping) => mapping.mappingId)),
      provenanceRefs: uniqueStrings([...consumedEvents.map((event) => event.provenanceRef), ...sourceMaps.map((mapping) => mapping.generatingActivity)]),
    },
    diagnostics: [],
    extensions: {
      "textabana.playground": {
        canonical: false,
        subset: "W3C Web Annotation projection + Label Studio task/import subset",
        unsupported: ["model invocation", "W3C PROV graph", "Label Studio project/API roundtrip", "doccano/Prodigy/brat", "OpenLineage", "MLflow", "OpenTelemetry"],
      },
    },
  };
}

const adapterImplementations = new Map([
  ["org.textabana.result-summary", buildResultSummaryProjection],
  ["org.textabana.data-table", buildDataTableProjection],
  ["org.textabana.notebook", buildNotebookProjection],
  ["org.textabana.annotation-review", buildAnnotationReviewProjection],
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
  const adapterRunId = `adapter-run:${result.run.instanceId || result.run.runId}`;
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

export { adapterManifests, allCommittedEvents, playgroundImplementedCapabilities, runAdapters };

