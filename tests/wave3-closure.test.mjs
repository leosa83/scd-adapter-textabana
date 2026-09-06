import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  createStageCacheStore,
  exportStageCacheCheckpoint,
  importStageCacheCheckpoint,
  snapshotCacheValue,
} from "../runtime/stage-cache.js";

const workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");

function harness() {
  const messages = [];
  const context = vm.createContext({
    console, performance, TextEncoder, TextDecoder, structuredClone, Uint8Array,
    btoa, atob, setTimeout, clearTimeout,
    self: { postMessage(message) { messages.push(message); } },
  });
  vm.runInContext(workerSource, context);
  return {
    messages,
    async send(data) { await context.self.onmessage({ data }); return messages.at(-1); },
    response(requestId) { return messages.findLast((message) => message.requestId === requestId); },
  };
}

test("analyze reuses a compiled revision and the next edit reuses Lezer tree fragments", async () => {
  const h = harness();
  const source = "# Titel\n\nText";
  await h.send({ type: "open", requestId: "open", document: { documentId: "doc:incremental", path: "doc.md", source, documentRevision: 1 } });
  const first = await h.send({ type: "analyze", requestId: "analyze:1", documentId: "doc:incremental", documentRevision: 1 });
  assert.equal(first.analysis.reuse, "fresh");
  const same = await h.send({ type: "analyze", requestId: "analyze:2", documentId: "doc:incremental", documentRevision: 1 });
  assert.equal(same.analysis.reuse, "compiled-snapshot");
  await h.send({ type: "change", requestId: "change", documentId: "doc:incremental", baseRevision: 1, changes: [{ from: source.length, to: source.length, insert: " igen" }] });
  const changed = await h.send({ type: "analyze", requestId: "analyze:3", documentId: "doc:incremental", documentRevision: 2 });
  assert.equal(changed.analysis.reuse, "incremental-tree");
  assert.equal(changed.analysis.inspection.parser.incrementalReuse, true);
  assert.ok(changed.analysis.inspection.parser.reusedFragmentCount > 0);
});

test("stage cache checkpoints are digest-bound and portable across sessions", () => {
  const source = createStageCacheStore("session:a");
  source.version = 2;
  source.entries.set("node\u0000key", {
    schema: "textabana.stage-cache-entry/lab-v1",
    cacheEntryId: "cache-entry:test",
    semanticKey: "semantic:test",
    witness: "witness:test",
    output: snapshotCacheValue({ answer: 42 }),
    observations: [{ evidenceId: "evidence:1" }, { evidenceId: "evidence:2" }],
    verified: true,
  });
  const checkpoint = exportStageCacheCheckpoint(source);
  const restored = importStageCacheCheckpoint(checkpoint, "session:b");
  assert.equal(restored.sessionId, "session:b");
  assert.equal(restored.version, source.version);
  assert.equal(restored.entries.get("node\u0000key").verified, true);
  assert.throws(() => importStageCacheCheckpoint({ ...checkpoint, sourceVersion: 99 }, "session:c"), /digest/);
});

test("metadata stream is post-commit and credit bounded", async () => {
  const h = harness();
  const source = `>>>>! include "./module.js"\n>>>> emit\nA\nB\n<<<< emit`;
  const moduleFile = {
    path: "module.js",
    content: `define({ emit: { transform(input, _args, context) { String(input).trim().split("\\n").forEach((text, index) => context.system.out.line({ text }, { row: index + 1 })); return input; } } });`,
  };
  await h.send({ type: "open", requestId: "open:stream", document: { documentId: "doc:stream", path: "doc.md", source, documentRevision: 1 } });
  await h.send({ type: "subscribe", requestId: "subscribe:stream", documentId: "doc:stream", subscriptionId: "sub:stream", channels: ["system.out"], delivery: "stream", initialCredit: 1 });
  await h.send({ type: "run", requestId: "run:stream", runId: 900, documentId: "doc:stream", documentRevision: 1, modules: [moduleFile], options: {} });
  assert.equal(h.messages.filter((message) => message.type === "metadata-chunk").length, 1);
  const credit = await h.send({ type: "credit", requestId: "credit:stream", subscriptionId: "sub:stream", credit: 10 });
  assert.equal(credit.command, "credit");
  assert.equal(credit.pending, 0);
  const chunks = h.messages.filter((message) => message.type === "metadata-chunk");
  assert.equal(chunks.length, 2);
  assert.equal(chunks.at(-1).done, true);
});
