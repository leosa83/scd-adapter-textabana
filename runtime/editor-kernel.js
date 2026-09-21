import { canonicalJson, channelNamePattern, serializableValue, sourceHash, withoutKeys } from "./lab-values.js";
import { parseDocument } from "./parser.js";
import { createStageCacheStore, exportStageCacheCheckpoint, finalizeStageCacheTransaction, importStageCacheCheckpoint, snapshotStageCacheStore } from "./stage-cache.js";

/** Owns document, parser-cache and subscription state for one kernel instance.
 * The dispatcher supplies transport delivery and the active/queued-run guard.
 */
export function createEditorKernel({ postMessage, isRunBusy }) {
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
      throw editorProtocolError("TBA-EDITOR-DOCUMENT-NOT-OPEN-LAB", `Document “${documentId || ""}” is not open in the Editor Kernel.`);
    }
    return document;
  }

  function openEditorDocument(payload) {
    const input = payload.document && typeof payload.document === "object" ? payload.document : payload;
    const documentId = String(input.documentId || input.id || "").trim();
    const path = String(input.path || "document.md").trim();
    if (!documentId) throw editorProtocolError("TBA-EDITOR-DOCUMENT-ID-LAB", "open requires documentId.");
    if (!path) throw editorProtocolError("TBA-EDITOR-DOCUMENT-PATH-LAB", "open requires a document path.");
    const source = String(input.source ?? input.text ?? "");
    const revision = Number(input.documentRevision ?? input.revision ?? 1);
    if (revision !== 1) throw editorProtocolError("TBA-EDITOR-REVISION-LAB", "A new document session must open at revision 1.");
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
      throw editorProtocolError("TBA-EDITOR-CHANGESET-EMPTY-LAB", "change requires at least one text edit.");
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
          `Change ${index + 1} has an invalid half-open Unicode range [${from}, ${to}) for document length ${length}.`,
          { index, from, to, documentLength: length },
        );
      }
      return { from, to, insert, inputIndex: index };
    });
    for (let index = 1; index < changes.length; index += 1) {
      const previous = changes[index - 1];
      const current = changes[index];
      if (current.from < previous.from) {
        throw editorProtocolError("TBA-EDITOR-CHANGESET-ORDER-LAB", "ChangeSet ranges must be sorted in ascending order.");
      }
      if (current.from < previous.to || current.from === previous.from) {
        throw editorProtocolError("TBA-EDITOR-CHANGESET-OVERLAP-LAB", "ChangeSet ranges must not overlap or start at the same position.");
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
        `Editor Kernel accepts only coordinateUnit “unicode-code-point”; received “${coordinateUnit}”. No text was changed.`,
        { expectedCoordinateUnit: "unicode-code-point", receivedCoordinateUnit: coordinateUnit },
      );
    }
    const baseRevision = Number(payload.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision !== document.revision) {
      throw editorProtocolError(
        "TBA-EDITOR-STALE-REVISION-LAB",
        `ChangeSet is based on revision ${payload.baseRevision ?? "–"}, but the document session is at revision ${document.revision}. No text was changed.`,
        { expectedRevision: document.revision, receivedRevision: payload.baseRevision ?? null },
      );
    }
    if (payload.baseDocumentVersion && payload.baseDocumentVersion !== document.sourceVersion) {
      throw editorProtocolError(
        "TBA-EDITOR-STALE-VERSION-LAB",
        "ChangeSet baseDocumentVersion does not match the document session's current content. No text was changed.",
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
    if (!["snapshot-then-delta", "stream"].includes(delivery)) throw editorProtocolError("TBA-EDITOR-DELIVERY-LAB", `Invalid delivery mode “${delivery}”.`);
    const initialCredit = Number(payload.initialCredit ?? (delivery === "stream" ? 0 : 1));
    if (!Number.isInteger(initialCredit) || initialCredit < 0 || initialCredit > 1024) throw editorProtocolError("TBA-EDITOR-CREDIT-LAB", "initialCredit must be an integer between 0 and 1024.");
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
      postMessage({ type: "metadata-chunk", schema: "textabana.metadata-stream/lab-v1", subscriptionId: subscription.subscriptionId, ...chunk });
    }
    return delivered;
  }

  function creditEditorSubscription(payload) {
    const subscription = editorSubscriptions.get(String(payload.subscriptionId || ""));
    if (!subscription) throw editorProtocolError("TBA-EDITOR-SUBSCRIPTION-NOT-FOUND-LAB", "credit references an unknown subscription.");
    const credit = Number(payload.credit);
    if (!Number.isInteger(credit) || credit <= 0 || credit > 1024) throw editorProtocolError("TBA-EDITOR-CREDIT-LAB", "credit must be an integer between 1 and 1024.");
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
    if (isRunBusy()) throw editorProtocolError("TBA-EDITOR-CACHE-BUSY-LAB", "A cache checkpoint can be imported only when no runs are active or queued.");
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
        `run requested revision ${payload.documentRevision ?? payload.revision ?? "–"}, but the document session head is revision ${document.revision}.`,
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
        `analyze requested revision ${receivedRevision}, but the document session head is revision ${document.revision}.`,
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

  return { analyzeEditorDocument, applyEditorChange, captureEditorRun, completeEditorRun, creditEditorSubscription, editorProtocolCapabilities, editorProtocolError, exportEditorCache, importEditorCache, openEditorDocument, parseEditorSnapshot, subscribeEditorDocument };
}
