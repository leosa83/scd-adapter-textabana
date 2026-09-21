import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { adapterManifests, playgroundImplementedCapabilities, runAdapters } from "../runtime/adapters.js";
import { canonicalDigest } from "../runtime/canonical-json.js";
import { sourceHash } from "../runtime/lab-values.js";
import { verifySemanticBundle } from "../runtime/semantic-identity.js";
import { executeSemanticCase, semanticSuiteUrl } from "../conformance/semantic-runner.mjs";

const suite = JSON.parse(await readFile(semanticSuiteUrl, "utf8"));
const fixture = (id = "pure-stage") => structuredClone(suite.cases.find((item) => item.id === id));
const capabilities = playgroundImplementedCapabilities;

// These manifest/output/projection values were recorded before the 5.14B.4
// translation. They are lab identities, not checksums of entire adapter envelopes.
test("adapter translation preserves all five manifest versions and digests", () => {
  assert.deepEqual(adapterManifests.map(({ adapterId, version, manifestDigest }) => [adapterId, version, manifestDigest]), [
    ["org.textabana.result-summary", "1.0.0-lab.1", "fnv1a:oileor"],
    ["org.textabana.data-table", "1.0.0-lab.1", "fnv1a:1yqiufd"],
    ["org.textabana.notebook", "1.0.0-lab.1", "fnv1a:ilgs34"],
    ["org.textabana.annotation-review", "1.0.0-lab.1", "fnv1a:cqcsb7"],
    ["org.textabana.ml-lineage", "1.0.0-contract.1", "fnv1a:bjqrpl"],
  ]);
});

test("English adapter extension leaves committed input, output and lab projection identity unchanged", async () => {
  const response = await executeSemanticCase(fixture(), "direct");
  assert.equal(response.ok, true, response.error);
  const input = response.resultEnvelope;
  const original = structuredClone(input);
  const run = runAdapters(input, ["org.textabana.result-summary"], capabilities);
  const projection = run.projections[0];
  assert.equal(input.resultId, "lab:1myi6tt");
  assert.equal(run.status, "succeeded");
  assert.equal(projection.projectionId, "projection:rdkf0d");
  assert.equal(await canonicalDigest(projection.output), "sha256:67f32b1e7ea7f562be876271d7c3629d9eda2880416a401ae6455a4283f74de5");
  assert.equal(projection.extensions["textabana.playground"].note, "Executable reference projection for adapter-contract/1; not a domain-adapter claim.");
  assert.equal(projection.extensions["textabana.playground"].canonical, false);
  assert.deepEqual(input, original);
  assert.equal(run.verification.immutable, true);
  assert.equal(run.verification.beforeDigest, run.verification.afterDigest);
});

function assertDiagnostic(diagnostic, { adapterId, code, message, severity = "error", previousId }) {
  assert.equal(diagnostic.adapterId, adapterId);
  assert.equal(diagnostic.code, code);
  assert.equal(diagnostic.message, message);
  assert.equal(diagnostic.severity, severity);
  assert.equal(diagnostic.level, severity);
  assert.equal(diagnostic.phase, "adapter");
  assert.equal(diagnostic.line, 1);
  assert.equal(diagnostic.diagnosticId, `diag:adapter:${sourceHash(`${code}:${adapterId}:${message}`)}`);
  if (previousId) assert.notEqual(diagnostic.diagnosticId, previousId);
}

test("English adapter admission diagnostics retain codes, unsupported identities and authored Unicode", async () => {
  const { resultEnvelope: input } = await executeSemanticCase(fixture(), "direct");
  const original = structuredClone(input);
  for (const item of [
    { adapterId: "okänd-🌊", code: "TBA-ADAPTER-UNKNOWN-LAB", message: "Unknown adapter “okänd-🌊”.", previousId: "diag:adapter:e30p6j" },
    { adapterId: "org.textabana.ml-lineage", code: "TBA-ADAPTER-CONTRACT-ONLY-LAB", message: "org.textabana.ml-lineage is registered as contract-only and produces no simulated output.", severity: "info", previousId: "diag:adapter:10oticl", projectionId: "projection:unsupported:1jdsk41" },
    { adapterId: "org.textabana.data-table", code: "TBA-ADAPTER-CAPABILITY-LAB", message: "org.textabana.data-table requires capability “stable-record-id”.", previousId: "diag:adapter:1c0wgv7", projectionId: "projection:unsupported:fe8t1x", capabilities: [] },
    { adapterId: "org.textabana.data-table", code: "TBA-ADAPTER-INPUT-LAB", message: "org.textabana.data-table is missing compatible channel “data.datasets”.", previousId: "diag:adapter:spyf4", projectionId: "projection:unsupported:fe8t1x" },
  ]) {
    const run = runAdapters(input, [item.adapterId], item.capabilities ?? capabilities);
    assert.equal(run.status, "partial");
    assert.equal(run.diagnostics.length, 1);
    assertDiagnostic(run.diagnostics[0], item);
    assert.deepEqual(run.requested, [item.adapterId]);
    assert.equal(run.projections.length, item.projectionId ? 1 : 0);
    if (item.projectionId) {
      assert.equal(run.projections[0].projectionId, item.projectionId);
      assert.equal(run.projections[0].status, "unsupported");
      assert.equal(run.projections[0].output, undefined);
      assert.deepEqual(run.projections[0].diagnostics, run.diagnostics);
    }
    assert.deepEqual(input, original);
    assert.equal(run.verification.immutable, true);
  }
  const unsupportedSchema = { ...input, schema: "schema:okänd-🌊" };
  assertDiagnostic(runAdapters(unsupportedSchema, ["org.textabana.data-table"], capabilities).diagnostics[0], {
    adapterId: "org.textabana.data-table", code: "TBA-ADAPTER-INPUT-LAB",
    message: "org.textabana.data-table does not accept schema:okänd-🌊.",
  });
});

test("malformed domain input retains failed projection identities with English diagnostics", async () => {
  const { resultEnvelope } = await executeSemanticCase(fixture(), "direct");
  for (const [adapterId, detail, projectionId, previousId] of [
    ["org.textabana.data-table", "data.datasets must contain exactly one output dataset in this playground subset", "projection:failed:fe8t1x", "diag:adapter:9pwubm"],
    ["org.textabana.notebook", "notebook.snapshot must contain exactly one whole snapshot", "projection:failed:l7o0y6", "diag:adapter:nfv022"],
    ["org.textabana.annotation-review", "annotation.set must contain exactly one whole snapshot", "projection:failed:1m2iu2r", "diag:adapter:hiy43i"],
  ]) {
    // Deliberately malformed post-commit adapter input, not a valid core fixture.
    const input = structuredClone(resultEnvelope);
    for (const channel of adapterManifests.find((item) => item.adapterId === adapterId).accepts.channels) {
      input.channelSnapshots[channel.name] = { descriptor: { schemaRef: channel.schemaRef }, events: [] };
    }
    const original = structuredClone(input);
    const run = runAdapters(input, [adapterId], capabilities);
    assert.equal(run.status, "failed");
    assert.equal(run.projections.length, 1);
    assert.equal(run.projections[0].status, "failed");
    assert.equal(run.projections[0].projectionId, projectionId);
    assert.equal(run.projections[0].output, undefined);
    assertDiagnostic(run.diagnostics[0], { adapterId, code: "TBA-ADAPTER-PROJECTION-LAB", message: `${adapterId}: ${detail}`, previousId });
    assert.deepEqual(run.projections[0].diagnostics, run.diagnostics);
    assert.deepEqual(input, original);
    assert.equal(input.run.committed, true);
    assert.equal(run.verification.immutable, true);
  }
});

test("actual Worker emits English adapter diagnostics outside canonical semantic artifacts", async () => {
  const baseline = await executeSemanticCase(fixture(), "direct");
  const withAdapters = fixture();
  withAdapters.options = { ...withAdapters.options, adapters: ["okänd-🌊", "org.textabana.ml-lineage", "org.textabana.data-table"] };
  const response = await executeSemanticCase(withAdapters, "direct", 92);
  assert.equal(response.ok, true, response.error);
  assert.equal(response.resultEnvelope.run.committed, true);
  assert.equal(response.resultEnvelope.resultId, baseline.resultEnvelope.resultId);
  assert.equal(response.adapterRun.status, "partial");
  assert.deepEqual(response.adapterRun.diagnostics.map(({ code, message }) => [code, message]), [
    ["TBA-ADAPTER-UNKNOWN-LAB", "Unknown adapter “okänd-🌊”."],
    ["TBA-ADAPTER-CONTRACT-ONLY-LAB", "org.textabana.ml-lineage is registered as contract-only and produces no simulated output."],
    ["TBA-ADAPTER-INPUT-LAB", "org.textabana.data-table is missing compatible channel “data.datasets”."],
  ]);
  assert.equal(response.adapterRun.verification.immutable, true);
  assert.deepEqual((await verifySemanticBundle(response.semanticIdentity)).identities, (await verifySemanticBundle(baseline.semanticIdentity)).identities);
  const failed = await executeSemanticCase(fixture("syntax-failure"), "direct");
  assert.equal(failed.ok, false);
  assert.equal(failed.resultEnvelope.run.committed, false);
  assert.equal(failed.semanticIdentity.result, null);
  assert.equal(failed.adapterRun.status, "skipped");
  assert.deepEqual(failed.adapterRun.projections, []);
  assertDiagnostic(failed.adapterRun.diagnostics[0], {
    adapterId: "adapter-run", code: "TBA-ADAPTER-SKIPPED-LAB", severity: "info",
    message: "Adapters run only after a successful atomic commit.",
  });
});
