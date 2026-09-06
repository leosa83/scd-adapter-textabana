import { parseDocument } from "./parser.js";
import { createIdentityContext, identifyIR, identifyPlan, identifyResult } from "./semantic-identity.js";
import {
  buildInvalidationPreview,
  compileExecutionGraph,
  describeFunctionExecution,
  materializeCacheKey,
  semanticValueDigest,
} from "./execution-graph.js";
import {
  cloneParallelValue,
  createStageCacheStore,
  createStageCacheTransaction,
  exportStageCacheCheckpoint,
  finalizeStageCacheTransaction,
  importStageCacheCheckpoint,
  observeStageCache,
  recordStageResolution,
  resolveStageCache,
  snapshotCacheValue,
  snapshotParallelValue,
  snapshotStageCacheStore,
  stageCacheExecutionReport,
  stageCacheWitness,
} from "./stage-cache.js";
import {
  createRunControl,
  normalizeRunPolicy,
  rejectedRunPolicyReport,
} from "./run-policy.js";

const moduleCache = new Map();
const activeRuns = new Set();
const cancelledRuns = new Set();
const queuedRuns = new Set();
let runQueue = Promise.resolve();
let runInstanceSequence = 0;

const cancellationDiagnosticCode = "TBA-RUN-CANCELLED-LAB";

function cancellationError() {
  const error = new Error("Körningen avbröts vid en kooperativ runtimegräns.");
  error.name = "AbortError";
  error.code = cancellationDiagnosticCode;
  return error;
}

function planningError(message) {
  const error = new Error(message);
  error.name = "ExecutionPlanError";
  error.code = "TBA-PLAN-DRIFT-LAB";
  error.phase = "planning";
  return error;
}

const channelNamePattern = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

const moduleIncludePattern = /^\s*>>>>!?\s*include\s+["']([^"']+)["']\s*$/;

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

const editorDocuments = new Map();
const editorSubscriptions = new Map();
const editorParseCache = new Map();
let editorSessionSequence = 0;

function parseCacheKey(sessionId, documentVersion) {
  return `${sessionId}\u0000${documentVersion}`;
}

function codePointToCodeUnit(source, offset) {
  return Array.from(source).slice(0, offset).join("").length;
}

function parseEditorSnapshot(snapshot) {
  const key = parseCacheKey(snapshot.sessionId, snapshot.documentVersion);
  const exact = editorParseCache.get(key);
  if (exact) return { parsed: exact.parsed, reuse: "compiled-snapshot" };
  const change = snapshot.lastChange;
  const previous = change?.baseDocumentVersion
    ? editorParseCache.get(parseCacheKey(snapshot.sessionId, change.baseDocumentVersion))
    : null;
  const parsed = parseDocument(snapshot.source, {
    documentPath: snapshot.path,
    documentId: snapshot.documentId,
    previousTree: previous?.parsed?.tree || null,
    changes: change?.parserChanges || [],
  });
  editorParseCache.set(key, { parsed });
  if (editorParseCache.size > 32) editorParseCache.delete(editorParseCache.keys().next().value);
  return { parsed, reuse: parsed.ir.parser.incrementalReuse ? "incremental-tree" : "fresh" };
}

function editorProtocolError(code, message, details = {}) {
  const error = new Error(message);
  error.name = "EditorProtocolError";
  error.code = code;
  error.details = details;
  return error;
}

function editorProtocolCapabilities() {
  return {
    schema: "textabana.editor-kernel-capabilities/lab-v1",
    protocol: "textabana.editor-kernel/lab-v1",
    documentTransport: "versioned-change-set",
    coordinateUnit: "unicode-code-point",
    parseMode: "incremental-tree-or-full-document",
    parser: "lezer-lr",
    parserSchema: "textabana.parser/lab-v1",
    irSchema: "textabana.ir/lab-v2",
    errorRecovery: "local-non-executable",
    commands: ["open", "change", "analyze", "subscribe", "credit", "cache-export", "cache-import", "run", "cancel"],
    planConstruction: "post-module-init-pre-transform",
    executionGraph: "textabana.execution-graph/lab-v1",
    invalidationPreview: "advisory-baseline-diff",
    cacheMode: "editor-session-verified-two-observations",
    scheduler: "bounded-deterministic-ready-set",
    executionMode: "selective-concurrent-safe-branches",
    parallelMode: "single-worker-async-overlap",
    concurrentBranchScheduling: true,
    deltaMode: "post-commit-diff",
    reanchorMode: "stable-anchor-id-then-unique-quote-origin",
    subscriptionMode: "exact-channel-or-all",
    streamMode: "post-commit-credit-bounded-metadata",
    persistentHistory: "host-checkpoint",
    collaborativeMerge: false,
    parallelExecution: true,
    canonical: false,
  };
}

function editorDocumentSnapshot(document) {
  return {
    schema: "textabana.document-snapshot/lab-v1",
    sessionId: document.sessionId,
    documentId: document.documentId,
    path: document.path,
    documentRevision: document.revision,
    documentVersion: document.sourceVersion,
    publishedRevision: document.publishedRevision,
    characters: Array.from(document.source).length,
  };
}

function readEditorDocument(documentId) {
  const document = editorDocuments.get(String(documentId || ""));
  if (!document) {
    throw editorProtocolError("TBA-EDITOR-DOCUMENT-NOT-OPEN-LAB", `Dokumentet “${documentId || ""}” är inte öppnat i Editor Kernel.`);
  }
  return document;
}

function openEditorDocument(payload) {
  const input = payload.document && typeof payload.document === "object" ? payload.document : payload;
  const documentId = String(input.documentId || input.id || "").trim();
  const path = String(input.path || "document.md").trim();
  if (!documentId) throw editorProtocolError("TBA-EDITOR-DOCUMENT-ID-LAB", "open kräver documentId.");
  if (!path) throw editorProtocolError("TBA-EDITOR-DOCUMENT-PATH-LAB", "open kräver en documentsökväg.");
  const source = String(input.source ?? input.text ?? "");
  const revision = Number(input.documentRevision ?? input.revision ?? 1);
  if (revision !== 1) throw editorProtocolError("TBA-EDITOR-REVISION-LAB", "En ny documentsession måste öppnas på revision 1.");
  const sourceVersion = `fnv1a:${sourceHash(source)}`;
  const existing = editorDocuments.get(documentId);
  const replaceSession = Boolean(payload.replaceSession ?? input.replaceSession ?? false);
  if (!replaceSession && existing && existing.path === path && existing.source === source) {
    return { status: "unchanged", document: editorDocumentSnapshot(existing) };
  }
  for (const [subscriptionId, subscription] of editorSubscriptions) {
    if (subscription.documentId === documentId) editorSubscriptions.delete(subscriptionId);
  }
  if (existing) {
    for (const key of editorParseCache.keys()) if (key.startsWith(`${existing.sessionId}\u0000`)) editorParseCache.delete(key);
  }
  editorSessionSequence += 1;
  const sessionId = `editor-session:${sourceHash(documentId)}:${editorSessionSequence}`;
  const document = {
    sessionId,
    documentId,
    path,
    source,
    revision: 1,
    sourceVersion,
    publishedRevision: null,
    lastChange: null,
    planBaseline: null,
    stageCache: createStageCacheStore(sessionId),
  };
  editorDocuments.set(documentId, document);
  return { status: existing ? "replaced" : "opened", document: editorDocumentSnapshot(document) };
}

function normalizeEditorChanges(document, rawChanges) {
  if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
    throw editorProtocolError("TBA-EDITOR-CHANGESET-EMPTY-LAB", "change kräver minst en textändring.");
  }
  const length = Array.from(document.source).length;
  const changes = rawChanges.map((raw, index) => {
    const range = raw?.range && typeof raw.range === "object" ? raw.range : raw || {};
    const from = Number(range.from ?? range.start);
    const to = Number(range.to ?? range.end);
    const insert = String(raw?.insert ?? raw?.text ?? "");
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > length) {
      throw editorProtocolError(
        "TBA-EDITOR-RANGE-LAB",
        `Change ${index + 1} har ett ogiltigt halvöppet Unicode-intervall [${from}, ${to}) för dokumentlängd ${length}.`,
        { index, from, to, documentLength: length },
      );
    }
    return { from, to, insert, inputIndex: index };
  });
  for (let index = 1; index < changes.length; index += 1) {
    const previous = changes[index - 1];
    const current = changes[index];
    if (current.from < previous.from) {
      throw editorProtocolError("TBA-EDITOR-CHANGESET-ORDER-LAB", "ChangeSet-ranges måste vara sorterade i stigande ordning.");
    }
    if (current.from < previous.to || current.from === previous.from) {
      throw editorProtocolError("TBA-EDITOR-CHANGESET-OVERLAP-LAB", "ChangeSet-ranges får inte överlappa eller börja på samma position.");
    }
  }
  return changes;
}

function applyEditorChange(payload) {
  const document = readEditorDocument(payload.documentId);
  const coordinateUnit = payload.coordinateUnit == null ? "unicode-code-point" : String(payload.coordinateUnit);
  if (coordinateUnit !== "unicode-code-point") {
    throw editorProtocolError(
      "TBA-EDITOR-COORDINATE-UNIT-LAB",
      `Editor Kernel accepterar endast coordinateUnit “unicode-code-point”; fick “${coordinateUnit}”. Ingen text ändrades.`,
      { expectedCoordinateUnit: "unicode-code-point", receivedCoordinateUnit: coordinateUnit },
    );
  }
  const baseRevision = Number(payload.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision !== document.revision) {
    throw editorProtocolError(
      "TBA-EDITOR-STALE-REVISION-LAB",
      `ChangeSet bygger på revision ${payload.baseRevision ?? "–"}, men documentsessionen står på revision ${document.revision}. Ingen text ändrades.`,
      { expectedRevision: document.revision, receivedRevision: payload.baseRevision ?? null },
    );
  }
  if (payload.baseDocumentVersion && payload.baseDocumentVersion !== document.sourceVersion) {
    throw editorProtocolError(
      "TBA-EDITOR-STALE-VERSION-LAB",
      "ChangeSetets baseDocumentVersion matchar inte documentsessionens aktuella innehåll. Ingen text ändrades.",
      { expectedVersion: document.sourceVersion, receivedVersion: payload.baseDocumentVersion },
    );
  }
  const changes = normalizeEditorChanges(document, payload.changes);
  const previousSource = document.source;
  const codePoints = Array.from(document.source);
  const applied = changes.map((change) => ({
    from: change.from,
    to: change.to,
    insert: change.insert,
    removed: codePoints.slice(change.from, change.to).join(""),
  }));
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    codePoints.splice(change.from, change.to - change.from, ...Array.from(change.insert));
  }
  const nextSource = codePoints.join("");
  if (nextSource === document.source) {
    return { status: "unchanged", document: editorDocumentSnapshot(document), change: null };
  }
  const previousVersion = document.sourceVersion;
  document.source = nextSource;
  document.revision += 1;
  document.sourceVersion = `fnv1a:${sourceHash(nextSource)}`;
  document.lastChange = {
    schema: "textabana.change-set-result/lab-v1",
    changeSetId: String(payload.changeSetId || `change:${sourceHash(`${document.documentId}:${document.revision}:${document.sourceVersion}`)}`),
    status: "accepted",
    documentId: document.documentId,
    coordinateUnit: "unicode-code-point",
    baseRevision,
    documentRevision: document.revision,
    baseDocumentVersion: previousVersion,
    documentVersion: document.sourceVersion,
    changes: applied.map((change) => ({
      range: { from: change.from, to: change.to },
      insertedCharacters: Array.from(change.insert).length,
      removedCharacters: change.to - change.from,
      insertDigest: `fnv1a:${sourceHash(change.insert)}`,
      removedDigest: `fnv1a:${sourceHash(change.removed)}`,
    })),
    parserChanges: applied.map((change, index) => {
      const priorInserted = applied.slice(0, index).reduce((sum, item) => sum + item.insert.length - item.removed.length, 0);
      const fromA = codePointToCodeUnit(previousSource, change.from);
      const toA = codePointToCodeUnit(previousSource, change.to);
      const fromB = fromA + priorInserted;
      return { fromA, toA, fromB, toB: fromB + change.insert.length };
    }),
  };
  return {
    status: "accepted",
    document: editorDocumentSnapshot(document),
    change: serializableValue(document.lastChange),
  };
}

function subscribeEditorDocument(payload) {
  const document = readEditorDocument(payload.documentId);
  const rawChannels = Array.isArray(payload.channels) && payload.channels.length ? payload.channels : ["*"];
  const channels = [...new Set(rawChannels.map((name) => String(name).trim()))];
  for (const channel of channels) {
    if (channel !== "*" && !channelNamePattern.test(channel)) {
      throw editorProtocolError("TBA-EDITOR-SUBSCRIPTION-LAB", `Ogiltigt kanalfilter “${channel}”.`);
    }
  }
  const subscriptionId = String(payload.subscriptionId || `subscription:${sourceHash(`${document.documentId}:${channels.join("|")}`)}`);
  const delivery = String(payload.delivery || "snapshot-then-delta");
  if (!["snapshot-then-delta", "stream"].includes(delivery)) throw editorProtocolError("TBA-EDITOR-DELIVERY-LAB", `Ogiltigt delivery-läge “${delivery}”.`);
  const initialCredit = Number(payload.initialCredit ?? (delivery === "stream" ? 0 : 1));
  if (!Number.isInteger(initialCredit) || initialCredit < 0 || initialCredit > 1024) throw editorProtocolError("TBA-EDITOR-CREDIT-LAB", "initialCredit måste vara ett heltal mellan 0 och 1024.");
  const subscription = {
    schema: "textabana.editor-subscription/lab-v1",
    subscriptionId,
    sessionId: document.sessionId,
    documentId: document.documentId,
    channels,
    delivery,
    credit: initialCredit,
    queue: [],
    cursor: 0,
    baseline: null,
  };
  editorSubscriptions.set(subscriptionId, subscription);
  return {
    status: "subscribed",
    subscription: withoutKeys(subscription, ["baseline", "queue"]),
    document: editorDocumentSnapshot(document),
  };
}

function flushEditorSubscription(subscription) {
  let delivered = 0;
  while (subscription.credit > 0 && subscription.queue.length) {
    const chunk = subscription.queue.shift();
    subscription.credit -= 1;
    delivered += 1;
    self.postMessage({ type: "metadata-chunk", schema: "textabana.metadata-stream/lab-v1", subscriptionId: subscription.subscriptionId, ...chunk });
  }
  return delivered;
}

function creditEditorSubscription(payload) {
  const subscription = editorSubscriptions.get(String(payload.subscriptionId || ""));
  if (!subscription) throw editorProtocolError("TBA-EDITOR-SUBSCRIPTION-NOT-FOUND-LAB", "credit refererar en okänd subscription.");
  const credit = Number(payload.credit);
  if (!Number.isInteger(credit) || credit <= 0 || credit > 1024) throw editorProtocolError("TBA-EDITOR-CREDIT-LAB", "credit måste vara ett heltal mellan 1 och 1024.");
  subscription.credit = Math.min(1024, subscription.credit + credit);
  const delivered = flushEditorSubscription(subscription);
  return { status: "credited", delivered, pending: subscription.queue.length, subscription: withoutKeys(subscription, ["baseline", "queue"]) };
}

function enqueueEditorDelta(subscription, delta) {
  if (subscription.delivery !== "stream") return;
  const chunks = [];
  for (const [collection, values] of Object.entries(delta.collections)) {
    values.forEach((value) => chunks.push({ cursor: delta.cursor, collection, value }));
  }
  chunks.forEach((chunk, index) => subscription.queue.push({ ...chunk, sequence: index + 1, total: chunks.length, done: index + 1 === chunks.length }));
  flushEditorSubscription(subscription);
}

function exportEditorCache(payload) {
  const document = readEditorDocument(payload.documentId);
  return { status: "exported", document: editorDocumentSnapshot(document), checkpoint: exportStageCacheCheckpoint(document.stageCache) };
}

function importEditorCache(payload) {
  const document = readEditorDocument(payload.documentId);
  if (activeRuns.size || queuedRuns.size) throw editorProtocolError("TBA-EDITOR-CACHE-BUSY-LAB", "Cachecheckpoint kan bara importeras när inga körningar är aktiva eller köade.");
  try {
    document.stageCache = importStageCacheCheckpoint(payload.checkpoint, document.sessionId);
  } catch (error) {
    throw editorProtocolError("TBA-EDITOR-CACHE-CHECKPOINT-LAB", error instanceof Error ? error.message : String(error));
  }
  return { status: "imported", document: editorDocumentSnapshot(document), cacheVersion: document.stageCache.version };
}

function captureEditorRun(payload) {
  const document = readEditorDocument(payload.documentId);
  const expectedRevision = Number(payload.documentRevision ?? payload.revision);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== document.revision) {
    throw editorProtocolError(
      "TBA-EDITOR-RUN-REVISION-LAB",
      `run begärde revision ${payload.documentRevision ?? payload.revision ?? "–"}, men documentsessionens head är revision ${document.revision}.`,
      { expectedRevision: document.revision, receivedRevision: payload.documentRevision ?? payload.revision ?? null },
    );
  }
  return {
    sessionId: document.sessionId,
    documentId: document.documentId,
    path: document.path,
    source: document.source,
    documentRevision: document.revision,
    documentVersion: document.sourceVersion,
    previousPublishedRevision: document.publishedRevision,
    lastChange: serializableValue(document.lastChange),
    previousPlanBaseline: serializableValue(document.planBaseline),
    stageCacheBaseline: snapshotStageCacheStore(document.stageCache),
    subscriptionIds: [...editorSubscriptions.values()]
      .filter((subscription) => subscription.documentId === document.documentId && subscription.sessionId === document.sessionId)
      .map((subscription) => subscription.subscriptionId),
  };
}

function analyzeEditorDocument(payload) {
  const document = readEditorDocument(payload.documentId);
  const receivedRevision = payload.documentRevision ?? payload.revision;
  if (receivedRevision !== undefined && Number(receivedRevision) !== document.revision) {
    throw editorProtocolError(
      "TBA-EDITOR-ANALYZE-REVISION-LAB",
      `analyze begärde revision ${receivedRevision}, men documentsessionens head är revision ${document.revision}.`,
      { expectedRevision: document.revision, receivedRevision },
    );
  }
  const { parsed, reuse } = parseEditorSnapshot({
    sessionId: document.sessionId,
    documentId: document.documentId,
    path: document.path,
    source: document.source,
    documentRevision: document.revision,
    documentVersion: document.sourceVersion,
    lastChange: document.lastChange,
  });
  return {
    status: parsed.executable ? "valid" : "recovered",
    document: editorDocumentSnapshot(document),
    analysis: {
      schema: "textabana.editor-analysis/lab-v1",
      documentRevision: document.revision,
      documentVersion: document.sourceVersion,
      executable: parsed.executable,
      inspection: parsed.ir,
      diagnostics: parsed.diagnostics,
      reuse,
    },
  };
}

function pathValue(value, path) {
  return String(path || "").split(".").filter(Boolean).reduce((current, part) => current?.[part], value);
}

function selectedEditorEvents(result, channels) {
  const includeAll = channels.includes("*");
  return Object.entries(result.channels || {})
    .filter(([name]) => includeAll || channels.includes(name))
    .flatMap(([, events]) => events || []);
}

function eventLogicalIdentity(event, descriptors) {
  const descriptor = descriptors?.[event.channel];
  const declaredPaths = descriptor?.key || [];
  if (declaredPaths.length) {
    const declared = declaredPaths.map((path) => ({ path, value: pathValue(event, path) }));
    return {
      logicalKey: canonicalJson({ channel: event.channel, descriptorKey: declared }),
      stable: declared.every(({ value }) => value !== undefined && value !== null && value !== ""),
    };
  }
  const target = event.target || {};
  const domainKey = target.annotationId
    ? { type: "annotation", setId: target.setId || "annotations", annotationId: target.annotationId }
    : target.cellId
      ? { type: "cell", notebookId: target.notebookId || "notebook", cellId: target.cellId }
      : target.recordId
        ? { type: "record", datasetId: target.datasetId || "dataset", recordId: target.recordId, columnName: target.columnName || null }
        : (target.rowId || event.rowId)
          ? { type: "row", rowSet: target.rowSet || "document", rowId: target.rowId || event.rowId }
          : null;
  return {
    logicalKey: canonicalJson({ channel: event.channel, domainKey }),
    stable: Boolean(domainKey),
  };
}

function indexedEditorEvents(events, descriptors) {
  const groups = new Map();
  for (const event of events) {
    const identity = eventLogicalIdentity(event, descriptors);
    if (!groups.has(identity.logicalKey)) groups.set(identity.logicalKey, { events: [], stable: identity.stable });
    const group = groups.get(identity.logicalKey);
    group.events.push(event);
    group.stable = group.stable && identity.stable;
  }
  const index = new Map();
  for (const [logicalKey, group] of groups) {
    if (group.events.length === 1) {
      index.set(logicalKey, { identity: `metadata:${sourceHash(logicalKey)}`, logicalKey, event: group.events[0], stable: group.stable });
      continue;
    }
    for (const event of group.events) {
      const fallback = canonicalJson({ logicalKey, payload: event.payload, line: event.line, sequence: event.sequence });
      index.set(`${logicalKey}#${event.sequence}`, {
        identity: `metadata:duplicate:${sourceHash(fallback)}`,
        logicalKey: `${logicalKey}#${event.sequence}`,
        event,
        stable: false,
      });
    }
  }
  return index;
}

function editorEventSummary(indexed) {
  const event = indexed.event;
  return {
    identity: indexed.identity,
    stableIdentity: indexed.stable,
    eventRef: event.eventId,
    channel: event.channel,
    kind: event.kind,
    payload: event.payload,
    target: {
      mode: event.target?.mode || event.type,
      anchorRef: event.target?.anchorRef || null,
      rowSet: event.target?.rowSet || "document",
      rowId: event.target?.rowId || event.rowId,
      row: event.target?.row ?? event.row,
      line: event.target?.line ?? event.line,
      ...(event.target?.column ? { column: event.target.column } : {}),
      ...(event.target?.endLine ? { endLine: event.target.endLine } : {}),
    },
    origin: {
      function: event.origin?.function || null,
      module: event.origin?.module || null,
      modality: event.origin?.modality || null,
      scopeId: event.origin?.scopeId || null,
    },
  };
}

function editorSemanticValue(event) {
  return canonicalJson({
    channel: event.channel,
    kind: event.kind,
    payload: event.payload,
    mapping: event.source?.mapping || null,
    target: {
      mode: event.target?.mode || event.type,
      rowSet: event.target?.rowSet || null,
      datasetId: event.target?.datasetId || null,
      recordId: event.target?.recordId || null,
      notebookId: event.target?.notebookId || null,
      cellId: event.target?.cellId || null,
      setId: event.target?.setId || null,
      annotationId: event.target?.annotationId || null,
      annotationRevision: event.target?.revision ?? null,
      columnName: event.target?.columnName || null,
    },
    origin: {
      function: event.origin?.function || null,
      module: event.origin?.module || null,
      modality: event.origin?.modality || null,
      scopeId: event.origin?.scopeId || null,
    },
  });
}

function editorPlacementValue(event) {
  return canonicalJson({
    row: event.target?.row ?? event.row,
    line: event.target?.line ?? event.line,
    column: event.target?.column ?? event.column ?? null,
    endLine: event.target?.endLine ?? event.endLine ?? null,
  });
}

function anchorQuote(anchor) {
  return anchor?.selectors?.find((selector) => selector.type === "TextQuoteSelector") || null;
}

function anchorPosition(anchor) {
  return anchor?.selectors?.find((selector) => selector.type === "TextPositionSelector") || null;
}

function editorAnchorSummary(anchor) {
  return {
    anchorRef: anchor.anchorId,
    targetVersion: anchor.target?.version || null,
    line: anchor.projections?.line ?? null,
    row: anchor.projections?.row ?? null,
    rowId: anchor.projections?.rowId ?? null,
    quote: anchorQuote(anchor)?.exact ?? null,
    position: anchorPosition(anchor),
    origin: anchor.origin,
  };
}

function editorAnchorContinuity(previous, current, previousEvents, currentEvents) {
  const refs = (events) => new Set(events.map((event) => event.target?.anchorRef).filter(Boolean));
  const previousRefs = refs(previousEvents);
  const currentRefs = refs(currentEvents);
  const previousAnchors = new Map((previous?.anchors || []).filter((anchor) => previousRefs.has(anchor.anchorId)).map((anchor) => [anchor.anchorId, anchor]));
  const currentAnchors = new Map((current?.anchors || []).filter((anchor) => currentRefs.has(anchor.anchorId)).map((anchor) => [anchor.anchorId, anchor]));
  const usedCurrent = new Set();
  const transitions = [];

  for (const [anchorId, before] of previousAnchors) {
    const after = currentAnchors.get(anchorId);
    if (!after) continue;
    usedCurrent.add(anchorId);
    const moved = before.projections?.line !== after.projections?.line
      || before.projections?.row !== after.projections?.row
      || anchorPosition(before)?.start !== anchorPosition(after)?.start;
    transitions.push({
      status: moved ? "moved" : "retained",
      method: "stable-anchor-id",
      confidence: 1,
      from: editorAnchorSummary(before),
      to: editorAnchorSummary(after),
      contentChanged: anchorQuote(before)?.exact !== anchorQuote(after)?.exact,
    });
  }

  const unmatchedCurrent = [...currentAnchors.values()].filter((anchor) => !usedCurrent.has(anchor.anchorId));
  for (const [anchorId, before] of previousAnchors) {
    if (currentAnchors.has(anchorId)) continue;
    const quote = anchorQuote(before)?.exact;
    const candidates = quote ? unmatchedCurrent.filter((after) => (
      !usedCurrent.has(after.anchorId)
      && anchorQuote(after)?.exact === quote
      && after.origin?.function === before.origin?.function
      && after.origin?.module === before.origin?.module
    )) : [];
    if (candidates.length === 1) {
      const after = candidates[0];
      usedCurrent.add(after.anchorId);
      transitions.push({
        status: "relinked",
        method: "unique-text-quote+origin",
        confidence: 0.8,
        from: editorAnchorSummary(before),
        to: editorAnchorSummary(after),
      });
    } else if (candidates.length > 1) {
      transitions.push({
        status: "ambiguous",
        method: "text-quote+origin",
        confidence: 0,
        from: editorAnchorSummary(before),
        to: null,
        candidates: candidates.map(editorAnchorSummary),
      });
    } else {
      transitions.push({
        status: "orphaned",
        method: "no-unique-match",
        confidence: 0,
        from: editorAnchorSummary(before),
        to: null,
      });
    }
  }
  for (const after of currentAnchors.values()) {
    if (usedCurrent.has(after.anchorId)) continue;
    transitions.push({ status: "added", method: "new-anchor", confidence: 1, from: null, to: editorAnchorSummary(after) });
  }
  const statuses = ["retained", "moved", "relinked", "ambiguous", "orphaned", "added"];
  return {
    schema: "textabana.anchor-continuity/lab-v1",
    transitions,
    summary: Object.fromEntries(statuses.map((status) => [status, transitions.filter((item) => item.status === status).length])),
  };
}

function buildEditorMetadataDelta({ documentId, fromRevision, toRevision, previous, current, channels, cursor }) {
  const beforeEvents = previous ? selectedEditorEvents(previous, channels) : [];
  const afterEvents = selectedEditorEvents(current, channels);
  const beforeIndex = indexedEditorEvents(beforeEvents, previous?.channelDescriptors || {});
  const afterIndex = indexedEditorEvents(afterEvents, current.channelDescriptors || {});
  const collections = { added: [], removed: [], changed: [], moved: [], unchanged: [] };

  for (const [key, after] of afterIndex) {
    const before = beforeIndex.get(key);
    if (!before || !after.stable || !before.stable) {
      collections.added.push(editorEventSummary(after));
      continue;
    }
    const beforeSummary = editorEventSummary(before);
    const afterSummary = editorEventSummary(after);
    const semanticChanged = editorSemanticValue(before.event) !== editorSemanticValue(after.event);
    const positionChanged = editorPlacementValue(before.event) !== editorPlacementValue(after.event);
    if (semanticChanged) {
      collections.changed.push({ identity: after.identity, before: beforeSummary, after: afterSummary, positionChanged });
    } else if (positionChanged) {
      collections.moved.push({ identity: after.identity, before: beforeSummary, after: afterSummary });
    } else {
      collections.unchanged.push(afterSummary);
    }
  }
  for (const [key, before] of beforeIndex) {
    const after = afterIndex.get(key);
    if (!after || !before.stable || !after.stable) collections.removed.push(editorEventSummary(before));
  }
  const anchorContinuity = editorAnchorContinuity(previous, current, beforeEvents, afterEvents);
  return {
    schema: "textabana.metadata-delta/lab-v1",
    documentId,
    cursor: `cursor:${cursor}`,
    basis: previous ? {
      documentRevision: fromRevision,
      documentVersion: previous.documentVersion,
      resultId: previous.resultId,
    } : null,
    target: {
      documentRevision: toRevision,
      documentVersion: current.documentVersion,
      resultId: current.resultId,
    },
    state: "committed",
    mode: previous ? "delta" : "initial-snapshot",
    channelFilter: channels,
    collections,
    summary: Object.fromEntries(Object.entries(collections).map(([name, values]) => [name, values.length])),
    anchorContinuity,
    render: { mode: "replace", changed: !previous || previous.output !== current.output },
  };
}

function emptyEditorDelta(snapshot, subscription, status, result) {
  const empty = { added: [], removed: [], changed: [], moved: [], unchanged: [] };
  return {
    schema: "textabana.metadata-delta/lab-v1",
    documentId: snapshot.documentId,
    cursor: `cursor:${subscription.cursor}`,
    basis: subscription.baseline ? {
      documentRevision: subscription.baseline.documentRevision,
      documentVersion: subscription.baseline.documentVersion,
      resultId: subscription.baseline.resultId,
    } : null,
    target: {
      documentRevision: snapshot.documentRevision,
      documentVersion: snapshot.documentVersion,
      resultId: result.resultEnvelope?.resultId || null,
    },
    state: status,
    mode: "not-committed",
    channelFilter: subscription.channels,
    collections: empty,
    summary: { added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0 },
    anchorContinuity: {
      schema: "textabana.anchor-continuity/lab-v1",
      transitions: [],
      summary: { retained: 0, moved: 0, relinked: 0, ambiguous: 0, orphaned: 0, added: 0 },
    },
    render: { mode: "none", changed: false },
  };
}

function completeEditorRun(snapshot, result, cacheTransaction = null) {
  const coreCommitted = result.ok === true && result.resultEnvelope?.run?.committed === true;
  const document = editorDocuments.get(snapshot.documentId);
  const headMatches = Boolean(document
    && document.sessionId === snapshot.sessionId
    && document.revision === snapshot.documentRevision);
  const published = coreCommitted && headMatches;
  const postCommitAccepted = result.adapterRun?.verification?.immutable === true
    && result.conformanceReport?.gate?.status === "passed";
  const cacheAccepted = published && postCommitAccepted;
  const deliveries = [];
  const subscriptionUpdates = [];
  for (const subscriptionId of snapshot.subscriptionIds) {
    const subscription = editorSubscriptions.get(subscriptionId);
    if (!subscription || subscription.sessionId !== snapshot.sessionId) continue;
    if (!published) {
      deliveries.push({
        subscription: withoutKeys(subscription, ["baseline", "queue"]),
        delta: emptyEditorDelta(
          snapshot,
          subscription,
          result.cancelled ? "cancelled" : coreCommitted ? "stale-head" : "failed",
          result,
        ),
      });
      continue;
    }
    const nextSubscription = {
      ...subscription,
      cursor: subscription.cursor + 1,
    };
    const current = {
      documentRevision: snapshot.documentRevision,
      documentVersion: snapshot.documentVersion,
      resultId: result.resultEnvelope.resultId,
      output: result.output,
      channels: serializableValue(result.channels || {}),
      channelDescriptors: serializableValue(result.channelDescriptors || {}),
      anchors: serializableValue(result.anchors || []),
    };
    const previous = subscription.baseline;
    const delta = buildEditorMetadataDelta({
      documentId: snapshot.documentId,
      fromRevision: previous?.documentRevision ?? null,
      toRevision: snapshot.documentRevision,
      previous,
      current,
      channels: subscription.channels,
      cursor: nextSubscription.cursor,
    });
    nextSubscription.baseline = current;
    subscriptionUpdates.push([subscriptionId, nextSubscription]);
    enqueueEditorDelta(nextSubscription, delta);
    deliveries.push({ subscription: withoutKeys(nextSubscription, ["baseline", "queue"]), delta });
  }

  const nextStageCache = cacheTransaction
    ? finalizeStageCacheTransaction(cacheTransaction, {
        commit: cacheAccepted,
        currentStore: document?.stageCache || null,
        reason: result.cancelled
          ? "rolled-back-cancelled"
          : coreCommitted
            ? headMatches
              ? "rolled-back-post-commit-gate"
              : "rolled-back-stale-head"
            : "rolled-back-failed",
      })
    : document?.stageCache || null;
  const nextPlanBaseline = published && result.plan ? {
    documentRevision: snapshot.documentRevision,
    documentVersion: snapshot.documentVersion,
    plan: serializableValue(result.plan),
  } : null;

  const primary = deliveries[0] || null;
  const trace = [
    { direction: "client→kernel", command: "open", status: "accepted", documentRevision: 1 },
    ...snapshot.subscriptionIds.map((subscriptionId) => ({ direction: "client→kernel", command: "subscribe", status: "accepted", subscriptionId })),
    ...(snapshot.lastChange ? [{ direction: "client→kernel", command: "change", status: "accepted", baseRevision: snapshot.lastChange.baseRevision, documentRevision: snapshot.lastChange.documentRevision }] : []),
    { direction: "client→kernel", command: "run", status: "accepted", documentRevision: snapshot.documentRevision, runId: result.runId },
    {
      direction: "kernel→client",
      command: published ? "published" : result.cancelled ? "cancelled" : coreCommitted ? "stale-head" : "failed",
      status: published ? "committed" : "not-published",
      documentRevision: snapshot.documentRevision,
      resultId: result.resultEnvelope?.resultId || null,
    },
    ...(primary ? [{ direction: "kernel→client", command: "metadata-delta", status: primary.delta.state, cursor: primary.delta.cursor }] : []),
  ];
  const completion = {
    schema: "textabana.editor-kernel-run/lab-v1",
    protocol: "textabana.editor-kernel/lab-v1",
    session: document ? {
      ...editorDocumentSnapshot(document),
      publishedRevision: published ? snapshot.documentRevision : document.publishedRevision,
    } : {
      sessionId: snapshot.sessionId,
      documentId: snapshot.documentId,
      path: snapshot.path,
      documentRevision: snapshot.documentRevision,
      documentVersion: snapshot.documentVersion,
      publishedRevision: snapshot.previousPublishedRevision,
    },
    evaluatedSnapshot: {
      documentId: snapshot.documentId,
      path: snapshot.path,
      documentRevision: snapshot.documentRevision,
      documentVersion: snapshot.documentVersion,
    },
    run: {
      runId: result.runId,
      status: published ? "succeeded" : result.cancelled ? "cancelled" : coreCommitted ? "stale" : "failed",
      committed: coreCommitted,
      published,
      resultId: result.resultEnvelope?.resultId || null,
    },
    change: snapshot.lastChange,
    subscription: primary?.subscription || null,
    metadataDelta: primary?.delta || null,
    deliveries,
    trace,
    capabilities: editorProtocolCapabilities(),
    limitations: [
      "Parser/compiler snapshots may be reused within an editor session; module initialization and graph construction still run for every accepted execution.",
      "Two equal observations verify only the lab cache under a trusted module declaration; explicit host checkpoint transfer does not prove arbitrary JavaScript purity.",
      "In-memory single-worker document history and async overlap only; no multicore execution or synchronous preemption.",
      "No OT, CRDT, persistent document recovery, hard CPU/memory quota, LSP conversion or external side-effect rollback; metadata streaming is post-commit and credit-bounded.",
      "Unique quote + origin re-link is a conservative lab heuristic, not canonical structural re-anchoring.",
      "FNV-1a lab identities are non-cryptographic and non-canonical.",
    ],
    extensions: { "textabana.playground": { canonical: false, fullProfileConformance: false } },
  };

  if (published) {
    for (const [subscriptionId, subscription] of subscriptionUpdates) editorSubscriptions.set(subscriptionId, subscription);
    document.publishedRevision = snapshot.documentRevision;
    document.planBaseline = nextPlanBaseline;
    if (cacheAccepted && nextStageCache) document.stageCache = nextStageCache;
  }
  return completion;
}

function withoutSystemArgs(args) {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith("@")));
}

function cloneInvocationValue(value) {
  if (Array.isArray(value)) return value.map(cloneInvocationValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).map((key) => [key, cloneInvocationValue(value[key])]));
  }
  return value;
}

function detachParallelOutput(value, stageName) {
  const snapshot = snapshotParallelValue(value);
  if (!snapshot.ok) {
    throw cacheContractError(
      "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB",
      `Parallellkandidaten “${stageName}” returnerade ett värde utanför den portabla TextabanaValue-domänen: ${snapshot.detail || snapshot.reason}.`,
    );
  }
  try {
    return cloneParallelValue(snapshot);
  } catch (error) {
    throw cacheContractError(
      "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB",
      `Parallellkandidaten “${stageName}” kunde inte detacheras förlustfritt: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function serializableMeta(name, descriptor, modulePath, moduleDigest) {
  const execution = describeFunctionExecution({ descriptor, modulePath, moduleDigest });
  return {
    name,
    modulePath,
    moduleDigest,
    description: descriptor.description || "Ingen beskrivning angiven.",
    args: descriptor.args || {},
    accepts: descriptor.accepts || "text",
    returns: descriptor.returns || "text",
    behavior: descriptor.behavior || "unspecified",
    execution,
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
  let summaryValue;
  try {
    summaryValue = typeof value === "string" ? value : serializableValue(value);
    serialized = typeof value === "string" ? value : JSON.stringify(summaryValue);
  } catch {
    summaryValue = String(value);
    serialized = String(value);
  }
  const normalized = String(serialized ?? "").replace(/\s+/g, " ").trim();
  return {
    kind: valueKind(value),
    length: normalized.length,
    hash: `fnv1a:${sourceHash(normalized)}`,
    digest: semanticValueDigest(summaryValue),
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

function operationalReferenceMap({ runInstanceId = null, channelSnapshots = {}, sourceMaps = [], activities = [] }) {
  const replacements = new Map();
  if (runInstanceId) replacements.set(runInstanceId, "run-instance:$semantic");
  activities.forEach((activity, index) => {
    const semanticRef = activity.planNodeRef || activity.orderKey || `${activity.function || "stage"}:${index + 1}`;
    if (activity.runRef) replacements.set(activity.runRef, "run-instance:$semantic");
    if (activity.stageId) replacements.set(activity.stageId, `stage:${semanticRef}`);
    if (activity.invocationId) replacements.set(activity.invocationId, `invocation:${semanticRef}`);
    if (activity.activityId) replacements.set(activity.activityId, `activity:${semanticRef}`);
  });
  for (const event of Object.values(channelSnapshots).flatMap((snapshot) => snapshot.events || [])) {
    const semanticEventId = `event:${event.documentVersion}:${String(event.sequence).padStart(4, "0")}`;
    if (event.runRef) replacements.set(event.runRef, "run-instance:$semantic");
    if (event.eventId) replacements.set(event.eventId, semanticEventId);
    if (event.id) replacements.set(event.id, semanticEventId);
  }
  for (const mapping of sourceMaps || []) {
    const semanticOutputRef = replacements.get(mapping.outputRef) || mapping.outputRef;
    if (mapping.mappingId) replacements.set(mapping.mappingId, `mapping:${semanticOutputRef}`);
  }
  return replacements;
}

function normalizeOperationalReferences(value, replacements) {
  if (typeof value === "string") return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => normalizeOperationalReferences(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeOperationalReferences(item, replacements)]));
  }
  return value;
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

function buildCapabilities(inspection) {
  return {
    schema: "textabana.capabilities/lab-v1",
    optionalProfiles: [{ profile: "textabana.semantic-artifacts/v1", activation: "options.semanticIdentity=true", available: Boolean(globalThis.crypto?.subtle), scope: "source-bound-artifact-identity", fullRuntimeConformance: false }],
    profiles: {
      "language-core/0.4": "playground-subset",
      "runtime-json/1": "playground-subset",
      "editor/1": "playground-subset",
      "adapter-contract/1": "playground-subset",
      "data/1": "playground-subset",
      "notebook/1": "playground-subset",
      "annotation/1": "playground-subset",
      "ml-lineage/1": "contract-only",
    },
    adapters: adapterManifests.map((manifest) => ({
      adapterId: manifest.adapterId,
      version: manifest.version,
      profile: manifest.profile,
      support: manifest.support,
      manifestDigest: manifest.manifestDigest,
    })),
    limits: {
      digest: "fnv1a-lab-non-cryptographic",
      channelPayload: "structured-clone-compatible JSON subset",
      cancellation: "cooperative runtime boundaries; synchronous transforms and never-settling promises are not preempted",
      scheduler: "bounded async overlap in one browser worker; plan-order commit",
      runBudgets: "stage resolutions, channel events, render UTF-8 bytes and optional cooperative deadline",
      artifacts: "inline control plane only",
    },
    valueKinds: ["text", "object", "array", "number", "boolean", "null"],
    runtimes: [{ id: "browser-worker", support: "playground-subset", moduleLanguage: "javascript" }],
    extensions: { namespace: "textabana.playground", canonical: false },
    implemented: playgroundImplementedCapabilities,
    unsupported: [...new Set([
      ...(inspection?.unsupported || []),
      "cached-event-replay",
      "streaming-execution",
      "persistent-document-history",
      "collaborative-merge",
      "canonical-structural-reanchor",
      "fuzzy-reanchor",
      "lsp",
      "preemptive-synchronous-cancellation",
      "multicore-stage-execution",
      "effectful-branch-concurrency",
      "preemptive-synchronous-timeout",
      "hard-cpu-quota",
      "hard-memory-quota",
      "external-side-effect-rollback",
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
      "model-invocation",
      "persistent-review-store",
      "w3c-prov",
      "label-studio-api-roundtrip",
      "doccano-prodigy-brat",
      "mlflow-export",
      "otel-correlation",
    ])],
  };
}

const negativeConformanceFixtures = [
  {
    fixtureId: "failed-run",
    caseId: "negative-undeclared-channel",
    expectedOutcome: "failed",
    expectedDiagnosticCode: "TBA-TYPE-CHANNEL-LAB",
    purpose: "En odeklarerad kanal måste stoppas atomiskt i strict mode.",
  },
  {
    fixtureId: "negative-unknown-function",
    caseId: "negative-unknown-function",
    expectedOutcome: "failed",
    expectedDiagnosticCode: "TBA-RUN-LAB",
    purpose: "En okänd funktion får inte ge ett partiellt resultat.",
  },
  {
    fixtureId: "negative-unclosed-block",
    caseId: "negative-unclosed-block",
    expectedOutcome: "failed",
    expectedDiagnosticCode: "TBA-PARSE-BLOCK-UNCLOSED-LAB",
    purpose: "En obalanserad blockmarkör måste ge ett positionsbundet parse-fel.",
  },
];

const conformanceCases = new Map([
  ["conformance-golden", { caseId: "golden-core-chain", expectedOutcome: "succeeded" }],
  ["cancellation-probe", { caseId: "cooperative-cancellation", expectedOutcome: "cancelled", expectedDiagnosticCode: cancellationDiagnosticCode }],
  ...negativeConformanceFixtures.map((fixture) => [fixture.fixtureId, fixture]),
]);

const conformanceGoldenBaselines = {
  "conformance-golden": "fnv1a-lab:s960f",
};

const conformanceProfileOrder = [
  "language-core/0.4",
  "runtime-json/1",
  "editor/1",
  "adapter-contract/1",
  "data/1",
  "notebook/1",
  "annotation/1",
  "ml-lineage/1",
];

function conformanceRequirement(requirementId, status, message, evidenceRefs = []) {
  return { requirementId, status, message, evidenceRefs: uniqueStrings(evidenceRefs) };
}

function checkedRequirement(requirementId, condition, passMessage, failMessage, evidenceRefs = []) {
  return conformanceRequirement(requirementId, condition ? "passed" : "failed", condition ? passMessage : failMessage, evidenceRefs);
}

function notRunRequirement(requirementId, message) {
  return conformanceRequirement(requirementId, "not-run", message, []);
}

function profileResult(profile, declaredSupport, applicable, requirements) {
  const failed = requirements.some((requirement) => requirement.status === "failed");
  const passed = requirements.length > 0 && requirements.every((requirement) => requirement.status === "passed");
  const status = applicable ? (failed ? "failed" : passed ? "passed" : "not-run") : "not-run";
  const derivedSupport = status === "failed"
    ? "unsupported"
    : status !== "passed"
      ? null
      : declaredSupport === "contract-only"
        ? "contract-only"
        : "playground-subset";
  return {
    profile,
    declaredSupport,
    status,
    derivedSupport,
    applicable,
    claimable: status === "passed" && derivedSupport === "playground-subset",
    requirements,
  };
}

function committedBindingsResolve(result) {
  const events = allCommittedEvents(result);
  const anchors = new Set((result.anchors || []).map((anchor) => anchor.anchorId));
  const mappings = new Map((result.sourceMaps || []).map((mapping) => [mapping.outputRef, mapping]));
  const activities = new Set((result.provenance?.activities || []).map((activity) => activity.activityId));
  return events.every((event) => {
    const mapping = mappings.get(event.eventId);
    return anchors.has(event.target?.anchorRef)
      && mapping
      && mapping.inputAnchorRefs?.every((anchorRef) => anchors.has(anchorRef))
      && activities.has(event.provenanceRef)
      && mapping.generatingActivity === event.provenanceRef;
  });
}

function cacheProvenanceResolves(result) {
  const entities = result.provenance?.entities || [];
  const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));
  if (entityById.size !== entities.length) return false;
  const materializations = (result.provenance?.activities || []).filter((activity) => activity.activityType === "cache-materialization");
  return materializations.every((activity) => {
    const cacheEntity = entityById.get(activity.cacheEntryRef);
    const evidenceRefs = activity.evidenceRefs || [];
    if (cacheEntity?.entityType !== "cached-stage-output"
      || cacheEntity.planNodeRef !== activity.planNodeRef
      || evidenceRefs.length !== 2
      || new Set(evidenceRefs).size !== evidenceRefs.length
      || JSON.stringify(cacheEntity.evidenceRefs || []) !== JSON.stringify(evidenceRefs)) return false;
    return evidenceRefs.every((evidenceRef) => {
      const evidence = entityById.get(evidenceRef);
      return evidence?.entityType === "cache-observation"
        && evidence.planNodeRef === cacheEntity.planNodeRef
        && evidence.outputDigest === cacheEntity.outputDigest
        && typeof evidence.runRef === "string"
        && evidence.runRef.length > 0;
    });
  });
}

function buildStructuralSnapshot({ result, inspection, plan, executionTrace = [], adapterRun, capabilities, modules }) {
  const channels = Object.fromEntries(Object.entries(result.channelSnapshots || {}).map(([name, snapshot]) => [
    name,
    {
      descriptor: snapshot.descriptor,
      events: (snapshot.events || []).map((event) => ({
        sequence: event.sequence,
        channel: event.channel,
        kind: event.kind,
        target: event.target,
        payload: event.payload,
        source: event.source,
        origin: withoutKeys(event.origin, ["stageId", "invocationId"]),
        state: event.state,
      })),
    },
  ]));
  const normalizedExecutionTrace = executionTrace.map((step) => ({
    ...withoutKeys(step, ["duration", "runRef", "stageId", "invocationId", "activityId", "executionMode", "functionInvoked"]),
    cache: step.cache ? {
      eligibility: step.cache.eligibility,
      staticKey: step.cache.staticKey,
      semanticKey: step.cache.semanticKey,
    } : null,
  }));
  return canonicalValue({
    normalization: {
      policy: "textabana.structural-snapshot/lab-v1",
      ignoredPaths: [
        "/transport/runId",
        "/result/extensions/textabana.playground/duration",
        "/events/*/runId",
        "/events/*/runRef",
        "/events/*/eventId",
        "/events/*/id",
        "/events/*/provenanceRef",
        "/events/*/origin/{stageId,invocationId}",
        "/executionTrace/*/duration",
        "/executionTrace/*/runRef",
        "/executionTrace/*/stageId",
        "/executionTrace/*/executionMode",
        "/executionTrace/*/functionInvoked",
        "/executionTrace/*/cache/{mode,read,write,hit,reused,lookup,reason,evidence,verification}",
        "/result/anchors/*/origin/{stageId,invocationId}",
        "/result/sourceMaps/*/{mappingId,outputRef,generatingActivity}",
        "/adapterRun/adapterRunId",
        "/diagnostics/*/diagnosticId",
        "/cancellation/cancelToken",
      ],
    },
    source: result.source,
    modules: [...(modules || [])]
      .map((module) => ({ path: normalizePath(module.path), digest: `fnv1a-lab:${sourceHash(String(module.content || ""))}` }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    ir: inspection ? {
      schema: inspection.schema,
      languageVersion: inspection.languageVersion,
      parser: inspection.parser,
      sourceRef: inspection.sourceRef,
      sourceSpan: inspection.sourceSpan,
      validity: inspection.validity,
      configuration: inspection.configuration,
      syntax: {
        cst: {
          schema: inspection.syntax?.cst?.schema,
          grammarVersion: inspection.syntax?.cst?.grammarVersion,
          lossless: inspection.syntax?.cst?.lossless,
        },
        ast: {
          schema: inspection.syntax?.ast?.schema,
          grammarVersion: inspection.syntax?.ast?.grammarVersion,
          executable: inspection.syntax?.ast?.executable,
        },
      },
      nodes: inspection.nodes.map((node) => withoutKeys(node, ["nodeId"])),
      scopes: inspection.scopes,
      blocks: inspection.blocks,
      directives: inspection.directives,
      unsupported: inspection.unsupported,
    } : null,
    plan: plan ? {
      schema: plan.schema,
      languageVersion: plan.languageVersion,
      sourceRef: plan.sourceRef,
      constructionPhase: plan.constructionPhase,
      deterministic: plan.deterministic,
      graph: plan.graph,
      runtimePolicy: plan.runtimePolicy,
      unsupported: plan.unsupported,
    } : null,
    executionTrace: normalizedExecutionTrace,
    result: {
      schema: result.schema,
      resultId: result.resultId,
      status: result.run.status,
      committed: result.run.committed,
      render: { kind: result.render.kind, mediaType: result.render.mediaType, digest: `fnv1a-lab:${sourceHash(String(result.render.data || ""))}` },
      channels,
      anchors: result.anchors.map((anchor) => ({
        ...anchor,
        origin: withoutKeys(anchor.origin, ["stageId", "invocationId"]),
      })),
      sourceMaps: result.sourceMaps.map((mapping) => withoutKeys(mapping, ["mappingId", "outputRef", "generatingActivity"])),
      diagnostics: (result.diagnostics || []).map((diagnostic) => withoutKeys(diagnostic, ["diagnosticId"])),
    },
    projection: adapterRun ? {
      status: adapterRun.status,
      immutable: adapterRun.verification?.immutable === true,
      manifests: adapterRun.manifests.map((manifest) => ({ adapterId: manifest.adapterId, version: manifest.version, profile: manifest.profile, support: manifest.support, manifestDigest: manifest.manifestDigest })),
      projections: adapterRun.projections.map((projection) => ({
        adapterId: projection.adapterRef.adapterId,
        projectionId: projection.projectionId,
        status: projection.status,
        outputDigest: projection.output ? `fnv1a-lab:${sourceHash(canonicalJson(projection.output))}` : null,
        fidelity: projection.fidelity,
      })),
    } : null,
    capabilities: {
      profiles: capabilities.profiles,
      implemented: capabilities.implemented,
      unsupported: capabilities.unsupported,
      limits: capabilities.limits,
    },
  });
}

function buildConformanceReport({ fixtureId = "ad-hoc", result, inspection, plan, executionTrace = [], adapterRun, capabilities, modules }) {
  const knownCase = conformanceCases.get(fixtureId);
  const expected = knownCase || { caseId: fixtureId === "ad-hoc" ? "ad-hoc-success" : `unregistered:${fixtureId}`, expectedOutcome: "succeeded" };
  const actualOutcome = ["succeeded", "failed", "cancelled"].includes(result.run.status) ? result.run.status : "failed";
  const isSuccessful = actualOutcome === "succeeded" && result.run.committed;
  const isTerminalWithoutCommit = actualOutcome !== "succeeded" && !result.run.committed
    && result.render.data === ""
    && Object.keys(result.channelSnapshots || {}).length === 0
    && (result.anchors || []).length === 0
    && (result.sourceMaps || []).length === 0
    && (result.provenance?.activities || []).length === 0;
  const diagnosticCodes = (result.diagnostics || []).map((diagnostic) => diagnostic.code).filter(Boolean);
  const events = allCommittedEvents(result);
  const channelNames = Object.keys(result.channelSnapshots || {});
  const projectionFor = (profile) => adapterRun?.projections.find((projection) => {
    const manifest = adapterRun.manifests.find((candidate) => candidate.adapterId === projection.adapterRef.adapterId);
    return manifest?.profile === profile;
  });
  const resultRef = result.resultId;
  const irRef = inspection?.sourceRef?.version || "ir:not-produced";
  const planRef = plan?.schema || "plan:not-produced";
  const adapterRef = adapterRun?.sourceResultRef || "adapter:not-run";

  const languageApplicable = isSuccessful;
  const languageRequirements = languageApplicable ? [
    checkedRequirement("LANG-SOURCE-IR", Boolean(inspection && inspection.sourceRef?.version === result.source?.version), "IR är bunden till exakt source snapshot.", "IR saknas eller pekar på en annan source snapshot.", [irRef, result.source?.version]),
    checkedRequirement("LANG-DETERMINISTIC-PLAN", Boolean(plan?.deterministic && executionTrace.every((step) => step.status === "succeeded") && executionTrace.length === plan.graph.nodes.filter((node) => node.kind === "stage").length), "Pre-execution-grafen har deterministisk ordning och varje stage bands till en lyckad trace-post.", "Planen saknas, grafordningen är icke-deterministisk eller trace är ofullständig.", [planRef]),
    checkedRequirement("LANG-SYNTAX-ERASED", Boolean(inspection?.validity?.executable && inspection?.syntax?.cst?.lossless), "Authored kontrollsyntax sänktes från en lossless CST och bara literal/genererad markörtext kan finnas i renderingen.", "Parserprojektionen är ogiltig eller kunde inte verifiera lossless source coverage.", [resultRef]),
  ] : [notRunRequirement("LANG-ACTIVE-SUCCESS", "Language-profilen verifieras endast på en lyckad core run; detta case verifierar terminalfel.")];

  const runtimeRequirements = [
    checkedRequirement("RUNTIME-RESULT-SCHEMA", result.schema === "textabana.result/lab-v1", "Result-envelope har förväntat playgroundschema.", "Result-envelope saknar förväntat schema.", [resultRef]),
    checkedRequirement("RUNTIME-ATOMIC-TERMINAL", isSuccessful || isTerminalWithoutCommit, "Terminalstatus och commitgräns är atomiskt konsistenta.", "Terminalstatus läckte render, channels, anchors, SourceMaps eller provenance.", [resultRef]),
    checkedRequirement("RUNTIME-DESCRIPTORS", !isSuccessful || Object.values(result.channelSnapshots || {}).every((snapshot) => snapshot.descriptor?.declared !== false && snapshot.events.every((event) => event.state === "committed")), "Alla durable snapshots har deklarerade descriptors och committed events.", "Ett committed snapshot saknar descriptor eller innehåller tentative events.", [resultRef]),
    checkedRequirement("RUNTIME-CACHE-PROVENANCE", cacheProvenanceResolves(result), "Varje cachematerialisering har två unika, resolverbara och outputbundna observationsposter.", "En cachematerialisering saknar exakt matchande och resolverbara observationsposter.", [resultRef]),
  ];

  const editorApplicable = isSuccessful && events.length > 0;
  const editorRequirements = editorApplicable ? [
    checkedRequirement("EDITOR-BINDINGS", committedBindingsResolve(result), "Varje event löser till Anchor, SourceMap och provenanceaktivitet.", "Minst ett event har en oresolverbar Anchor-, SourceMap- eller provenance-referens.", [resultRef]),
    checkedRequirement("EDITOR-POSITIONS", events.every((event) => Number.isInteger(event.line) && event.line > 0 && event.target?.anchorRef), "Alla events har fysisk line och logisk anchorRef.", "Ett event saknar line eller anchorRef.", events.map((event) => event.target?.anchorRef)),
  ] : [notRunRequirement("EDITOR-EVENTS", "Aktuell fixture emitterade inga positionsbundna events.")];

  const contractApplicable = isSuccessful;
  const resultSummary = projectionFor("adapter-contract/1");
  const contractOnlySucceeded = adapterRun?.projections.some((projection) => {
    const manifest = adapterRun.manifests.find((candidate) => candidate.adapterId === projection.adapterRef.adapterId);
    return manifest?.support === "contract-only" && projection.status === "succeeded";
  });
  const adapterRequirements = contractApplicable ? [
    checkedRequirement("ADAPTER-IMMUTABLE", adapterRun?.verification?.immutable === true && adapterRun.verification.beforeDigest === adapterRun.verification.afterDigest, "Post-commit fan-out lämnade canonical Result byte-ekvivalent.", "Adapterkörningen muterade eller kunde inte verifiera sitt source result.", [adapterRef]),
    checkedRequirement("ADAPTER-REFERENCE", resultSummary?.status === "succeeded" && resultSummary.sourceResultRef.resultId === resultRef, "Referensadaptern gav en source-bound projektion.", "Referensadaptern saknas, misslyckades eller pekar på fel resultat.", [resultSummary?.projectionId, resultRef]),
    checkedRequirement("ADAPTER-CONTRACT-BOUNDARY", !contractOnlySucceeded, "Contract-only-adaptrar producerade ingen fabricerad output.", "En contract-only-adapter producerade en lyckad projektion.", adapterRun?.manifests.filter((manifest) => manifest.support === "contract-only").map((manifest) => manifest.adapterId)),
    checkedRequirement("ADAPTER-NO-FAILED-PROJECTION", !adapterRun?.projections.some((projection) => projection.status === "failed"), "Ingen begärd adapterprojektion misslyckades.", "Minst en begärd adapterprojektion misslyckades.", [adapterRef, ...(adapterRun?.projections.filter((projection) => projection.status === "failed").map((projection) => projection.projectionId) || [])]),
  ] : [notRunRequirement("ADAPTER-POST-COMMIT", "Adapters är korrekt skippade när core run inte committar.")];

  const domainProfile = (profile, prefix, requirementId) => {
    const applicable = isSuccessful && channelNames.some((name) => name.startsWith(prefix));
    const projection = projectionFor(profile);
    const requirements = applicable ? [
      checkedRequirement(requirementId, projection?.status === "succeeded" && projection.sourceResultRef.resultId === resultRef, `${profile} producerade en verifierad source-bound projektion.`, `${profile} saknar en lyckad source-bound projektion.`, [projection?.projectionId, resultRef]),
    ] : [notRunRequirement(requirementId, `Aktuell fixture emitterade inga ${prefix}*-kanaler.`)];
    return { applicable, requirements };
  };
  const data = domainProfile("data/1", "data.", "DATA-PROJECTION");
  const notebook = domainProfile("notebook/1", "notebook.", "NOTEBOOK-PROJECTION");
  const annotation = domainProfile("annotation/1", "annotation.", "ANNOTATION-PROJECTION");
  const mlManifest = adapterRun?.manifests.find((manifest) => manifest.profile === "ml-lineage/1");
  const mlProjection = projectionFor("ml-lineage/1");
  const mlRequirements = [
    checkedRequirement("ML-CONTRACT-ONLY", mlManifest?.support === "contract-only" && mlProjection?.status !== "succeeded", "ml-lineage/1 stannar vid en deklarerad, icke-claimable kontraktsgräns.", "ml-lineage/1 saknar contract-only-markering eller fabricerade en lyckad projektion.", [mlManifest?.adapterId, mlProjection?.projectionId]),
  ];

  const profiles = [
    profileResult("language-core/0.4", capabilities.profiles["language-core/0.4"], languageApplicable, languageRequirements),
    profileResult("runtime-json/1", capabilities.profiles["runtime-json/1"], true, runtimeRequirements),
    profileResult("editor/1", capabilities.profiles["editor/1"], editorApplicable, editorRequirements),
    profileResult("adapter-contract/1", capabilities.profiles["adapter-contract/1"], contractApplicable, adapterRequirements),
    profileResult("data/1", capabilities.profiles["data/1"], data.applicable, data.requirements),
    profileResult("notebook/1", capabilities.profiles["notebook/1"], notebook.applicable, notebook.requirements),
    profileResult("annotation/1", capabilities.profiles["annotation/1"], annotation.applicable, annotation.requirements),
    profileResult("ml-lineage/1", capabilities.profiles["ml-lineage/1"], true, mlRequirements),
  ];

  const stages = [
    { stage: "source", status: result.source ? "passed" : "failed", message: result.source ? "Versionerad source snapshot finns." : "Source snapshot saknas.", evidenceRefs: result.source ? [result.source.version] : [] },
    { stage: "ir", status: inspection ? "passed" : "failed", message: inspection ? "IR-projektion producerades." : "IR-projektion saknas.", evidenceRefs: inspection ? [inspection.schema, inspection.sourceRef.version] : [] },
    { stage: "plan", status: isSuccessful ? (plan?.deterministic && executionTrace.every((step) => step.status === "succeeded") && executionTrace.length === plan.graph.nodes.filter((node) => node.kind === "stage").length ? "passed" : "failed") : "not-run", message: isSuccessful ? "Pre-execution-grafen verifierades mot en komplett lyckad trace." : "Planclaim görs inte för terminalt felcase.", evidenceRefs: plan ? [plan.schema, plan.graph.graphId] : [] },
    { stage: "result", status: isSuccessful || isTerminalWithoutCommit ? "passed" : "failed", message: isSuccessful ? "Resultatet är atomiskt committed." : isTerminalWithoutCommit ? "Terminalfelet rullade tillbaka all durable output." : "Resultatgränsen är inkonsistent.", evidenceRefs: [resultRef] },
    { stage: "projection", status: isSuccessful ? (adapterRun?.verification?.immutable ? "passed" : "failed") : "not-run", message: isSuccessful ? "Post-commit-projektioner kördes isolerat." : "Adapters skippades före commit.", evidenceRefs: adapterRun ? [adapterRef] : [] },
  ];

  const caseRequirements = [
    checkedRequirement("CASE-OUTCOME", actualOutcome === expected.expectedOutcome, `Caset gav förväntad terminalstatus ${expected.expectedOutcome}.`, `Caset väntade ${expected.expectedOutcome} men gav ${actualOutcome}.`, [resultRef]),
    ...(expected.expectedDiagnosticCode ? [checkedRequirement("CASE-DIAGNOSTIC", diagnosticCodes.includes(expected.expectedDiagnosticCode), `Förväntad diagnostikkod ${expected.expectedDiagnosticCode} observerades.`, `Förväntad diagnostikkod ${expected.expectedDiagnosticCode} saknas.`, diagnosticCodes)] : []),
  ];

  const structuralSnapshot = buildStructuralSnapshot({ result, inspection, plan, executionTrace, adapterRun, capabilities, modules });
  const structuralDigest = `fnv1a-lab:${sourceHash(canonicalJson(structuralSnapshot))}`;
  const expectedStructuralDigest = conformanceGoldenBaselines[fixtureId] || null;
  const goldenStatus = expectedStructuralDigest
    ? expectedStructuralDigest === structuralDigest ? "passed" : "failed"
    : "not-run";
  if (expectedStructuralDigest) {
    caseRequirements.push(checkedRequirement("GOLDEN-STRUCTURE", goldenStatus === "passed", "Aktuell normaliserad struktur matchar den versionssatta golden-baselinen.", "Aktuell struktur avviker från den versionssatta golden-baselinen.", [expectedStructuralDigest, structuralDigest]));
  }

  const cancellationRequested = expected.expectedOutcome === "cancelled" || actualOutcome === "cancelled";
  const cancellationObserved = actualOutcome === "cancelled" && diagnosticCodes.includes(cancellationDiagnosticCode) && isTerminalWithoutCommit;
  const cancellation = {
    support: "cooperative-runtime-boundary",
    status: cancellationRequested ? cancellationObserved ? "passed" : "failed" : "not-run",
    requested: cancellationRequested,
    observed: cancellationObserved,
    diagnosticCode: cancellationDiagnosticCode,
    limitation: "Avbrytning och valfri deadline kontrolleras vid runtime-/checkpointgränser; synkrona CPU-loopar och aldrig settlande Promises preempteras inte och externa sidoeffekter kan inte rullas tillbaka.",
  };
  if (cancellation.status === "failed") caseRequirements.push(conformanceRequirement("CANCELLATION-ATOMIC", "failed", "Cancellation nådde inte en atomisk cancelled-terminalstatus.", [resultRef]));

  const profileBlockers = profiles.flatMap((profile) => profile.requirements.filter((requirement) => requirement.status === "failed").map((requirement) => requirement.requirementId));
  const caseBlockers = caseRequirements.filter((requirement) => requirement.status === "failed").map((requirement) => requirement.requirementId);
  const stageBlockers = stages.filter((stage) => stage.status === "failed").map((stage) => `STAGE-${stage.stage.toUpperCase()}`);
  const blockingRequirementIds = uniqueStrings([...caseBlockers, ...profileBlockers, ...stageBlockers]);
  const counts = profiles.reduce((summary, profile) => ({ ...summary, [profile.status]: summary[profile.status] + 1 }), { passed: 0, failed: 0, "not-run": 0 });
  const reportSeed = {
    suite: "textabana.playground/interop-0.7",
    suiteVersion: "1.4.0-lab.1",
    fixtureId,
    caseId: expected.caseId,
    sourceResultRef: resultRef,
    structuralDigest,
    profiles: profiles.map((profile) => ({ profile: profile.profile, status: profile.status, derivedSupport: profile.derivedSupport, claimable: profile.claimable })),
    gate: blockingRequirementIds,
  };
  return {
    schema: "textabana.conformance-report/lab-v1",
    reportId: `conformance:${sourceHash(canonicalJson(reportSeed))}`,
    sourceResultRef: resultRef,
    suite: { suiteId: "textabana.playground/interop-0.7", version: "1.4.0-lab.1" },
    case: {
      caseId: expected.caseId,
      fixtureId,
      expectedOutcome: expected.expectedOutcome,
      actualOutcome,
      ...(expected.expectedDiagnosticCode ? { expectedDiagnosticCode: expected.expectedDiagnosticCode } : {}),
      registered: Boolean(knownCase || fixtureId === "ad-hoc"),
      requirements: caseRequirements,
    },
    selectedProfiles: conformanceProfileOrder,
    profiles,
    stages,
    normalization: structuralSnapshot.normalization,
    structuralSnapshot,
    structuralDigest,
    golden: {
      baselineId: expectedStructuralDigest ? `${fixtureId}@1.5.0-lab.1` : null,
      expectedStructuralDigest,
      actualStructuralDigest: structuralDigest,
      status: goldenStatus,
    },
    negativeFixtures: negativeConformanceFixtures,
    cancellation,
    summary: {
      passed: counts.passed,
      failed: counts.failed,
      notRun: counts["not-run"],
      claimableProfiles: profiles.filter((profile) => profile.claimable).map((profile) => profile.profile),
    },
    gate: { status: blockingRequirementIds.length ? "failed" : "passed", blockingRequirementIds },
    extensions: {
      "textabana.playground": {
        canonical: false,
        fullConformance: false,
        digestAlgorithm: "fnv1a-lab-non-cryptographic",
        note: "Rapporten verifierar endast aktiv fixture och deklarerade playground-subsets; den känner inte CI-status och utgör inte full profilkonformitet.",
      },
    },
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

function stringifyResult(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n");
  return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function cacheContractError(code, message) {
  const error = new Error(message);
  error.name = "StageCacheContractError";
  error.code = code;
  error.phase = "execution";
  return error;
}

async function callFunction(stage, input, registry, diagnostics, channelBus, contextExtra = {}, runtimeHooks = {}) {
  channelBus.throwIfCancelled();
  const entry = registry.get(stage.name);
  if (!entry) throw new Error(`Rad ${stage.line}: okänd funktion “${stage.name}”.`);
  for (const [channelName, descriptor] of Object.entries(entry.descriptor.channels || {})) {
    channelBus.declare(channelName, descriptor);
  }
  const warnings = [];
  const source = contextExtra.source || { startLine: stage.line, endLine: stage.line };
  const execution = contextExtra.execution || channelBus.createExecution({
    functionName: stage.name,
    modulePath: entry.modulePath,
    modality: contextExtra.modality || "block",
    scopeId: contextExtra.scopeId,
    stageLine: stage.line,
    syntaxStageId: stage.stageId || null,
    syntaxSpan: stage.sourceSpan || null,
    planNodeRef: contextExtra.planNode?.nodeId || null,
    planOrderKey: contextExtra.planNode?.orderKey || null,
    cachePlan: contextExtra.planNode?.cache || null,
    executionMode: "fresh-transform",
    source,
  });
  let invocationLeaseOpen = true;
  const assertEffectAllowed = () => {
    if (!invocationLeaseOpen) {
      throw cacheContractError("TBA-STAGE-LEASE-CLOSED-LAB", `Funktionen “${stage.name}” försökte emittera efter att dess invocation avslutats.`);
    }
    if (runtimeHooks.enforceNoEffects) {
      const parallelOnly = runtimeHooks.enforceNoEffects === "parallel";
      throw cacheContractError(
        parallelOnly ? "TBA-PARALLEL-EFFECT-VIOLATION-LAB" : "TBA-CACHE-EFFECT-VIOLATION-LAB",
        `${parallelOnly ? "Parallellkandidaten" : "Cachekandidaten"} “${stage.name}” deklarerade effects=[] men försökte skapa en observerbar effekt.`,
      );
    }
  };
  const emit = (channel, value, location) => {
    assertEffectAllowed();
    return channelBus.emit(channel, value, location, execution);
  };
  const systemOut = (value, location) => emit("system.out", value, location);
  systemOut.line = (value, location = {}) => emit("system.out", value, { ...location, mode: location.mode || "line" });
  systemOut.row = (rowId, value, location = {}) => emit("system.out", value, {
    ...location,
    rowId,
    mode: location.mode || "row",
  });
  const context = {
    functionName: stage.name,
    modulePath: entry.modulePath,
    modality: contextExtra.modality || "block",
    scopeId: contextExtra.scopeId || null,
    source: { ...source, stageLine: stage.line },
    ...(contextExtra.authoredInput === undefined ? {} : { authoredInput: contextExtra.authoredInput }),
    emit,
    signal: {
      get aborted() { return channelBus.isCancelled(); },
      get reason() { return channelBus.abortReason(); },
      throwIfAborted() { channelBus.throwIfCancelled(); },
    },
    checkpoint() {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            channelBus.checkpoint();
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 0);
      });
    },
    system: { out: systemOut },
    annotate(value, location = {}) { return emit("system.out", value, { ...location, kind: location.kind || "annotation" }); },
    warn(message, location) {
      assertEffectAllowed();
      const normalized = String(message);
      warnings.push({ message: normalized, location });
      return channelBus.emit("diagnostics", { severity: "warning", level: "warning", message: normalized }, { ...location, kind: "diagnostic" }, execution);
    },
  };
  const authoredArgs = cloneInvocationValue(withoutSystemArgs(stage.args));
  const args = cloneInvocationValue(authoredArgs);
  const recordStage = runtimeHooks.recordStage || ((record) => channelBus.recordStage(record));
  const started = performance.now();
  let output;
  try {
    output = await entry.descriptor.transform(input, args, context);
    invocationLeaseOpen = false;
    channelBus.throwIfCancelled();
    const cacheResolution = runtimeHooks.validateSuccess
      ? runtimeHooks.validateSuccess({ input, output, execution })
      : runtimeHooks.lookup?.resolution || null;
    recordStage({
      execution,
      args: authoredArgs,
      input,
      output,
      status: "succeeded",
      duration: performance.now() - started,
      cacheResolution,
    });
  } catch (error) {
    invocationLeaseOpen = false;
    recordStage({
      execution,
      args: authoredArgs,
      input,
      output: null,
      status: error?.code === cancellationDiagnosticCode ? "cancelled" : "failed",
      duration: performance.now() - started,
      cacheResolution: runtimeHooks.lookup?.resolution || null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    invocationLeaseOpen = false;
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

async function executeExecutionGraph(compiled, registry, diagnostics, channelBus, cacheTransaction, runControl) {
  const values = new Map();
  const publicNodes = new Map(compiled.plan.graph.nodes.map((node) => [node.nodeId, node]));
  const operationOrder = new Map(compiled.operations.map((operation, index) => [operation.nodeId, index]));
  const pending = new Map(compiled.operations.map((operation) => [operation.nodeId, operation]));
  const stageOperations = compiled.operations.filter((operation) => operation.kind === "stage");
  const reservedExecutions = new Map(stageOperations.map((operation) => {
    const planNode = publicNodes.get(operation.nodeId);
    if (!planNode || planNode.kind !== "stage") throw planningError(`Stage-operationen ${operation.nodeId} saknar motsvarande grafnod.`);
    return [operation.nodeId, channelBus.createExecution({
      functionName: operation.stage.name,
      modulePath: planNode.module,
      modality: operation.context.modality || "block",
      scopeId: operation.context.scopeId,
      stageLine: operation.stage.line,
      syntaxStageId: operation.stage.stageId || null,
      syntaxSpan: operation.stage.sourceSpan || null,
      planNodeRef: planNode.nodeId,
      planOrderKey: planNode.orderKey,
      cachePlan: planNode.cache,
      executionMode: "fresh-transform",
      source: operation.context.source,
    })];
  }));
  const pendingStageCommits = new Map();
  let nextStageCommitIndex = 0;
  const dependencies = (operation) => {
    if (operation.kind === "source") return [];
    if (operation.kind === "merge") return operation.inputNodeIds;
    if (operation.kind === "stage" || operation.kind === "render") return [operation.inputNodeId];
    throw planningError(`Okänd operationstyp “${operation.kind}”.`);
  };
  const sortOperations = (operations) => [...operations]
    .sort((left, right) => operationOrder.get(left.nodeId) - operationOrder.get(right.nodeId));
  const readyOperations = () => sortOperations([...pending.values()]
    .filter((operation) => dependencies(operation).every((nodeId) => values.has(nodeId))));
  const isStaticParallelCandidate = (operation) => publicNodes.get(operation.nodeId)?.contract?.parallelEligibility === "candidate";
  const isRuntimeParallelCandidate = (operation) => {
    if (!isStaticParallelCandidate(operation) || !values.has(operation.inputNodeId)) return false;
    return snapshotCacheValue(values.get(operation.inputNodeId)).ok;
  };

  const prepareStage = (operation) => {
    const planNode = publicNodes.get(operation.nodeId);
    if (!planNode || planNode.kind !== "stage") {
      throw planningError(`Stage-operationen ${operation.nodeId} saknar motsvarande grafnod.`);
    }
    if (!values.has(operation.inputNodeId)) {
      throw planningError(`Stage-noden ${operation.nodeId} saknar sitt planerade inputvärde.`);
    }
    const input = values.get(operation.inputNodeId);
    const parallelCandidate = planNode.contract.parallelEligibility === "candidate";
    const cacheEligible = cacheTransaction.enabled && planNode.contract.cacheEligibility === "candidate";
    const inputSnapshot = cacheEligible || parallelCandidate
      ? snapshotCacheValue(input)
      : { ok: false, reason: cacheTransaction.enabled ? "contract-ineligible" : "cache-disabled" };
    const semanticKey = materializeCacheKey(planNode, inputSnapshot.ok ? inputSnapshot.digest : null);
    const witnessSnapshot = cacheEligible
      ? stageCacheWitness({
          nodeId: operation.nodeId,
          witnessBase: operation.cacheWitnessBase,
          inputSnapshot,
        })
      : { ok: false, reason: inputSnapshot.reason };
    const lookup = resolveStageCache(cacheTransaction, {
      nodeId: operation.nodeId,
      semanticKey,
      witness: witnessSnapshot.ok ? witnessSnapshot.wire : null,
      witnessFailure: witnessSnapshot.ok ? null : witnessSnapshot,
      eligibility: planNode.contract.cacheEligibility,
      inputSnapshot,
    });
    const execution = reservedExecutions.get(operation.nodeId);
    if (!execution) throw planningError(`Stage-operationen ${operation.nodeId} saknar reserverad execution-identitet.`);
    if (lookup.hit) {
      execution.executionMode = "cache-reuse";
      execution.activityId = execution.activityId.replace("activity:invocation:", "activity:cache-materialization:");
    }
    return { operation, planNode, input, inputSnapshot, lookup, execution, cacheEligible, parallelCandidate, record: null };
  };

  const commitStageOutcome = (outcome) => {
    const { item } = outcome;
    if (outcome.kind === "cache-hit") {
      channelBus.recordStage({
        execution: item.execution,
        args: cloneInvocationValue(withoutSystemArgs(item.operation.stage.args)),
        input: item.input,
        output: outcome.traceOutput,
        status: "succeeded",
        duration: 0,
        cacheResolution: item.lookup.resolution,
        functionInvoked: false,
      });
    } else {
      if (outcome.kind === "succeeded" && item.cacheEligible) {
        observeStageCache(cacheTransaction, item.lookup, outcome.outputSnapshot);
      }
      if (item.record) channelBus.recordStage(item.record);
    }
    recordStageResolution(cacheTransaction, item.lookup.resolution);
  };
  const flushStageCommits = (force = false) => {
    if (force) {
      const orderedPending = stageOperations
        .slice(nextStageCommitIndex)
        .map((operation) => pendingStageCommits.get(operation.nodeId))
        .filter(Boolean);
      orderedPending.forEach(commitStageOutcome);
      orderedPending.forEach((outcome) => pendingStageCommits.delete(outcome.item.operation.nodeId));
      return;
    }
    while (nextStageCommitIndex < stageOperations.length) {
      const operation = stageOperations[nextStageCommitIndex];
      const outcome = pendingStageCommits.get(operation.nodeId);
      if (!outcome) break;
      commitStageOutcome(outcome);
      pendingStageCommits.delete(operation.nodeId);
      nextStageCommitIndex += 1;
    }
  };

  const resolveStageWave = async (operations, requestedMode) => {
    runControl.assertActive();
    const prepared = operations.map(prepareStage);
    const fresh = prepared.filter((item) => !item.lookup.hit);
    const requiresDetachedOutput = fresh.length > 1;
    cacheTransaction.stats.executed += fresh.length;
    const settlements = await Promise.allSettled(fresh.map(async (item) => {
      const output = await callFunction(
        item.operation.stage,
        item.input,
        registry,
        diagnostics,
        channelBus,
        { ...item.operation.context, planNode: item.planNode, execution: item.execution },
        {
          lookup: item.lookup,
          enforceNoEffects: item.cacheEligible ? "cache" : item.parallelCandidate ? "parallel" : false,
          recordStage(record) {
            const recordedOutput = record.status === "succeeded" && item.outputDetached
              ? item.detachedOutput
              : record.output;
            item.record = {
              ...record,
              output: recordedOutput,
              inputSummary: valueSummary(record.input),
              outputSummary: valueSummary(recordedOutput),
            };
          },
          validateSuccess({ output: invocationOutput }) {
            if (item.inputSnapshot.ok) {
              const inputAfter = snapshotCacheValue(item.input);
              if (!inputAfter.ok || inputAfter.wire !== item.inputSnapshot.wire || inputAfter.digest !== item.inputSnapshot.digest) {
                const parallelOnly = item.parallelCandidate && !item.cacheEligible;
                throw cacheContractError(
                  parallelOnly ? "TBA-PARALLEL-INPUT-MUTATION-LAB" : "TBA-CACHE-INPUT-MUTATION-LAB",
                  `${parallelOnly ? "Parallellkandidaten" : "Cachekandidaten"} “${item.operation.stage.name}” muterade sitt inputvärde; körningen rullas tillbaka.`,
                );
              }
            }
            item.cacheOutputSnapshot = item.cacheEligible ? snapshotCacheValue(invocationOutput) : null;
            if (requiresDetachedOutput) {
              item.detachedOutput = detachParallelOutput(invocationOutput, item.operation.stage.name);
              item.outputDetached = true;
            }
            return item.lookup.resolution;
          },
        },
      );
      return {
        output: item.outputDetached ? item.detachedOutput : output,
        outputSnapshot: item.cacheEligible ? item.cacheOutputSnapshot : null,
      };
    }));
    fresh.forEach((item, index) => { item.settlement = settlements[index]; });
    const errors = [];
    for (const item of prepared) {
      if (item.lookup.hit) {
        values.set(item.operation.nodeId, item.lookup.output);
        pendingStageCommits.set(item.operation.nodeId, {
          kind: "cache-hit",
          item,
          traceOutput: cloneInvocationValue(item.lookup.output),
        });
        continue;
      }
      if (item.settlement?.status === "fulfilled") {
        values.set(item.operation.nodeId, item.settlement.value.output);
        pendingStageCommits.set(item.operation.nodeId, {
          kind: "succeeded",
          item,
          outputSnapshot: item.cacheEligible ? item.settlement.value.outputSnapshot : null,
        });
        continue;
      }
      const error = item.settlement?.reason || planningError(`Stage-noden ${item.operation.nodeId} saknar terminalt utfall.`);
      item.lookup.resolution.reason = error?.code || "function-failed";
      pendingStageCommits.set(item.operation.nodeId, { kind: "failed", item, error });
      errors.push(error);
    }
    const freshNodeRefs = fresh.map((item) => item.operation.nodeId);
    const reusedNodeRefs = prepared.filter((item) => item.lookup.hit).map((item) => item.operation.nodeId);
    const mode = requestedMode === "barrier"
      ? "barrier"
      : freshNodeRefs.length > 1 ? "concurrent" : freshNodeRefs.length ? "safe-single" : "cache-materialization";
    runControl.recordWave({
      nodeRefs: prepared.map((item) => item.operation.nodeId),
      freshNodeRefs,
      reusedNodeRefs,
      mode,
    });
    runControl.assertActive();
    if (errors.length) {
      flushStageCommits(true);
      throw errors[0];
    }
    flushStageCommits(false);
  };

  try {
    while (pending.size) {
      runControl.assertActive();
      const ready = readyOperations();
      if (!ready.length) throw planningError("ExecutionGraph kunde inte producera ett färdigt ready set.");
      const synchronous = ready.filter((operation) => operation.kind !== "stage");
      if (synchronous.length) {
        for (const operation of synchronous) {
          runControl.assertActive();
          if (operation.kind === "source") values.set(operation.nodeId, operation.text);
          else if (operation.kind === "merge") {
            const missing = operation.inputNodeIds.find((nodeId) => !values.has(nodeId));
            if (missing) throw planningError(`Merge-noden ${operation.nodeId} saknar input från ${missing}.`);
            values.set(operation.nodeId, operation.inputNodeIds.map((nodeId) => stringifyResult(values.get(nodeId))).join(""));
          } else if (operation.kind === "render") {
            if (!values.has(operation.inputNodeId)) throw planningError(`Rendernoden ${operation.nodeId} saknar sitt planerade inputvärde.`);
            const render = String(values.get(operation.inputNodeId));
            runControl.checkRender(render);
            values.set(operation.nodeId, render);
          } else throw planningError(`Okänd operationstyp “${operation.kind}”.`);
          pending.delete(operation.nodeId);
        }
        continue;
      }
      const firstPendingStaticBarrier = stageOperations.find((operation) => (
        pending.has(operation.nodeId) && !isStaticParallelCandidate(operation)
      ));
      const barrierOrder = firstPendingStaticBarrier
        ? operationOrder.get(firstPendingStaticBarrier.nodeId)
        : Number.POSITIVE_INFINITY;
      const readyStages = ready
        .filter((operation) => operation.kind === "stage")
        .filter((operation) => operationOrder.get(operation.nodeId) <= barrierOrder);
      const first = readyStages[0];
      if (!first) throw planningError("ExecutionGraph saknar körbar operation i sitt ready set.");
      if (!isRuntimeParallelCandidate(first)) {
        await resolveStageWave([first], isStaticParallelCandidate(first) ? "safe" : "barrier");
        pending.delete(first.nodeId);
        continue;
      }
      const selected = [];
      for (const operation of readyStages) {
        if (selected.length >= runControl.report().scheduling.maxConcurrency) break;
        if (!isRuntimeParallelCandidate(operation)) break;
        selected.push(operation);
      }
      await resolveStageWave(selected, "safe");
      selected.forEach((operation) => pending.delete(operation.nodeId));
    }
  } catch (error) {
    flushStageCommits(true);
    throw error;
  }
  flushStageCommits(false);

  const plannedStages = compiled.plan.graph.nodes.filter((node) => node.kind === "stage").map((node) => node.nodeId);
  const observedStages = channelBus.traceSnapshot().map((step) => step.planNodeRef);
  if (plannedStages.length !== observedStages.length || plannedStages.some((nodeId, index) => nodeId !== observedStages[index])) {
    throw planningError("Execution trace avvek från den förkompilerade stageordningen; ingen commit tillåts.");
  }
  return values.get(compiled.plan.graph.terminalNodeId) || "";
}

function synchronizeCommittedCacheTrace(executionTrace, executionReport) {
  const resolutions = new Map((executionReport?.nodeResolutions || []).map((resolution) => [resolution.planNodeRef, resolution]));
  for (const step of executionTrace || []) {
    const resolution = resolutions.get(step.planNodeRef);
    if (!step.cache || !resolution) continue;
    step.cache.write = resolution.cache.write;
    step.cache.lookup = resolution.lookup;
    step.cache.reason = resolution.reason;
    step.cache.evidence = resolution.cache.evidence;
    step.cache.cacheEntryId = resolution.cache.cacheEntryId;
    step.cache.outputDigest = resolution.cache.outputDigest;
    step.cache.evidenceRefs = resolution.cache.evidenceRefs;
    step.cache.evidenceRecords = resolution.cache.evidenceRecords;
    step.cache.verification = resolution.cache.verification;
  }
}

function buildResultEnvelope({ runId, runInstanceId, profile = "fresh", ok, status: explicitStatus, output, error, diagnostics, channels, descriptors, anchors, sourceMaps, executionTrace = [], ir, duration }) {
  const status = explicitStatus || (ok ? "succeeded" : "failed");
  const committed = ok && status === "succeeded";
  const committedChannels = committed ? channels : {};
  const channelSnapshots = Object.fromEntries(Object.entries(descriptors)
    .filter(([name]) => committed && descriptors[name].persistence !== "transient" && (committedChannels[name] || descriptors[name].required))
    .map(([name, descriptor]) => [name, { descriptor, events: committedChannels[name] || [] }]));
  const semanticReferences = operationalReferenceMap({
    runInstanceId,
    channelSnapshots,
    sourceMaps,
    activities: executionTrace,
  });
  const semanticChannelSnapshots = Object.fromEntries(Object.entries(channelSnapshots).map(([name, snapshot]) => [
    name,
    {
      descriptor: snapshot.descriptor,
      events: snapshot.events.map((event) => {
        const stable = withoutKeys(event, ["runId", "runRef", "eventId", "id", "provenanceRef"]);
        return normalizeOperationalReferences(
          { ...stable, origin: withoutKeys(event.origin, ["stageId", "invocationId"]) },
          semanticReferences,
        );
      }),
    },
  ]));
  const semanticSeed = canonicalJson({
    status,
    source: ir?.sourceRef || null,
    output: committed ? output : "",
    channels: semanticChannelSnapshots,
    diagnostics: diagnostics.map((diagnostic) => withoutKeys(diagnostic, ["diagnosticId"])),
  });
  const cacheProvenanceEntities = new Map();
  if (committed) {
    for (const step of executionTrace) {
      if (step.functionInvoked !== false || !step.cache?.cacheEntryId) continue;
      cacheProvenanceEntities.set(step.cache.cacheEntryId, {
        entityId: step.cache.cacheEntryId,
        entityType: "cached-stage-output",
        planNodeRef: step.planNodeRef,
        outputDigest: step.cache.outputDigest,
        semanticOutputDigest: step.output.digest,
        evidenceRefs: step.cache.evidenceRefs || [],
      });
      for (const evidence of step.cache.evidenceRecords || []) {
        cacheProvenanceEntities.set(evidence.evidenceId, {
          entityId: evidence.evidenceId,
          entityType: "cache-observation",
          runRef: evidence.runRef,
          documentRevision: evidence.documentRevision,
          documentVersion: evidence.documentVersion,
          planNodeRef: step.planNodeRef,
          outputDigest: evidence.outputDigest,
        });
      }
    }
  }
  return {
    schema: "textabana.result/lab-v1",
    resultId: `lab:${sourceHash(semanticSeed)}`,
    run: {
      runId: `run:${runId}`,
      instanceId: runInstanceId,
      profile,
      status,
      committed,
    },
    source: ir?.sourceRef || null,
    render: {
      kind: "text",
      mediaType: "text/markdown",
      data: committed ? output : "",
    },
    channelSnapshots,
    anchors: committed ? anchors : [],
    sourceMaps: committed ? sourceMaps : [],
    artifacts: [],
    provenance: {
      entities: [...cacheProvenanceEntities.values()],
      activities: committed ? executionTrace.map((step) => ({
        activityId: step.activityId,
        runRef: step.runRef,
        planNodeRef: step.planNodeRef,
        stageId: step.stageId,
        invocationId: step.invocationId,
        function: step.function,
        orderKey: step.orderKey,
        activityType: step.functionInvoked === false ? "cache-materialization" : "transform-invocation",
        executionMode: step.executionMode || "fresh-transform",
        functionInvoked: step.functionInvoked !== false,
        ...(step.functionInvoked === false && step.cache?.cacheEntryId ? {
          cacheEntryRef: step.cache.cacheEntryId,
          evidenceRefs: step.cache.evidenceRefs || [],
        } : {}),
      })) : [],
      agents: [],
    },
    diagnostics,
    hashes: {
      ir: ir ? `fnv1a:${sourceHash(JSON.stringify(ir))}` : null,
      environment: "lab:web-worker:0.7-subset",
    },
    extensions: {
      "textabana.playground": {
        canonical: false,
        note: "Interaktiv Interop 0.7-subset med language-core 0.4 och typed IR lab-v2; använd inte som full profilkonformitet.",
        duration,
        ...(error ? { error } : {}),
      },
    },
  };
}

const moduleNamespacePattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/;
const moduleVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function sha256Digest(source) {
  if (!globalThis.crypto?.subtle) {
    const error = new Error("Säkra modulpaket kräver Web Crypto SHA-256 i hosten.");
    error.code = "TBA-MODULE-CRYPTO-LAB";
    throw error;
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function verifyModulePackages(modules, options) {
  if (!options.moduleLock && !modules.some((module) => module.manifest || module.digest)) return modules;
  if (options.moduleLock?.schema !== "textabana.module-lock/lab-v1" || !Array.isArray(options.moduleLock?.packages)) {
    const error = new Error("Säkra modulpaket kräver options.moduleLock.packages."); error.code = "TBA-MODULE-LOCK-LAB"; throw error;
  }
  const lock = new Map(options.moduleLock.packages.map((entry) => [`${entry.namespace}@${entry.version}`, entry]));
  if (lock.size !== options.moduleLock.packages.length) { const error = new Error("Lockfilen innehåller duplicerade paket."); error.code = "TBA-MODULE-LOCK-LAB"; throw error; }
  const grants = new Set(Array.isArray(options.capabilityGrants) ? options.capabilityGrants.map(String) : []);
  const seen = new Set();
  for (const moduleFile of modules) {
    const manifest = moduleFile.manifest;
    if (!manifest || manifest.schema !== "textabana.module-manifest/lab-v1") {
      const error = new Error(`Modulen ${moduleFile.path || "–"} saknar ett giltigt manifest.`); error.code = "TBA-MODULE-MANIFEST-LAB"; throw error;
    }
    const namespace = String(manifest.namespace || "");
    const version = String(manifest.version || "");
    const identity = `${namespace}@${version}`;
    if (!moduleNamespacePattern.test(namespace) || !moduleVersionPattern.test(version)) {
      const error = new Error(`Modulmanifestet har ogiltigt namespace eller version: ${identity}.`); error.code = "TBA-MODULE-IDENTITY-LAB"; throw error;
    }
    if (seen.has(identity)) { const error = new Error(`Modulpaketet ${identity} förekommer mer än en gång.`); error.code = "TBA-MODULE-DUPLICATE-LAB"; throw error; }
    seen.add(identity);
    if (normalizePath(String(manifest.entrypoint || "")) !== normalizePath(moduleFile.path)) {
      const error = new Error(`Modulpaketet ${identity} har en entrypoint som inte matchar transportens path.`); error.code = "TBA-MODULE-ENTRYPOINT-LAB"; throw error;
    }
    const actualDigest = await sha256Digest(String(moduleFile.content || ""));
    if (moduleFile.digest !== actualDigest || manifest.digest !== actualDigest) {
      const error = new Error(`Modulpaketet ${identity} matchar inte sitt SHA-256-digest.`); error.code = "TBA-MODULE-DIGEST-LAB"; throw error;
    }
    const locked = lock.get(identity);
    if (!locked || locked.digest !== actualDigest || normalizePath(locked.entrypoint) !== normalizePath(moduleFile.path)) {
      const error = new Error(`Lockfilen låser inte exakt ${identity}.`); error.code = "TBA-MODULE-LOCK-LAB"; throw error;
    }
    const capabilities = manifest.capabilities || {};
    if (!["required", "channels", "resources"].every((field) => Array.isArray(capabilities[field]))) {
      const error = new Error(`Modulpaketet ${identity} måste deklarera required, channel och resource capabilities.`); error.code = "TBA-MODULE-CAPABILITIES-LAB"; throw error;
    }
    const required = [...capabilities.required, ...capabilities.channels.map((name) => `channel:${name}`), ...capabilities.resources.map((name) => `resource:${name}`)];
    const denied = required.find((capability) => !grants.has(capability));
    if (denied) { const error = new Error(`Modulpaketet ${identity} saknar explicit grant för ${denied}.`); error.code = "TBA-MODULE-GRANT-LAB"; throw error; }
    if (!Array.isArray(manifest.functions) || manifest.functions.some((fn) => !fn?.name || !["pure", "run", "session"].includes(fn.state) || !["deterministic", "nondeterministic"].includes(fn.determinism) || !Array.isArray(fn.effects))) {
      const error = new Error(`Modulpaketet ${identity} måste deklarera function state, determinism och effects.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
    }
  }
  if (lock.size !== seen.size) { const error = new Error("Lockfilen innehåller paket som inte finns i transporten."); error.code = "TBA-MODULE-LOCK-LAB"; throw error; }
  return modules;
}

function verifyLoadedModuleContracts(modules, registry) {
  for (const moduleFile of modules.filter((item) => item.manifest)) {
    const declared = new Map(moduleFile.manifest.functions.map((fn) => [fn.name, fn]));
    const loaded = [...registry.values()].filter((entry) => entry.modulePath === moduleFile.path);
    if (loaded.length !== declared.size) {
      const error = new Error(`Modulpaketet ${moduleFile.manifest.namespace}@${moduleFile.manifest.version} exporterar inte exakt de låsta funktionerna.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
    }
    for (const entry of loaded) {
      const expected = declared.get(entry.name);
      const descriptor = entry.descriptor || {};
      if (!expected || expected.state !== descriptor.state || expected.determinism !== descriptor.determinism || JSON.stringify(expected.effects) !== JSON.stringify(descriptor.effects || [])) {
        const error = new Error(`Funktionen ${entry.name} avviker från det deklarerade modulmanifestet.`); error.code = "TBA-MODULE-FUNCTION-CONTRACT-LAB"; throw error;
      }
    }
  }
}

async function executeRun(payload) {
  const { runId, documentSource, modules = [], documentPath = "document.md", documentId = null, options = {}, editorSnapshot = null } = payload;
  runInstanceSequence += 1;
  const runInstanceId = `run-instance:${String(runInstanceSequence).padStart(6, "0")}`;
  const started = performance.now();
  const diagnostics = [];
  queuedRuns.delete(runId);
  activeRuns.add(runId);
  const runProfile = "fresh";
  moduleCache.clear();
  let runPolicyError = null;
  let runPolicy;
  try {
    runPolicy = normalizeRunPolicy(options);
  } catch (error) {
    runPolicyError = error;
    runPolicy = normalizeRunPolicy();
  }
  const runControl = createRunControl({
    policy: runPolicy,
    startedAt: started,
    now: () => performance.now(),
    isCancelled: () => cancelledRuns.has(runId),
    cancellationError,
  });
  const channelBus = createChannelBus({
    runId,
    runInstanceId,
    documentVersion: sourceHash(documentSource),
    documentPath,
    documentId,
    documentSource,
    strictChannels: Boolean(options.strictChannels),
    isCancelled: () => cancelledRuns.has(runId),
    runControl,
  });
  const registry = new Map();
  const loaded = new Set();
  let inspection = null;
  let plan = null;
  let invalidationPreview = null;
  let cacheTransaction = null;
  let semanticIdentity = null;
  try {
    if (runPolicyError) throw runPolicyError;
    channelBus.throwIfCancelled();
    if (options.semanticIdentity === true) {
      semanticIdentity = await createIdentityContext({ documentSource, documentPath, documentId,
        modules: modules.map((module) => ({ ...module, path: normalizePath(module.path) })), options, runPolicy, profile: runProfile });
    }
    const verifiedModules = await verifyModulePackages(modules, options);
    const parseResolution = editorSnapshot
      ? parseEditorSnapshot(editorSnapshot)
      : { parsed: parseDocument(documentSource, { documentPath, documentId }), reuse: "fresh" };
    const parsed = parseResolution.parsed;
    inspection = parsed.ir;
    if (semanticIdentity) semanticIdentity.ir = await identifyIR(semanticIdentity, inspection, documentSource);
    diagnostics.push(...parsed.diagnostics);
    if (!parsed.executable) {
      const primary = parsed.diagnostics[0];
      const error = new Error(primary?.message || "Dokumentet innehåller ett syntaxfel.");
      error.code = primary?.code || "TBA-PARSE-LAB";
      error.phase = "parsing";
      error.parseFailure = true;
      error.diagnostic = primary || null;
      throw error;
    }
    channelBus.throwIfCancelled();
    const normalizedModules = verifiedModules.map((module) => ({ ...module, path: normalizePath(module.path) }));
    if (new Set(normalizedModules.map((module) => module.path)).size !== normalizedModules.length) {
      throw new Error("Modulmanifestet innehåller duplicerade normaliserade sökvägar.");
    }
    const files = Object.fromEntries(normalizedModules.map((module) => [module.path, module.content]));
    const loading = new Set();
    const config = { scopeOrder: inspection.configuration.scopeOrder, documentPath };
    for (const directive of parsed.directives) {
      if (directive.kind === "IncludeDirective") await loadModule(directive.path, files, registry, loaded, loading);
    }
    verifyLoadedModuleContracts(normalizedModules, registry);
    channelBus.throwIfCancelled();
    const moduleSet = [...loaded].map((path) => ({
      path,
      digest: `fnv1a-lab:${sourceHash(String(files[path] || ""))}`,
      source: String(files[path] || ""),
    }));
    const compiled = compileExecutionGraph({
      program: parsed.program,
      documentSource,
      documentPath,
      ir: inspection,
      registry,
      config,
      runProfile,
      cacheRuntime: Boolean(editorSnapshot),
      moduleSet,
    });
    plan = compiled.plan;
    if (semanticIdentity) semanticIdentity.plan = await identifyPlan(semanticIdentity, plan, compiled.operations, [...loaded]);
    invalidationPreview = buildInvalidationPreview(plan, editorSnapshot?.previousPlanBaseline || null);
    cacheTransaction = createStageCacheTransaction({
      enabled: Boolean(editorSnapshot),
      store: editorSnapshot?.stageCacheBaseline || null,
      runId,
      runInstanceId,
      sessionId: editorSnapshot?.sessionId || null,
      documentRevision: editorSnapshot?.documentRevision ?? null,
      documentVersion: editorSnapshot?.documentVersion || null,
      retainedCandidateNodeIds: invalidationPreview.retainedCandidateNodeIds,
      planned: plan.graph.nodes.filter((node) => node.kind === "stage").length,
    });
    runControl.registerPlan(cacheTransaction.stats.planned);
    const output = await executeExecutionGraph(compiled, registry, diagnostics, channelBus, cacheTransaction, runControl);
    channelBus.throwIfCancelled();
    const channels = semanticIdentity ? structuredClone(channelBus.snapshot()) : channelBus.snapshot();
    const channelDescriptors = semanticIdentity ? structuredClone(channelBus.descriptorSnapshot()) : channelBus.descriptorSnapshot();
    const executionTrace = channelBus.traceSnapshot();
    const duration = performance.now() - started;
    let resultEnvelope = buildResultEnvelope({
      runId,
      runInstanceId,
      profile: runProfile,
      ok: true,
      output,
      diagnostics,
      channels,
      descriptors: channelDescriptors,
      anchors: channelBus.anchorSnapshot(),
      sourceMaps: channelBus.sourceMapSnapshot(),
      executionTrace,
      ir: inspection,
      duration,
    });
    const capabilities = buildCapabilities(inspection);
    if (semanticIdentity) {
      resultEnvelope = structuredClone(resultEnvelope);
      semanticIdentity.result = await identifyResult(semanticIdentity, resultEnvelope, plan, { channels, descriptors: channelDescriptors });
    }
    const adapterRun = runAdapters(resultEnvelope, options.adapters, capabilities.implemented);
    const conformanceReport = buildConformanceReport({
      fixtureId: String(options.fixtureId || "ad-hoc"),
      result: resultEnvelope,
      inspection,
      plan,
      executionTrace,
      adapterRun,
      capabilities,
      modules,
    });
    runControl.assertActive();
    activeRuns.delete(runId);
    cancelledRuns.delete(runId);
    const message = {
      ...(editorSnapshot ? { type: "run-result" } : {}),
      runId,
      requestId: payload.requestId || null,
      ok: true,
      output,
      channels,
      channelDescriptors,
      emissions: channelBus.size,
      diagnostics,
      inspection,
      plan,
      invalidationPreview,
      anchors: semanticIdentity ? resultEnvelope.anchors : channelBus.anchorSnapshot(),
      sourceMaps: semanticIdentity ? resultEnvelope.sourceMaps : channelBus.sourceMapSnapshot(),
      executionTrace,
      executionReport: null,
      executionStats: null,
      resultEnvelope,
      adapterRun,
      conformanceReport,
      capabilities,
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath, entry.moduleDigest)),
      ...(semanticIdentity ? { semanticIdentity } : {}),
      modulesLoaded: loaded.size,
      duration,
    };
    if (editorSnapshot) message.editorKernel = completeEditorRun(editorSnapshot, message, cacheTransaction);
    else finalizeStageCacheTransaction(cacheTransaction, { commit: false, currentStore: null, reason: "disabled" });
    message.executionReport = stageCacheExecutionReport(cacheTransaction, runControl.report());
    message.executionStats = message.executionReport.stats;
    synchronizeCommittedCacheTrace(message.executionTrace, message.executionReport);
    self.postMessage(message);
  } catch (error) {
    if (semanticIdentity) semanticIdentity.result = null;
    runControl.markError(error);
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = error?.code === cancellationDiagnosticCode;
    const diagnostic = error?.diagnostic || {
      diagnosticId: `diag:run:${runId}:${String(diagnostics.length + 1).padStart(3, "0")}`,
      code: error?.code || (cancelled ? cancellationDiagnosticCode : /include|Modulen|Cirkulär/.test(message) ? "TBA-RESOLVE-LAB" : /kanal|ChannelDescriptor|payload/.test(message) ? "TBA-TYPE-CHANNEL-LAB" : /okänd funktion/.test(message) ? "TBA-RUN-LAB" : /Rad|block|intervall|markör/.test(message) ? "TBA-PARSE-LAB" : "TBA-RUN-LAB"),
      severity: "error",
      level: "error",
      message,
      phase: error?.phase || "run",
      line: Number(message.match(/Rad (\d+)/)?.[1] || 1),
    };
    if (!diagnostics.includes(diagnostic)) diagnostics.push(diagnostic);
    const duration = performance.now() - started;
    const executionTrace = channelBus.traceSnapshot();
    if (!cacheTransaction) {
      cacheTransaction = createStageCacheTransaction({
        enabled: false,
        store: null,
        runId,
        runInstanceId,
        sessionId: editorSnapshot?.sessionId || null,
        documentRevision: editorSnapshot?.documentRevision ?? null,
        documentVersion: editorSnapshot?.documentVersion || null,
        planned: plan?.graph?.nodes?.filter((node) => node.kind === "stage").length || 0,
      });
      cacheTransaction.stats.executed = executionTrace.filter((step) => step.functionInvoked !== false).length;
    }
    const resultEnvelope = buildResultEnvelope({
      runId,
      runInstanceId,
      profile: runProfile,
      ok: false,
      status: cancelled ? "cancelled" : "failed",
      output: "",
      error: message,
      diagnostics,
      channels: {},
      descriptors: {},
      anchors: [],
      sourceMaps: [],
      executionTrace,
      ir: inspection,
      duration,
    });
    const capabilities = buildCapabilities(inspection);
    const adapterRun = runAdapters(resultEnvelope, options.adapters, capabilities.implemented);
    const conformanceReport = buildConformanceReport({
      fixtureId: String(options.fixtureId || "ad-hoc"),
      result: resultEnvelope,
      inspection,
      plan,
      executionTrace,
      adapterRun,
      capabilities,
      modules,
    });
    activeRuns.delete(runId);
    cancelledRuns.delete(runId);
    const resultMessage = {
      ...(editorSnapshot ? { type: "run-result" } : {}),
      runId,
      requestId: payload.requestId || null,
      ok: false,
      cancelled,
      output: "",
      error: message,
      diagnostics,
      channels: {},
      channelDescriptors: {},
      emissions: 0,
      inspection,
      plan,
      invalidationPreview,
      anchors: [],
      sourceMaps: [],
      executionTrace,
      executionReport: null,
      executionStats: null,
      resultEnvelope,
      adapterRun,
      conformanceReport,
      capabilities,
      ...(semanticIdentity ? { semanticIdentity } : {}),
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath, entry.moduleDigest)),
      modulesLoaded: loaded.size,
      duration,
    };
    if (editorSnapshot) resultMessage.editorKernel = completeEditorRun(editorSnapshot, resultMessage, cacheTransaction);
    else finalizeStageCacheTransaction(cacheTransaction, { commit: false, currentStore: null, reason: "disabled" });
    resultMessage.executionReport = stageCacheExecutionReport(cacheTransaction, runControl.report());
    resultMessage.executionStats = resultMessage.executionReport.stats;
    synchronizeCommittedCacheTrace(resultMessage.executionTrace, resultMessage.executionReport);
    self.postMessage(resultMessage);
  }
}

self.postEditorProtocolResponse = (payload, command, response) => {
  self.postMessage({
    type: "kernel-response",
    schema: "textabana.editor-kernel-response/lab-v1",
    protocol: "textabana.editor-kernel/lab-v1",
    requestId: payload.requestId || null,
    command,
    ok: true,
    ...response,
    capabilities: editorProtocolCapabilities(),
  });
};

function postEditorProtocolError(payload, command, error) {
  self.postMessage({
    type: "kernel-response",
    schema: "textabana.editor-kernel-response/lab-v1",
    protocol: "textabana.editor-kernel/lab-v1",
    requestId: payload.requestId || null,
    command,
    ok: false,
    error: {
      code: error?.code || "TBA-EDITOR-PROTOCOL-LAB",
      message: error instanceof Error ? error.message : String(error),
      details: serializableValue(error?.details || {}),
    },
    capabilities: editorProtocolCapabilities(),
  });
}

function postRejectedEditorRun(payload, error, includeEditorKernel = true) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic = {
    diagnosticId: `diag:editor-protocol:${payload.runId || "unknown"}`,
    code: error?.code || "TBA-EDITOR-PROTOCOL-LAB",
    severity: "error",
    level: "error",
    line: 1,
    message,
    phase: "editor-protocol",
  };
  const runtimeReport = rejectedRunPolicyReport();
  self.postMessage({
    ...(includeEditorKernel ? { type: "run-result" } : {}),
    runId: payload.runId,
    requestId: payload.requestId || null,
    ok: false,
    output: "",
    error: message,
    diagnostics: [diagnostic],
    channels: {},
    channelDescriptors: {},
    anchors: [],
    sourceMaps: [],
    inspection: null,
    plan: null,
    invalidationPreview: null,
    executionTrace: [],
    executionReport: {
      schema: "textabana.execution-report/lab-v1",
      mode: "fresh-cache-disabled",
      transactionState: "rejected",
      sessionId: null,
      documentRevision: null,
      verificationPolicy: "two-distinct-committed-revisions",
      nodeResolutions: [],
      stats: { planned: 0, executed: 0, reads: 0, hits: 0, misses: 0, reused: 0, bypassed: 0, observations: 0, observationAttempts: 0, verified: 0, writes: 0, writeAttempts: 0, quarantined: 0 },
      limits: { scope: "single-editor-session-memory", maxEntries: 128, maxValueBytes: 65536, maxTotalValueBytes: 1048576, maxWitnessBytes: 131072, maxQuarantines: 128, maxQuarantineBytes: 16777216, persistent: false, shared: false },
      ...runtimeReport,
    },
    executionStats: { planned: 0, executed: 0, reads: 0, hits: 0, misses: 0, reused: 0, bypassed: 0, observations: 0, observationAttempts: 0, verified: 0, writes: 0, writeAttempts: 0, quarantined: 0 },
    resultEnvelope: null,
    adapterRun: null,
    conformanceReport: null,
    capabilities: null,
    cancelled: false,
    emissions: 0,
    functions: [],
    modulesLoaded: 0,
    duration: 0,
    ...(includeEditorKernel ? { editorKernel: {
      schema: "textabana.editor-kernel-run/lab-v1",
      protocol: "textabana.editor-kernel/lab-v1",
      run: { runId: payload.runId, status: "rejected", committed: false, resultId: null },
      error: diagnostic,
      capabilities: editorProtocolCapabilities(),
      extensions: { "textabana.playground": { canonical: false, fullProfileConformance: false } },
    } } : {}),
  });
}

self.onmessage = (event) => {
  const payload = event.data || {};
  if (payload.type === "cancel") {
    const runId = payload.runId;
    const accepted = activeRuns.has(runId) || queuedRuns.has(runId);
    if (accepted) cancelledRuns.add(runId);
    if (payload.requestId) self.postEditorProtocolResponse(payload, "cancel", { runId, accepted });
    return Promise.resolve();
  }
  if (payload.type === "open") {
    try { self.postEditorProtocolResponse(payload, "open", openEditorDocument(payload)); }
    catch (error) { postEditorProtocolError(payload, "open", error); }
    return Promise.resolve();
  }
  if (payload.type === "change") {
    try { self.postEditorProtocolResponse(payload, "change", applyEditorChange(payload)); }
    catch (error) { postEditorProtocolError(payload, "change", error); }
    return Promise.resolve();
  }
  if (payload.type === "analyze") {
    try { self.postEditorProtocolResponse(payload, "analyze", analyzeEditorDocument(payload)); }
    catch (error) { postEditorProtocolError(payload, "analyze", error); }
    return Promise.resolve();
  }
  if (payload.type === "subscribe") {
    try { self.postEditorProtocolResponse(payload, "subscribe", subscribeEditorDocument(payload)); }
    catch (error) { postEditorProtocolError(payload, "subscribe", error); }
    return Promise.resolve();
  }
  if (payload.type === "credit") {
    try { self.postEditorProtocolResponse(payload, "credit", creditEditorSubscription(payload)); }
    catch (error) { postEditorProtocolError(payload, "credit", error); }
    return Promise.resolve();
  }
  if (payload.type === "cache-export") {
    try { self.postEditorProtocolResponse(payload, "cache-export", exportEditorCache(payload)); }
    catch (error) { postEditorProtocolError(payload, "cache-export", error); }
    return Promise.resolve();
  }
  if (payload.type === "cache-import") {
    try { self.postEditorProtocolResponse(payload, "cache-import", importEditorCache(payload)); }
    catch (error) { postEditorProtocolError(payload, "cache-import", error); }
    return Promise.resolve();
  }
  const editorRun = payload.type === "run";
  if (activeRuns.has(payload.runId) || queuedRuns.has(payload.runId)) {
    postRejectedEditorRun(payload, editorProtocolError(
      editorRun ? "TBA-EDITOR-RUN-ID-INFLIGHT-LAB" : "TBA-RUN-ID-INFLIGHT-LAB",
      `runId ${String(payload.runId)} används redan av en aktiv eller köad körning.`,
      { runId: payload.runId },
    ), editorRun);
    return Promise.resolve();
  }
  let runPayload = payload;
  if (editorRun) {
    try {
      const editorSnapshot = captureEditorRun(payload);
      runPayload = {
        ...payload,
        documentPath: editorSnapshot.path,
        documentSource: editorSnapshot.source,
        editorSnapshot,
      };
    } catch (error) {
      postRejectedEditorRun(payload, error);
      return Promise.resolve();
    }
  }
  queuedRuns.add(runPayload.runId);
  const task = runQueue.then(() => executeRun(runPayload));
  runQueue = task.catch(() => undefined);
  return task;
};
