import test from "node:test";
import assert from "node:assert/strict";
import { createEditorKernel } from "../runtime/editor-kernel.js";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient } from "../conformance/host-runner.mjs";

test("English editor diagnostics keep stable codes and leave multilingual source untouched", () => {
  const kernel = createEditorKernel({ postMessage() {}, isRunBusy: () => true });
  const source = "Räksmörgås 🌊";
  kernel.openEditorDocument({ document: { documentId: "test", path: "test.md", source } });
  for (const [operation, code, message] of [
    [() => kernel.applyEditorChange({ documentId: "test", baseRevision: 1, changes: [] }), "TBA-EDITOR-CHANGESET-EMPTY-LAB", "change requires at least one text edit."],
    [() => kernel.creditEditorSubscription({ subscriptionId: "missing", credit: 1 }), "TBA-EDITOR-SUBSCRIPTION-NOT-FOUND-LAB", "credit references an unknown subscription."],
    [() => kernel.importEditorCache({ documentId: "test" }), "TBA-EDITOR-CACHE-BUSY-LAB", "A cache checkpoint can be imported only when no runs are active or queued."],
  ]) assert.throws(operation, { code, message });
  assert.equal(kernel.captureEditorRun({ documentId: "test", documentRevision: 1 }).source, source);
});

test("English Worker errors preserve resolution/function codes, positions and atomic failure", async () => {
  const transport = new NodeKernelTransport(), client = rawClient(transport);
  try {
    for (const [source, code, message, line] of [
      ['>>>>! include "./missing.js"', "TBA-RESOLVE-LAB", 'Module “missing.js” does not exist in the project.', 1],
      ['\n\n>>>> missing\nx\n<<<< missing', "TBA-RUN-LAB", 'Line 3: unknown function “missing”.', 3],
    ]) {
      const response = await client.command(undefined, { runId: 1, documentSource: source, modules: [] });
      assert.equal(response.ok, false);
      assert.equal(response.error, message);
      const diagnostic = response.diagnostics.at(-1);
      assert.equal(diagnostic.code, code);
      assert.equal(diagnostic.line, line);
      assert.equal(response.resultEnvelope.run.committed, false);
      assert.equal(response.output, "");
      assert.deepEqual(response.channels, {});
    }
  } finally { client.dispose(); await transport.close(); }
});
