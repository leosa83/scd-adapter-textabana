import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");

function createHarness() {
  const messages = [];
  const context = vm.createContext({
    console,
    performance,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa,
    atob,
    setTimeout,
    clearTimeout,
    self: { postMessage(message) { messages.push(message); } },
  });
  vm.runInContext(workerSource, context);
  return {
    messages,
    async send(data) {
      await context.self.onmessage({ data });
      return messages.at(-1);
    },
    sendWithoutWaiting(data) {
      return context.self.onmessage({ data });
    },
    response(requestId) {
      return messages.findLast((message) => message.requestId === requestId);
    },
    runResult(runId) {
      return messages.findLast((message) => message.type === "run-result" && message.runId === runId);
    },
  };
}

const rowModule = {
  path: "modules/rows.js",
  content: `define({
    collect: {
      channels: {
        records: {
          payloadKind: "object", mediaType: "application/json", schemaRef: "schema:rows/v1",
          delivery: "snapshot", persistence: "durable", ordering: "global-sequence",
          key: ["payload.rowId"], schema: { type: "object", required: ["rowId", "text"] }
        }
      },
      transform(input, _args, context) {
        String(input).trim().split("\\n").filter(Boolean).forEach((line, index) => {
          const split = line.indexOf("|");
          const rowId = line.slice(0, split);
          const text = line.slice(split + 1);
          const payload = { rowId, text };
          const location = { row: index + 1, rowId, rowSet: "claims", lineOffset: index, kind: "claim" };
          context.system.out.row(rowId, payload, location);
          context.emit("records", payload, location);
        });
        return input;
      }
    }
  });`,
};

const lineModule = {
  path: "modules/lines.js",
  content: `define({
    observe_lines: {
      transform(input, _args, context) {
        String(input).trim().split("\\n").filter(Boolean).forEach((text, index) => {
          context.system.out.line({ text }, { row: index + 1, lineOffset: index, kind: "observation" });
        });
        return input;
      }
    }
  });`,
};

function rowDocument(rows) {
  return `>>>>! include "./modules/rows.js"\n>>>> collect\n${rows.join("\n")}\n<<<< collect`;
}

function lineDocument(rows) {
  return `>>>>! include "./modules/lines.js"\n>>>> observe_lines\n${rows.join("\n")}\n<<<< observe_lines`;
}

async function openAndSubscribe(harness, source, channels = ["system.out"]) {
  const opened = await harness.send({
    type: "open",
    requestId: "open:1",
    document: { documentId: "doc:test", path: "document.md", source, documentRevision: 1 },
  });
  assert.equal(opened.ok, true);
  assert.equal(opened.status, "opened");
  assert.equal(opened.document.documentRevision, 1);
  const subscribed = await harness.send({
    type: "subscribe",
    requestId: "subscribe:1",
    documentId: "doc:test",
    subscriptionId: "subscription:test",
    channels,
  });
  assert.equal(subscribed.status, "subscribed");
  return opened;
}

async function runRevision(harness, runId, revision, modules = []) {
  await harness.send({
    type: "run",
    requestId: `run:${runId}`,
    runId,
    documentId: "doc:test",
    documentRevision: revision,
    modules,
    options: { strictChannels: true },
  });
  return harness.runResult(runId);
}

async function replaceDocument(harness, requestId, baseRevision, before, after) {
  return harness.send({
    type: "change",
    requestId,
    documentId: "doc:test",
    baseRevision,
    changes: [{ range: { from: 0, to: Array.from(before).length }, insert: after }],
  });
}

test("open, Unicode change and revision guards form one atomic document protocol", async () => {
  const harness = createHarness();
  await openAndSubscribe(harness, "A😀B");

  const changed = await harness.send({
    type: "change",
    requestId: "change:unicode",
    documentId: "doc:test",
    baseRevision: 1,
    changes: [{ range: { from: 2, to: 3 }, insert: "C" }],
  });
  assert.equal(changed.ok, true);
  assert.equal(changed.status, "accepted");
  assert.equal(changed.document.documentRevision, 2);
  assert.equal(changed.change.coordinateUnit, "unicode-code-point");

  const stale = await harness.send({
    type: "change",
    requestId: "change:stale",
    documentId: "doc:test",
    baseRevision: 1,
    changes: [{ range: { from: 0, to: 1 }, insert: "X" }],
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "TBA-EDITOR-STALE-REVISION-LAB");
  assert.equal(stale.error.details.expectedRevision, 2);

  const noOp = await harness.send({
    type: "change",
    requestId: "change:no-op",
    documentId: "doc:test",
    baseRevision: 2,
    changes: [{ range: { from: 2, to: 3 }, insert: "C" }],
  });
  assert.equal(noOp.status, "unchanged");
  assert.equal(noOp.document.documentRevision, 2);

  const run = await runRevision(harness, 1, 2);
  assert.equal(run.ok, true, run.error);
  assert.equal(run.output, "A😀C");
  assert.equal(run.editorKernel.evaluatedSnapshot.documentRevision, 2);
  assert.equal(run.editorKernel.capabilities.parseMode, "full-document");
  assert.equal(run.editorKernel.capabilities.executionMode, "full-fresh-run");
});

test("invalid or overlapping ChangeSets never mutate the document head", async () => {
  const harness = createHarness();
  await openAndSubscribe(harness, "abcdef");
  const overlap = await harness.send({
    type: "change",
    requestId: "change:overlap",
    documentId: "doc:test",
    baseRevision: 1,
    changes: [
      { range: { from: 0, to: 3 }, insert: "A" },
      { range: { from: 2, to: 4 }, insert: "B" },
    ],
  });
  assert.equal(overlap.ok, false);
  assert.equal(overlap.error.code, "TBA-EDITOR-CHANGESET-OVERLAP-LAB");

  const outOfRange = await harness.send({
    type: "change",
    requestId: "change:range",
    documentId: "doc:test",
    baseRevision: 1,
    changes: [{ range: { from: 0, to: 99 }, insert: "X" }],
  });
  assert.equal(outOfRange.ok, false);
  assert.equal(outOfRange.error.code, "TBA-EDITOR-RANGE-LAB");

  const unsorted = await harness.send({
    type: "change",
    requestId: "change:order",
    documentId: "doc:test",
    baseRevision: 1,
    changes: [
      { range: { from: 4, to: 5 }, insert: "X" },
      { range: { from: 0, to: 1 }, insert: "Y" },
    ],
  });
  assert.equal(unsorted.ok, false);
  assert.equal(unsorted.error.code, "TBA-EDITOR-CHANGESET-ORDER-LAB");

  const run = await runRevision(harness, 2, 1);
  assert.equal(run.output, "abcdef");
  assert.equal(run.editorKernel.session.documentRevision, 1);
});

test("metadata delta partitions added, moved, changed, removed and unchanged by stable identity", async () => {
  const harness = createHarness();
  const before = rowDocument(["a|Alpha", "b|Beta", "c|Gamma", "d|Delta"]);
  const after = rowDocument(["x|Xi", "a|Alpha", "c|Gamma updated", "d|Delta"]);
  await openAndSubscribe(harness, before);

  const initial = await runRevision(harness, 3, 1, [rowModule]);
  assert.equal(initial.ok, true, initial.error);
  assert.equal(initial.editorKernel.metadataDelta.mode, "initial-snapshot");
  assert.equal(initial.editorKernel.metadataDelta.summary.added, 4);

  const change = await replaceDocument(harness, "change:rows", 1, before, after);
  assert.equal(change.status, "accepted");
  const current = await runRevision(harness, 4, 2, [rowModule]);
  const delta = current.editorKernel.metadataDelta;
  assert.deepEqual(
    { added: delta.summary.added, moved: delta.summary.moved, changed: delta.summary.changed, removed: delta.summary.removed, unchanged: delta.summary.unchanged },
    { added: 1, moved: 1, changed: 1, removed: 1, unchanged: 1 },
  );
  assert.equal(delta.collections.added[0].target.rowId, "x");
  assert.equal(delta.collections.moved[0].after.target.rowId, "a");
  assert.equal(delta.collections.changed[0].after.target.rowId, "c");
  assert.equal(delta.collections.removed[0].target.rowId, "b");
  assert.equal(delta.collections.unchanged[0].target.rowId, "d");
  assert.equal(delta.anchorContinuity.transitions.some((item) => item.status === "moved" && item.to?.rowId === "a"), true);
});

test("line anchors relink only on a unique quote and expose ambiguity separately", async () => {
  const harness = createHarness();
  const before = lineDocument(["Unik observation"]);
  const shifted = lineDocument(["Ny ingress", "Unik observation"]);
  await openAndSubscribe(harness, before);
  await runRevision(harness, 5, 1, [lineModule]);
  await replaceDocument(harness, "change:shift", 1, before, shifted);
  const relinked = await runRevision(harness, 6, 2, [lineModule]);
  const unique = relinked.editorKernel.metadataDelta.anchorContinuity.transitions.find((item) => item.from?.quote === "Unik observation");
  assert.equal(unique.status, "relinked");
  assert.equal(unique.method, "unique-text-quote+origin");

  const ambiguousSource = lineDocument(["Unik observation", "Unik observation"]);
  await replaceDocument(harness, "change:ambiguous", 2, shifted, ambiguousSource);
  const ambiguous = await runRevision(harness, 7, 3, [lineModule]);
  const transition = ambiguous.editorKernel.metadataDelta.anchorContinuity.transitions.find((item) => item.status === "ambiguous");
  assert.ok(transition, "expected an explicit ambiguous transition");
  assert.equal(transition.candidates.length, 2);
  assert.equal(transition.to, null);
});

test("failed runs publish an empty delta and preserve the last successful baseline", async () => {
  const harness = createHarness();
  const revisionOne = rowDocument(["a|Alpha"]);
  const broken = ">>>> missing_function\nNever commit\n<<<< missing_function";
  const revisionThree = rowDocument(["a|Alpha", "x|Xi"]);
  await openAndSubscribe(harness, revisionOne);
  await runRevision(harness, 8, 1, [rowModule]);

  await replaceDocument(harness, "change:broken", 1, revisionOne, broken);
  const failed = await runRevision(harness, 9, 2, [rowModule]);
  assert.equal(failed.ok, false);
  assert.equal(failed.editorKernel.metadataDelta.mode, "not-committed");
  assert.equal(JSON.stringify(failed.editorKernel.metadataDelta.summary), JSON.stringify({ added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0 }));

  await replaceDocument(harness, "change:fixed", 2, broken, revisionThree);
  const recovered = await runRevision(harness, 10, 3, [rowModule]);
  assert.equal(recovered.ok, true, recovered.error);
  assert.equal(recovered.editorKernel.metadataDelta.basis.documentRevision, 1);
  assert.equal(recovered.editorKernel.metadataDelta.target.documentRevision, 3);
  assert.equal(recovered.editorKernel.metadataDelta.summary.added, 1);
  assert.equal(recovered.editorKernel.metadataDelta.summary.unchanged, 1);
});

test("subscription filters delta delivery without changing the complete core result", async () => {
  const harness = createHarness();
  const source = rowDocument(["a|Alpha", "b|Beta"]);
  await openAndSubscribe(harness, source, ["system.out"]);
  const result = await runRevision(harness, 11, 1, [rowModule]);
  assert.deepEqual(Object.keys(result.channels), ["system.out", "records"]);
  assert.equal(result.editorKernel.subscription.channels[0], "system.out");
  assert.equal(result.editorKernel.metadataDelta.summary.added, 2);
  assert.equal(result.editorKernel.metadataDelta.collections.added.every((item) => item.channel === "system.out"), true);
});

test("a stale run is rejected before execution and the current revision remains runnable", async () => {
  const harness = createHarness();
  const before = "old";
  const after = "new";
  await openAndSubscribe(harness, before);
  await replaceDocument(harness, "change:new", 1, before, after);
  const rejected = await runRevision(harness, 14, 1);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.resultEnvelope, null);
  assert.equal(rejected.diagnostics[0].code, "TBA-EDITOR-RUN-REVISION-LAB");
  assert.equal(rejected.editorKernel.run.status, "rejected");

  const accepted = await runRevision(harness, 15, 2);
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(accepted.output, "new");
});

test("cancelled editor runs keep the prior committed delta baseline", async () => {
  const harness = createHarness();
  const firstSource = rowDocument(["a|Alpha"]);
  const slowSource = `>>>>! include "./modules/slow.js"\n>>>> slow\nAlpha\n<<<< slow`;
  const recoveredSource = rowDocument(["a|Alpha", "x|Xi"]);
  const slowModule = {
    path: "modules/slow.js",
    content: `define({ slow: { async transform(input, _args, context) { context.system.out.row("a", { rowId: "a", text: "Alpha" }, { rowId: "a", rowSet: "claims" }); await new Promise(resolve => setTimeout(resolve, 60)); await context.checkpoint(); return input; } } });`,
  };
  await openAndSubscribe(harness, firstSource);
  await runRevision(harness, 16, 1, [rowModule]);
  await replaceDocument(harness, "change:slow", 1, firstSource, slowSource);

  const pending = harness.sendWithoutWaiting({
    type: "run", requestId: "run:17", runId: 17, documentId: "doc:test", documentRevision: 2, modules: [slowModule], options: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await harness.send({ type: "cancel", runId: 17, reason: "test" });
  await pending;
  const cancelled = harness.runResult(17);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.editorKernel.metadataDelta.mode, "not-committed");
  assert.equal(cancelled.editorKernel.metadataDelta.basis.documentRevision, 1);

  await replaceDocument(harness, "change:recover", 2, slowSource, recoveredSource);
  const recovered = await runRevision(harness, 18, 3, [rowModule]);
  assert.equal(recovered.ok, true, recovered.error);
  assert.equal(recovered.editorKernel.metadataDelta.basis.documentRevision, 1);
  assert.equal(recovered.editorKernel.metadataDelta.target.documentRevision, 3);
  assert.equal(recovered.editorKernel.metadataDelta.summary.added, 1);
});

test("a queued run keeps its captured revision when the document changes before completion", async () => {
  const harness = createHarness();
  const slowModule = {
    path: "modules/slow.js",
    content: `define({ slow: { async transform(input) { await new Promise(resolve => setTimeout(resolve, 35)); return input; } } });`,
  };
  const before = `>>>>! include "./modules/slow.js"\n>>>> slow\nold snapshot\n<<<< slow`;
  const after = before.replace("old snapshot", "new snapshot");
  await openAndSubscribe(harness, before);
  const pending = harness.sendWithoutWaiting({
    type: "run", requestId: "run:12", runId: 12, documentId: "doc:test", documentRevision: 1, modules: [slowModule], options: {},
  });
  await replaceDocument(harness, "change:during-run", 1, before, after);
  await pending;
  const first = harness.runResult(12);
  assert.match(first.output, /old snapshot/);
  assert.equal(first.editorKernel.evaluatedSnapshot.documentRevision, 1);
  assert.equal(first.editorKernel.session.documentRevision, 2);

  const second = await runRevision(harness, 13, 2, [slowModule]);
  assert.match(second.output, /new snapshot/);
  assert.equal(second.editorKernel.evaluatedSnapshot.documentRevision, 2);
});
