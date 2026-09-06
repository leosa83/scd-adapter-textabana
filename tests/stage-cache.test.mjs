import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneCacheValue,
  createStageCacheStore,
  createStageCacheTransaction,
  finalizeStageCacheTransaction,
  observeStageCache,
  recordStageResolution,
  resolveStageCache,
  snapshotCacheValue,
  stageCacheExecutionReport,
  stageCacheWitness,
} from "../runtime/stage-cache.js";

test("cache value snapshots preserve observable object-key order", () => {
  const snapshot = snapshotCacheValue({ b: 1, a: 2 });
  assert.equal(snapshot.ok, true, snapshot.detail);
  const clone = cloneCacheValue(snapshot);
  assert.equal(JSON.stringify(Object.keys(clone)), JSON.stringify(["b", "a"]));
  assert.equal(snapshotCacheValue(clone).wire, snapshot.wire);
});

test("cache value snapshots reject aliases and non-value-tree descriptors", () => {
  const shared = { value: 1 };
  assert.equal(snapshotCacheValue({ a: shared, b: shared }).ok, false);

  const hidden = {};
  Object.defineProperty(hidden, "secret", { value: "x", enumerable: false });
  assert.equal(snapshotCacheValue(hidden).ok, false);

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, configurable: true, get() { getterCalls += 1; return 1; } });
  assert.equal(snapshotCacheValue(accessor).ok, false);
  assert.equal(getterCalls, 0);

  const readonly = {};
  Object.defineProperty(readonly, "value", { value: 1, enumerable: true, writable: false, configurable: true });
  assert.equal(snapshotCacheValue(readonly).ok, false);

  const extendedArray = [1, 2];
  extendedArray.extra = true;
  assert.equal(snapshotCacheValue(extendedArray).ok, false);

  assert.equal(snapshotCacheValue(Object.freeze({ value: 1 })).ok, false);
  assert.equal(snapshotCacheValue(Object.preventExtensions({ value: 1 })).ok, false);
  assert.equal(snapshotCacheValue(Object.preventExtensions([1])).ok, false);
  assert.equal(snapshotCacheValue(new Proxy({ value: 1 }, {})).ok, false);
});

test("a concurrent cache transaction cannot commit over a newer store version", () => {
  const store = createStageCacheStore("session:test");
  const makeTransaction = (runId, documentRevision) => createStageCacheTransaction({
    enabled: true,
    store,
    runId,
    sessionId: "session:test",
    documentRevision,
    documentVersion: `version:${documentRevision}`,
    retainedCandidateNodeIds: ["node:one"],
    planned: 1,
  });
  const prepare = (transaction) => {
    const inputSnapshot = snapshotCacheValue("input");
    const witnessSnapshot = stageCacheWitness({ nodeId: "node:one", witnessBase: { stage: "one" }, inputSnapshot });
    assert.equal(witnessSnapshot.ok, true, witnessSnapshot.detail);
    const lookup = resolveStageCache(transaction, {
      nodeId: "node:one",
      semanticKey: "semantic:one",
      witness: witnessSnapshot.wire,
      eligibility: "candidate",
      inputSnapshot,
    });
    observeStageCache(transaction, lookup, snapshotCacheValue("output"));
    recordStageResolution(transaction, lookup.resolution);
  };
  const first = makeTransaction("run:one", 1);
  const concurrent = makeTransaction("run:two", 2);
  prepare(first);
  prepare(concurrent);

  const nextStore = finalizeStageCacheTransaction(first, { commit: true, currentStore: store });
  const unchangedStore = finalizeStageCacheTransaction(concurrent, { commit: true, currentStore: nextStore });

  assert.equal(nextStore.version, 1);
  assert.equal(unchangedStore, nextStore);
  assert.equal(concurrent.transactionState, "rolled-back-stale-cache-baseline");
  assert.equal(concurrent.stats.observations, 0);
  assert.equal(concurrent.stats.writes, 0);
  assert.equal(concurrent.resolutions[0].cache.write, false);
  assert.equal(concurrent.resolutions[0].cache.writePending, false);
  assert.equal(concurrent.resolutions[0].cache.evidence, 0);
  assert.equal(concurrent.resolutions[0].reason, "rolled-back-stale-cache-baseline-pending-discarded");
});

test("quarantine retention is bounded for a long-lived editor session", () => {
  const store = createStageCacheStore("session:bounded");
  for (let index = 0; index < 160; index += 1) {
    store.quarantined.set(`key:${index}`, { witness: `witness:${index}`, reason: "test" });
  }
  const transaction = createStageCacheTransaction({
    enabled: true,
    store,
    runId: "run:bounded",
    sessionId: "session:bounded",
    documentRevision: 1,
    documentVersion: "version:one",
  });
  const next = finalizeStageCacheTransaction(transaction, { commit: true, currentStore: store });
  const report = stageCacheExecutionReport(transaction);

  assert.equal(next.quarantined.size, 128);
  assert.equal(report.limits.maxQuarantines, 128);
  assert.equal(report.limits.maxQuarantineBytes, 128 * 128 * 1024);
});

test("commit telemetry counts only cache entries that remain visible after eviction", () => {
  const store = createStageCacheStore("session:eviction");
  const nodeIds = Array.from({ length: 129 }, (_, index) => `node:${index}`);
  const transaction = createStageCacheTransaction({
    enabled: true,
    store,
    runId: "run:eviction",
    sessionId: "session:eviction",
    documentRevision: 1,
    documentVersion: "version:eviction",
    retainedCandidateNodeIds: nodeIds,
    planned: nodeIds.length,
  });
  for (const nodeId of nodeIds) {
    const inputSnapshot = snapshotCacheValue(`input:${nodeId}`);
    const witnessSnapshot = stageCacheWitness({ nodeId, witnessBase: { nodeId }, inputSnapshot });
    const lookup = resolveStageCache(transaction, {
      nodeId,
      semanticKey: `semantic:${nodeId}`,
      witness: witnessSnapshot.wire,
      eligibility: "candidate",
      inputSnapshot,
    });
    observeStageCache(transaction, lookup, snapshotCacheValue(`output:${nodeId}`));
    recordStageResolution(transaction, lookup.resolution);
  }

  const next = finalizeStageCacheTransaction(transaction, { commit: true, currentStore: store });
  const report = stageCacheExecutionReport(transaction);
  const written = report.nodeResolutions.filter((resolution) => resolution.cache.write);
  const evicted = report.nodeResolutions.filter((resolution) => resolution.reason === "committed-write-evicted");

  assert.equal(next.entries.size, 128);
  assert.equal(report.stats.writeAttempts, 129);
  assert.equal(report.stats.observationAttempts, 129);
  assert.equal(report.stats.writes, 128);
  assert.equal(report.stats.observations, 128);
  assert.equal(written.length, 128);
  assert.equal(evicted.length, 1);
  assert.equal(evicted[0].cache.writePending, false);
  assert.equal(evicted[0].cache.evidence, 0);
  assert.equal(evicted[0].cache.cacheEntryId, null);
});

test("an FNV bucket collision cannot combine exact-witness observations or escape quarantine", () => {
  const witnessA = "Vv-Q(F%10SDJ";
  const witnessB = "3p/b1IB-*Ejm";
  const store = createStageCacheStore("session:collision");
  const transact = (currentStore, witness, revision, output = "output") => {
    const transaction = createStageCacheTransaction({
      enabled: true,
      store: currentStore,
      runId: `run:${revision}`,
      sessionId: "session:collision",
      documentRevision: revision,
      documentVersion: `version:${revision}`,
      retainedCandidateNodeIds: ["node:collision"],
      planned: 1,
    });
    const lookup = resolveStageCache(transaction, {
      nodeId: "node:collision",
      semanticKey: "semantic:collision",
      witness,
      eligibility: "candidate",
      inputSnapshot: snapshotCacheValue("input"),
    });
    if (!lookup.hit) observeStageCache(transaction, lookup, snapshotCacheValue(output));
    recordStageResolution(transaction, lookup.resolution);
    const nextStore = finalizeStageCacheTransaction(transaction, { commit: true, currentStore });
    return { transaction, lookup, nextStore };
  };

  const first = transact(store, witnessA, 1);
  const collision = transact(first.nextStore, witnessB, 2);
  const original = transact(collision.nextStore, witnessA, 3);

  assert.equal(collision.lookup.resolution.reason, "key-hash-collision");
  assert.equal(collision.transaction.stats.observations, 0);
  assert.equal(original.lookup.hit, false);
  assert.equal(original.lookup.resolution.cache.evidence, 2);
  assert.equal(original.transaction.stats.verified, 1);

  const quarantineFirst = transact(createStageCacheStore("session:collision"), witnessA, 11, "output-a");
  const quarantined = transact(quarantineFirst.nextStore, witnessA, 12, "output-b");
  const collisionAfterQuarantine = transact(quarantined.nextStore, witnessB, 13, "output-c");
  const repeatedCollision = transact(collisionAfterQuarantine.nextStore, witnessB, 14, "output-c");

  assert.equal(quarantined.nextStore.quarantined.size, 1);
  assert.equal(quarantined.nextStore.entries.size, 0);
  for (const collisionRun of [collisionAfterQuarantine, repeatedCollision]) {
    assert.equal(collisionRun.lookup.resolution.reason, "key-hash-collision");
    assert.equal(collisionRun.lookup.resolution.cache.evidence, 0);
    assert.equal(collisionRun.lookup.resolution.cache.writePending, false);
    assert.equal(collisionRun.transaction.stats.observationAttempts, 0);
    assert.equal(collisionRun.transaction.stats.observations, 0);
    assert.equal(collisionRun.transaction.stats.writes, 0);
    assert.equal(collisionRun.nextStore.entries.size, 0);
  }
});
