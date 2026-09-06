const CACHE_SCHEMA = "textabana.stage-cache/lab-v1";
const REPORT_SCHEMA = "textabana.execution-report/lab-v1";
const MAX_ENTRY_BYTES = 64 * 1024;
const MAX_ENTRIES = 128;
const MAX_TOTAL_VALUE_BYTES = 1024 * 1024;
const MAX_WITNESS_BYTES = 128 * 1024;
const MAX_QUARANTINES = 128;

function hashSource(source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheValueNode(value, seen, path, rejectAliases) {
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} är inte ett ändligt tal.`);
    return ["number", Object.is(value, -0) ? "-0" : value];
  }
  if (value === undefined || ["bigint", "function", "symbol"].includes(typeof value)) {
    throw new Error(`${path} har den icke-cachebara typen ${typeof value}.`);
  }
  if (seen.has(value)) {
    throw new Error(rejectAliases
      ? `${path} innehåller en cyklisk eller delad objektreferens.`
      : `${path} innehåller en cyklisk objektreferens.`);
  }
  seen.add(value);
  const encodeComposite = () => {
    if (Array.isArray(value)) {
      if (!Object.isExtensible(value)) throw new Error(`${path} är en icke-extensibel array.`);
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${path} har en icke-standard arrayprototyp.`);
      if (Object.getOwnPropertySymbols(value).length) throw new Error(`${path} har symbolegenskaper.`);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const names = Object.getOwnPropertyNames(value);
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor
        || lengthDescriptor.get || lengthDescriptor.set
        || lengthDescriptor.enumerable || lengthDescriptor.configurable
        || !lengthDescriptor.writable || lengthDescriptor.value !== value.length) {
        throw new Error(`${path} har en icke-standard length-deskriptor.`);
      }
      for (const name of names) {
        if (name === "length") continue;
        const index = Number(name);
        if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== name) {
          throw new Error(`${path} har extra arrayegenskaper.`);
        }
      }
      const items = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) throw new Error(`${path} är en gles array.`);
        if (descriptor.get || descriptor.set
          || !descriptor.enumerable || !descriptor.writable || !descriptor.configurable) {
          throw new Error(`${path}[${index}] har en icke-standard egenskapsdeskriptor.`);
        }
        items.push(cacheValueNode(descriptor.value, seen, `${path}[${index}]`, rejectAliases));
      }
      return ["array", items];
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} är inte ett plain object.`);
    }
    if (!Object.isExtensible(value)) throw new Error(`${path} är ett icke-extensibelt objekt.`);
    if (Object.getOwnPropertySymbols(value).length) throw new Error(`${path} har symbolegenskaper.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.getOwnPropertyNames(value);
    const entries = [];
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (descriptor.get || descriptor.set) throw new Error(`${path}.${key} är en accessor.`);
      if (!descriptor.enumerable || !descriptor.writable || !descriptor.configurable) {
        throw new Error(`${path}.${key} har en icke-standard egenskapsdeskriptor.`);
      }
      entries.push([key, cacheValueNode(descriptor.value, seen, `${path}.${key}`, rejectAliases)]);
    }
    return [prototype === null ? "null-object" : "object", entries];
  };
  if (rejectAliases) return encodeComposite();
  try {
    return encodeComposite();
  } finally {
    seen.delete(value);
  }
}

function decodeCacheNode(node) {
  if (!Array.isArray(node) || typeof node[0] !== "string") throw new Error("Cachevärdet har en ogiltig typnod.");
  const [type, payload] = node;
  if (type === "null") return null;
  if (type === "string") {
    if (typeof payload !== "string") throw new Error("Cachevärdet har en ogiltig sträng.");
    return payload;
  }
  if (type === "boolean") {
    if (typeof payload !== "boolean") throw new Error("Cachevärdet har ett ogiltigt booleskt värde.");
    return payload;
  }
  if (type === "number") {
    if (payload === "-0") return -0;
    if (typeof payload !== "number" || !Number.isFinite(payload)) throw new Error("Cachevärdet har ett ogiltigt tal.");
    return payload;
  }
  if (type === "array") {
    if (!Array.isArray(payload)) throw new Error("Cachevärdet har en ogiltig array.");
    return payload.map(decodeCacheNode);
  }
  if (type === "object" || type === "null-object") {
    if (!Array.isArray(payload)) throw new Error("Cachevärdet har ett ogiltigt objekt.");
    const result = type === "null-object" ? Object.create(null) : {};
    const seenKeys = new Set();
    for (const entry of payload) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || seenKeys.has(entry[0])) {
        throw new Error("Cachevärdet har ogiltiga eller duplicerade objektnycklar.");
      }
      seenKeys.add(entry[0]);
      Object.defineProperty(result, entry[0], {
        value: decodeCacheNode(entry[1]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  throw new Error(`Cachevärdet har den okända typen ${type}.`);
}

function snapshotTypedValue(value, maxBytes, { rejectAliases = true } = {}) {
  try {
    const node = cacheValueNode(value, new WeakSet(), "värdet", rejectAliases);
    if (value && typeof value === "object") {
      if (typeof globalThis.structuredClone !== "function") throw new Error("Native structuredClone saknas i runtimevärden.");
      globalThis.structuredClone(value);
    }
    const wire = JSON.stringify(node);
    const bytes = new TextEncoder().encode(wire).byteLength;
    if (bytes > maxBytes) {
      return { ok: false, reason: "value-too-large", detail: `${bytes} bytes överskrider cachegränsen ${maxBytes}.` };
    }
    return {
      ok: true,
      wire,
      bytes,
      digest: `fnv1a-lab:${hashSource(wire)}`,
    };
  } catch (error) {
    return { ok: false, reason: "value-not-cacheable", detail: error instanceof Error ? error.message : String(error) };
  }
}

export function snapshotCacheValue(value) {
  return snapshotTypedValue(value, MAX_ENTRY_BYTES);
}

export function snapshotParallelValue(value) {
  return snapshotTypedValue(value, Number.POSITIVE_INFINITY);
}

function cloneTypedValue(snapshot, maxBytes, label) {
  if (!snapshot?.ok || typeof snapshot.wire !== "string") throw new Error(`${label} saknar en giltig wire-snapshot.`);
  if (`fnv1a-lab:${hashSource(snapshot.wire)}` !== snapshot.digest) throw new Error(`${label}s digest matchar inte dess wire-snapshot.`);
  const value = decodeCacheNode(JSON.parse(snapshot.wire));
  const roundTrip = snapshotTypedValue(value, maxBytes);
  if (!roundTrip.ok || roundTrip.wire !== snapshot.wire || roundTrip.digest !== snapshot.digest) {
    throw new Error(`${label} klarade inte lossless roundtrip-validering.`);
  }
  return value;
}

export function cloneCacheValue(snapshot) {
  return cloneTypedValue(snapshot, MAX_ENTRY_BYTES, "Cachevärdet");
}

export function cloneParallelValue(snapshot) {
  return cloneTypedValue(snapshot, Number.POSITIVE_INFINITY, "Parallellvärdet");
}

export function createStageCacheStore(sessionId) {
  return {
    schema: CACHE_SCHEMA,
    sessionId,
    version: 0,
    entries: new Map(),
    quarantined: new Map(),
  };
}

export function snapshotStageCacheStore(store) {
  if (!store) return null;
  return {
    schema: CACHE_SCHEMA,
    sessionId: store.sessionId,
    version: store.version,
    entries: new Map([...store.entries].map(([key, entry]) => [key, {
      ...entry,
      output: entry.output ? { ...entry.output } : null,
      observations: (entry.observations || []).map((observation) => ({ ...observation })),
    }])),
    quarantined: new Map([...store.quarantined].map(([key, entry]) => [key, { ...entry }])),
  };
}

export function createStageCacheTransaction({
  enabled,
  store,
  runId,
  runInstanceId = null,
  sessionId,
  documentRevision,
  documentVersion,
  retainedCandidateNodeIds = [],
  planned = 0,
}) {
  const baseline = enabled && store?.sessionId === sessionId ? snapshotStageCacheStore(store) : null;
  const active = Boolean(enabled && baseline);
  return {
    schema: "textabana.stage-cache-transaction/lab-v1",
    enabled: active,
    runId,
    runInstanceId,
    sessionId: sessionId || null,
    documentRevision: documentRevision ?? null,
    documentVersion: documentVersion || null,
    baseVersion: baseline?.version ?? null,
    baseline,
    retained: new Set(retainedCandidateNodeIds),
    pendingEntries: new Map(),
    pendingQuarantines: new Map(),
    resolutions: [],
    transactionState: active ? "pending" : "disabled",
    stats: {
      planned,
      executed: 0,
      reads: 0,
      hits: 0,
      misses: 0,
      reused: 0,
      bypassed: 0,
      observations: 0,
      observationAttempts: 0,
      verified: 0,
      writes: 0,
      writeAttempts: 0,
      quarantined: 0,
    },
  };
}

export function stageCacheWitness({ nodeId, witnessBase, inputSnapshot }) {
  if (!inputSnapshot?.ok) return { ok: false, reason: inputSnapshot?.reason || "input-not-cacheable", detail: inputSnapshot?.detail || null };
  return snapshotTypedValue(
    { nodeId, witnessBase, inputWire: inputSnapshot.wire },
    MAX_WITNESS_BYTES,
    { rejectAliases: false },
  );
}

function entryKey(nodeId, witness) {
  return `${nodeId}\u0000fnv1a-lab:${hashSource(witness)}:${witness.length}`;
}

function matchingQuarantine(entries, key, witness) {
  const quarantine = entries.get(key);
  return quarantine?.witness === witness ? quarantine : null;
}

function collidingQuarantine(entries, key, witness) {
  const quarantine = entries.get(key);
  return quarantine && quarantine.witness !== witness ? quarantine : null;
}

function baseResolution({ nodeId, semanticKey, eligibility }) {
  return {
    planNodeRef: nodeId,
    disposition: "executed",
    functionInvoked: true,
    lookup: "bypassed",
    reason: "cache-disabled",
    cache: {
      eligibility,
      semanticKey,
      inputDigest: null,
      cacheEntryId: null,
      outputDigest: null,
      evidenceRefs: [],
      evidenceRecords: [],
      read: false,
      hit: false,
      reused: false,
      write: false,
      writePending: false,
      observationAttempted: false,
      evidence: 0,
      verification: "unverified",
    },
  };
}

export function resolveStageCache(transaction, {
  nodeId,
  semanticKey,
  witness,
  witnessFailure = null,
  eligibility,
  inputSnapshot,
}) {
  const resolution = baseResolution({ nodeId, semanticKey, eligibility });
  resolution._cacheWitness = witness;
  resolution.cache.inputDigest = inputSnapshot?.ok ? inputSnapshot.digest : null;
  const result = { resolution, hit: false, output: null, key: witness ? entryKey(nodeId, witness) : null };
  if (!transaction.enabled) return result;
  if (eligibility !== "candidate") {
    resolution.reason = "contract-ineligible";
    transaction.stats.bypassed += 1;
    return result;
  }
  if (!inputSnapshot?.ok || !witness) {
    resolution.reason = !inputSnapshot?.ok
      ? inputSnapshot?.reason || "input-not-cacheable"
      : witnessFailure?.reason || "key-witness-unavailable";
    transaction.stats.bypassed += 1;
    return result;
  }
  if (!transaction.retained.has(nodeId)) {
    resolution.reason = "not-retained-by-invalidation";
    transaction.stats.bypassed += 1;
    return result;
  }
  resolution.cache.read = true;
  transaction.stats.reads += 1;
  const key = result.key;
  if (collidingQuarantine(transaction.baseline.quarantined, key, witness)) {
    resolution.lookup = "miss";
    resolution.reason = "key-hash-collision";
    resolution._cacheCollision = true;
    transaction.stats.misses += 1;
    return result;
  }
  if (matchingQuarantine(transaction.baseline.quarantined, key, witness)) {
    resolution.lookup = "miss";
    resolution.reason = "quarantined";
    transaction.stats.misses += 1;
    return result;
  }
  const entry = transaction.baseline.entries.get(key);
  if (entry && entry.witness !== witness) {
    resolution.lookup = "miss";
    resolution.reason = "key-hash-collision";
    resolution._cacheCollision = true;
    transaction.stats.misses += 1;
    return result;
  }
  if (!entry || entry.semanticKey !== semanticKey) {
    resolution.lookup = "miss";
    resolution.reason = "no-entry";
    transaction.stats.misses += 1;
    return result;
  }
  resolution.cache.evidence = entry.observations.length;
  resolution.cache.cacheEntryId = entry.cacheEntryId;
  resolution.cache.outputDigest = entry.output?.digest || null;
  resolution.cache.evidenceRefs = entry.observations.map((observation) => observation.evidenceId);
  resolution.cache.evidenceRecords = entry.observations.map((observation) => ({ ...observation }));
  resolution.cache.verification = entry.verified ? "verified-by-two-observations" : "probation";
  if (!entry.verified) {
    resolution.lookup = "miss";
    resolution.reason = "probation";
    transaction.stats.misses += 1;
    return result;
  }
  try {
    result.output = cloneCacheValue(entry.output);
  } catch (error) {
    resolution.lookup = "miss";
    resolution.reason = "entry-validation-failed";
    transaction.stats.misses += 1;
    transaction.pendingQuarantines.set(key, {
      nodeId,
      semanticKey,
      witness,
      reason: error instanceof Error ? error.message : String(error),
    });
    resolution._cacheEntryKey = key;
    resolution.cache.writePending = true;
    transaction.stats.writeAttempts += 1;
    return result;
  }
  resolution.disposition = "reused";
  resolution.functionInvoked = false;
  resolution.lookup = "hit";
  resolution.reason = "verified-entry";
  resolution.cache.hit = true;
  resolution.cache.reused = true;
  transaction.stats.hits += 1;
  transaction.stats.reused += 1;
  result.hit = true;
  return result;
}

export function observeStageCache(transaction, lookup, outputSnapshot) {
  const { resolution, key } = lookup;
  if (!transaction.enabled || resolution.cache.eligibility !== "candidate" || !key) return;
  if (resolution._cacheCollision) return;
  const witness = resolution._cacheWitness;
  if (collidingQuarantine(transaction.baseline.quarantined, key, witness)
    || collidingQuarantine(transaction.pendingQuarantines, key, witness)) {
    resolution.reason = "key-hash-collision";
    resolution._cacheCollision = true;
    return;
  }
  if (matchingQuarantine(transaction.baseline.quarantined, key, witness)
    || matchingQuarantine(transaction.pendingQuarantines, key, witness)) {
    resolution.reason = "quarantined";
    resolution.cache.verification = "quarantined";
    return;
  }
  if (!outputSnapshot?.ok) {
    resolution.reason = outputSnapshot?.reason || "output-not-cacheable";
    return;
  }
  const pendingEntry = transaction.pendingEntries.get(key);
  const baselineEntry = transaction.baseline.entries.get(key);
  if ((pendingEntry && pendingEntry.witness !== witness) || (baselineEntry && baselineEntry.witness !== witness)) {
    resolution.reason = "key-hash-collision";
    resolution._cacheCollision = true;
    return;
  }
  const existing = pendingEntry || baselineEntry || {
    schema: "textabana.stage-cache-entry/lab-v1",
    nodeId: resolution.planNodeRef,
    semanticKey: resolution.cache.semanticKey,
    witness,
    cacheEntryId: `cache-entry:${encodeURIComponent(resolution.planNodeRef)}:${hashSource(witness)}:${witness.length}`,
    output: { ...outputSnapshot },
    observations: [],
    verified: false,
  };
  if (existing.output && (existing.output.wire !== outputSnapshot.wire || existing.output.digest !== outputSnapshot.digest)) {
    transaction.pendingEntries.delete(key);
    transaction.pendingQuarantines.set(key, {
      nodeId: resolution.planNodeRef,
      semanticKey: resolution.cache.semanticKey,
      witness: existing.witness,
      reason: "output-mismatch-between-observations",
    });
    resolution.reason = "output-mismatch-quarantined";
    resolution.cache.verification = "quarantined";
    resolution._cacheEntryKey = key;
    resolution.cache.writePending = true;
    transaction.stats.writeAttempts += 1;
    return;
  }
  const sameRevision = existing.observations.some((observation) => observation.documentRevision === transaction.documentRevision);
  const evidenceRunRef = transaction.runInstanceId || `run:${transaction.runId}`;
  const observations = sameRevision ? existing.observations : [
    ...existing.observations,
    {
      documentRevision: transaction.documentRevision,
      documentVersion: transaction.documentVersion,
      outputDigest: outputSnapshot.digest,
      runRef: evidenceRunRef,
      evidenceId: `cache-observation:${encodeURIComponent(evidenceRunRef)}:${encodeURIComponent(resolution.planNodeRef)}:${encodeURIComponent(outputSnapshot.digest)}`,
    },
  ];
  if (sameRevision) {
    resolution.cache.evidence = observations.length;
    resolution.cache.cacheEntryId = existing.cacheEntryId;
    resolution.cache.outputDigest = outputSnapshot.digest;
    resolution.cache.evidenceRefs = observations.map((observation) => observation.evidenceId);
    resolution.cache.evidenceRecords = observations.map((observation) => ({ ...observation }));
    resolution.cache.verification = existing.verified ? "verified-by-two-observations" : "probation";
    resolution.cache.write = false;
    resolution.reason = "same-revision-observation-ignored";
    return;
  }
  transaction.stats.observationAttempts += 1;
  const verified = observations.length >= 2;
  transaction.pendingEntries.set(key, {
    ...existing,
    output: { ...outputSnapshot },
    observations: observations.slice(-2),
    verified,
    lastRunId: transaction.runId,
  });
  resolution.cache.evidence = observations.length;
  resolution.cache.cacheEntryId = existing.cacheEntryId;
  resolution.cache.outputDigest = outputSnapshot.digest;
  resolution.cache.evidenceRefs = observations.map((observation) => observation.evidenceId);
  resolution.cache.evidenceRecords = observations.map((observation) => ({ ...observation }));
  resolution.cache.verification = verified ? "verified-by-two-observations" : "probation";
  resolution._cacheEntryKey = key;
  resolution.cache.writePending = true;
  resolution.cache.observationAttempted = true;
  transaction.stats.writeAttempts += 1;
  resolution.reason = verified ? "second-observation-pending" : "first-observation-pending";
}

export function recordStageResolution(transaction, resolution) {
  transaction.resolutions.push(resolution);
}

function evictEntries(entries) {
  const totalBytes = () => [...entries.values()].reduce((sum, entry) => sum + Number(entry.output?.bytes || 0), 0);
  while (entries.size > MAX_ENTRIES || totalBytes() > MAX_TOTAL_VALUE_BYTES) entries.delete(entries.keys().next().value);
  return entries;
}

function evictQuarantines(entries) {
  while (entries.size > MAX_QUARANTINES) entries.delete(entries.keys().next().value);
  return entries;
}

export function finalizeStageCacheTransaction(transaction, { commit, currentStore, reason = null }) {
  const discardPendingWrites = (discardReason = reason) => {
    for (const resolution of transaction.resolutions) {
      resolution.cache.write = false;
      if (!resolution.cache.writePending) continue;
      const committedEntry = transaction.baseline?.entries.get(resolution._cacheEntryKey);
      const committedEvidence = committedEntry?.observations?.length || 0;
      resolution.cache.evidence = committedEvidence;
      resolution.cache.cacheEntryId = committedEntry?.cacheEntryId || null;
      resolution.cache.outputDigest = committedEntry?.output?.digest || null;
      resolution.cache.evidenceRefs = committedEntry?.observations?.map((observation) => observation.evidenceId) || [];
      resolution.cache.evidenceRecords = committedEntry?.observations?.map((observation) => ({ ...observation })) || [];
      resolution.cache.verification = committedEntry?.verified
        ? "verified-by-two-observations"
        : committedEvidence
          ? "probation"
          : "unverified";
      resolution.cache.writePending = false;
      resolution.reason = discardReason ? `${discardReason}-pending-discarded` : "pending-discarded";
    }
    transaction.stats.observations = 0;
    transaction.stats.verified = 0;
    transaction.stats.writes = 0;
    transaction.stats.quarantined = 0;
  };
  if (!transaction.enabled) {
    transaction.transactionState = "disabled";
    return currentStore;
  }
  if (!commit) {
    discardPendingWrites();
    transaction.transactionState = reason || "rolled-back";
    return currentStore;
  }
  if (!currentStore || currentStore.sessionId !== transaction.sessionId) {
    discardPendingWrites("rolled-back-session-replaced");
    transaction.transactionState = "rolled-back-session-replaced";
    return currentStore;
  }
  if (currentStore.version !== transaction.baseVersion) {
    discardPendingWrites("rolled-back-stale-cache-baseline");
    transaction.transactionState = "rolled-back-stale-cache-baseline";
    return currentStore;
  }
  const next = snapshotStageCacheStore(currentStore);
  const verifiedCandidates = new Set();
  for (const [key, quarantine] of transaction.pendingQuarantines) {
    next.entries.delete(key);
    next.quarantined.set(key, { ...quarantine, runId: transaction.runId });
  }
  for (const [key, entry] of transaction.pendingEntries) {
    if (next.quarantined.has(key)) continue;
    const previous = next.entries.get(key);
    next.entries.delete(key);
    next.entries.set(key, {
      ...entry,
      output: { ...entry.output },
      observations: entry.observations.map((observation) => ({ ...observation })),
    });
    if (entry.verified && !previous?.verified) verifiedCandidates.add(key);
  }
  evictEntries(next.entries);
  evictQuarantines(next.quarantined);
  const committedEntryKeys = new Set([...transaction.pendingEntries]
    .filter(([key, entry]) => next.entries.get(key)?.witness === entry.witness)
    .map(([key]) => key));
  const committedQuarantineKeys = new Set([...transaction.pendingQuarantines]
    .filter(([key, quarantine]) => next.quarantined.get(key)?.witness === quarantine.witness)
    .map(([key]) => key));
  transaction.stats.observations = committedEntryKeys.size;
  transaction.stats.quarantined = committedQuarantineKeys.size;
  transaction.stats.writes = committedEntryKeys.size + committedQuarantineKeys.size;
  transaction.stats.verified = [...verifiedCandidates].filter((key) => committedEntryKeys.has(key)).length;
  for (const resolution of transaction.resolutions) {
    if (!resolution.cache.writePending) continue;
    const committed = committedEntryKeys.has(resolution._cacheEntryKey)
      || committedQuarantineKeys.has(resolution._cacheEntryKey);
    if (committed) {
      resolution.cache.write = true;
    } else {
      resolution.cache.write = false;
      resolution.cache.evidence = 0;
      resolution.cache.cacheEntryId = null;
      resolution.cache.outputDigest = null;
      resolution.cache.evidenceRefs = [];
      resolution.cache.evidenceRecords = [];
      resolution.cache.verification = "unverified";
      resolution.reason = "committed-write-evicted";
    }
    resolution.cache.writePending = false;
  }
  next.version += transaction.stats.writes > 0 ? 1 : 0;
  transaction.transactionState = "committed";
  return next;
}

export function stageCacheExecutionReport(transaction, runtimeReport = {}) {
  return {
    schema: REPORT_SCHEMA,
    mode: transaction.enabled ? "editor-session-verified-cache" : "fresh-cache-disabled",
    transactionState: transaction.transactionState,
    sessionId: transaction.sessionId,
    documentRevision: transaction.documentRevision,
    verificationPolicy: "two-distinct-committed-revisions",
    nodeResolutions: transaction.resolutions.map((resolution) => {
      const publicResolution = { ...resolution };
      delete publicResolution._cacheEntryKey;
      delete publicResolution._cacheWitness;
      delete publicResolution._cacheCollision;
      return { ...publicResolution, cache: { ...resolution.cache } };
    }),
    stats: { ...transaction.stats },
    limits: {
      scope: "single-editor-session-memory",
      maxEntries: MAX_ENTRIES,
      maxValueBytes: MAX_ENTRY_BYTES,
      maxTotalValueBytes: MAX_TOTAL_VALUE_BYTES,
      maxWitnessBytes: MAX_WITNESS_BYTES,
      maxQuarantines: MAX_QUARANTINES,
      maxQuarantineBytes: MAX_QUARANTINES * MAX_WITNESS_BYTES,
      persistent: false,
      shared: false,
    },
    ...(runtimeReport.scheduling ? { scheduling: runtimeReport.scheduling } : {}),
    ...(runtimeReport.resources ? { resources: runtimeReport.resources } : {}),
  };
}
