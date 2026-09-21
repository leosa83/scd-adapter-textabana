import { materializeCacheKey } from "./execution-graph.js";
import { channelNamePattern, serializableValue, sourceHash, uniqueStrings, valueKind, valueSummary } from "./lab-values.js";
import { cancellationError } from "./runtime-errors.js";

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

function createChannelBus({ runId, runInstanceId, documentVersion, documentPath, documentId = null, documentSource, strictChannels = false, isCancelled = () => false, runControl = null }) {
  const channels = new Map();
  const descriptors = new Map();
  const anchors = new Map();
  const sourceMaps = [];
  const executionTrace = [];
  const documentLines = documentSource.split("\n");
  let sequence = 0;
  let stageSequence = 0;
  let invocationSequence = 0;

  const throwIfCancelled = () => {
    if (runControl) runControl.assertActive();
    else if (isCancelled()) throw cancellationError();
  };
  const runtimeAborted = () => runControl ? runControl.isAborted() : isCancelled();

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

  const documentResourceId = documentId || `doc:${documentPath}`;
  const anchorDocumentKey = documentId || documentPath;

  const createAnchor = ({ line, row, rowId, mode, column, endLine, execution, notebookId, cellId, setId, annotationId }) => {
    const position = positionForLine(line);
    const stablePart = annotationId
      ? `annotation:${sourceHash(anchorDocumentKey)}:${sourceHash(String(setId || "annotations"))}:${sourceHash(String(annotationId))}`
      : cellId
      ? `cell:${sourceHash(anchorDocumentKey)}:${sourceHash(String(notebookId || "notebook"))}:${sourceHash(String(cellId))}`
      : mode === "row" && rowId
        ? `row:${sourceHash(anchorDocumentKey)}:${sourceHash(String(rowId))}`
      : `line:${documentId ? `${sourceHash(documentId)}:` : ""}${documentVersion}:${line}:${column || 1}`;
    const anchorId = `anchor:${stablePart}`;
    if (!annotationId && !cellId && mode === "row" && rowId) {
      const previous = anchors.get(anchorId);
      if (previous && previous.projections.rowId !== String(rowId)) {
        const error = new Error("Distinct row IDs collide in source anchor identity.");
        error.code = "TBA-ANCHOR-COLLISION-LAB";
        throw error;
      }
    }
    const previousLine = documentLines[Math.max(0, line - 2)] || "";
    const nextLine = documentLines[line] || "";
    const anchor = {
      anchorId,
      target: {
        resourceId: documentResourceId,
        version: `fnv1a:${documentVersion}`,
        view: "source",
        ...(notebookId ? { notebookId: String(notebookId) } : {}),
        cellId: cellId ? String(cellId) : null,
        ...(setId ? { setId: String(setId) } : {}),
        ...(annotationId ? { annotationId: String(annotationId) } : {}),
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
          prefix: Array.from(previousLine).slice(-48).join(""),
          suffix: Array.from(nextLine).slice(0, 48).join(""),
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
    throwIfCancelled();
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
    runControl?.beforeChannelEvent();
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
      setId: location.setId,
      annotationId: location.annotationId,
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
      ? location.setId && location.annotationId
        ? {
            type: "AnnotationSelector",
            setId: String(location.setId),
            annotationId: String(location.annotationId),
            ...(Number.isInteger(Number(location.revision)) ? { revision: Number(location.revision) } : {}),
          }
      : location.datasetId && location.recordId
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
    const eventId = `event:${runInstanceId}:${documentVersion}:${String(sequence).padStart(4, "0")}`;
    const event = {
      schema: "textabana.event/v1",
      eventId,
      id: eventId,
      runId,
      runRef: runInstanceId,
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
        ...(location.setId ? { setId: String(location.setId) } : {}),
        ...(location.annotationId ? { annotationId: String(location.annotationId) } : {}),
        ...(Number.isInteger(Number(location.revision)) ? { revision: Number(location.revision) } : {}),
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
    runControl?.recordChannelEvent();
    return event;
  };

  return {
    declare,
    emit,
    isCancelled: runtimeAborted,
    abortReason() { return runControl?.abortReason() || (isCancelled() ? "cancelled" : null); },
    throwIfCancelled,
    checkpoint() {
      if (runControl) runControl.checkpoint();
      else throwIfCancelled();
    },
    createExecution(base) {
      invocationSequence += 1;
      const ordinal = String(invocationSequence).padStart(4, "0");
      const executionMode = base.executionMode || "fresh-transform";
      return {
        ...base,
        executionMode,
        runRef: runInstanceId,
        stageId: `stage:${runInstanceId}:${ordinal}:${base.modality || "block"}:${base.scopeId || base.functionName}:${base.stageLine}`,
        invocationId: `invocation:${runInstanceId}:${ordinal}`,
        activityId: executionMode === "cache-reuse"
          ? `activity:cache-materialization:${runInstanceId}:${ordinal}`
          : `activity:invocation:${runInstanceId}:${ordinal}`,
      };
    },
    recordStage(stage) {
      stageSequence += 1;
      const input = stage.inputSummary || valueSummary(stage.input);
      const output = stage.outputSummary || valueSummary(stage.output);
      const cachePlan = stage.execution.cachePlan;
      const cacheResolution = stage.cacheResolution || null;
      executionTrace.push({
        schema: "textabana.execution-step/lab-v2",
        runRef: stage.execution.runRef,
        step: stageSequence,
        stageId: stage.execution.stageId,
        invocationId: stage.execution.invocationId,
        activityId: stage.execution.activityId,
        planNodeRef: stage.execution.planNodeRef || null,
        function: stage.execution.functionName,
        module: stage.execution.modulePath,
        modality: stage.execution.modality,
        scopeId: stage.execution.scopeId || null,
        line: stage.execution.stageLine,
        syntaxStageRef: stage.execution.syntaxStageId || null,
        syntaxSpan: stage.execution.syntaxSpan || null,
        source: stage.execution.source,
        args: serializableValue(stage.args),
        orderKey: stage.execution.planOrderKey || [stageSequence, 1, 0],
        status: stage.status,
        executionMode: stage.execution.executionMode || "fresh-transform",
        functionInvoked: stage.functionInvoked !== false,
        input,
        output,
        cache: cachePlan ? {
          mode: cachePlan.mode || "disabled-non-editor",
          eligibility: cachePlan.eligibility,
          staticKey: cachePlan.staticKey,
          semanticKey: cacheResolution?.cache?.semanticKey
            || materializeCacheKey({ cache: cachePlan }, input.digest),
          inputDigest: cacheResolution?.cache?.inputDigest ?? null,
          cacheEntryId: cacheResolution?.cache?.cacheEntryId || null,
          outputDigest: cacheResolution?.cache?.outputDigest || null,
          evidenceRefs: cacheResolution?.cache?.evidenceRefs || [],
          evidenceRecords: cacheResolution?.cache?.evidenceRecords || [],
          read: Boolean(cacheResolution?.cache?.read),
          write: Boolean(cacheResolution?.cache?.write),
          hit: Boolean(cacheResolution?.cache?.hit),
          reused: Boolean(cacheResolution?.cache?.reused),
          lookup: cacheResolution?.lookup || "bypassed",
          reason: cacheResolution?.reason || "cache-disabled",
          evidence: cacheResolution?.cache?.evidence || 0,
          verification: cacheResolution?.cache?.verification || "unverified",
        } : null,
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

export { createChannelBus };

