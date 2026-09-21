import assert from "node:assert/strict";
import test from "node:test";
import { createEditorKernel } from "../runtime/editor-kernel.js";
import { createModuleLoader } from "../runtime/module-loader.js";

test("kernel instances isolate revisions, parser reuse, subscriptions and busy guards", () => {
  let busy = false;
  const first = createEditorKernel({ postMessage() {}, isRunBusy: () => busy });
  const second = createEditorKernel({ postMessage() {}, isRunBusy: () => false });
  const open = (kernel, source) => kernel.openEditorDocument({ document: { documentId: "shared-id", path: "doc.md", source } });
  open(first, "A🌊");
  assert.throws(() => second.captureEditorRun({ documentId: "shared-id", documentRevision: 1 }), { code: "TBA-EDITOR-DOCUMENT-NOT-OPEN-LAB" });
  open(second, "B🌊");
  first.subscribeEditorDocument({ documentId: "shared-id", subscriptionId: "local", delivery: "stream" });
  assert.throws(() => second.creditEditorSubscription({ subscriptionId: "local", credit: 1 }), { code: "TBA-EDITOR-SUBSCRIPTION-NOT-FOUND-LAB" });
  first.analyzeEditorDocument({ documentId: "shared-id" });
  assert.equal(first.analyzeEditorDocument({ documentId: "shared-id" }).analysis.reuse, "compiled-snapshot");
  assert.equal(second.analyzeEditorDocument({ documentId: "shared-id" }).analysis.reuse, "fresh");
  first.applyEditorChange({ documentId: "shared-id", baseRevision: 1, changes: [{ range: { from: 0, to: 1 }, insert: "C" }] });
  assert.equal(first.captureEditorRun({ documentId: "shared-id", documentRevision: 2 }).source, "C🌊");
  assert.equal(second.captureEditorRun({ documentId: "shared-id", documentRevision: 1 }).source, "B🌊");
  const checkpoint = first.exportEditorCache({ documentId: "shared-id" }).checkpoint;
  busy = true;
  assert.throws(() => first.importEditorCache({ documentId: "shared-id", checkpoint }), { code: "TBA-EDITOR-CACHE-BUSY-LAB" });
  assert.equal(second.importEditorCache({ documentId: "shared-id", checkpoint }).status, "imported");
  busy = false;
  assert.equal(first.importEditorCache({ documentId: "shared-id", checkpoint }).status, "imported");
  open(first, "replacement");
  assert.throws(() => first.creditEditorSubscription({ subscriptionId: "local", credit: 1 }), { code: "TBA-EDITOR-SUBSCRIPTION-NOT-FOUND-LAB" });
  assert.equal(second.captureEditorRun({ documentId: "shared-id", documentRevision: 1 }).source, "B🌊");
});

test("loader caches belong to an instance and reset before fresh execution", async () => {
  const first = createModuleLoader(), second = createModuleLoader();
  const files = { "counter.js": "let n = 0; define({ count: { transform() { return ++n; } } });" };
  async function load(loader) {
    const registry = new Map();
    await loader.loadModule("counter.js", files, registry, new Set(), new Set());
    return registry.get("count").descriptor.transform;
  }
  const a = await load(first), b = await load(second);
  assert.equal(a(), 1);
  assert.equal((await load(first))(), 2);
  assert.equal(b(), 1);
  first.clear();
  assert.equal((await load(first))(), 1);
  assert.equal((await load(second))(), 2);
});
