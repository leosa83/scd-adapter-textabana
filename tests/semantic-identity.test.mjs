import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { canonicalDigest } from "../runtime/canonical-json.js";
import { identifyResult, verifySemanticBundle } from "../runtime/semantic-identity.js";
import { runSemanticSuite, executeSemanticCase, semanticSuiteUrl } from "../conformance/semantic-runner.mjs";
import { rawClient } from "../conformance/host-runner.mjs";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";

const suite = JSON.parse(await readFile(semanticSuiteUrl, "utf8"));
const fixture = (id) => structuredClone(suite.cases.find((item) => item.id === id));

test("external semantic profile matches frozen identities across direct, editor and restored revision runs", { timeout: 60000 }, async () => {
  const report = await runSemanticSuite();
  assert.equal(report.status, "passed", JSON.stringify(report.checks.filter((item) => item.status !== "passed")));
  assert.equal(report.checks.length, 28);
  assert.equal(report.claim.canonicalArtifactIdentity, true);
  assert.equal(report.claim.canonicalRuntime, false);
});

test("module bytes and effective policy bind Plan/Result while IR remains source-bound", async () => {
  const first = await executeSemanticCase(fixture("pure-stage"), "direct", 1);
  assert.equal(first.capabilities.optionalProfiles[0].profile, "textabana.semantic-artifacts/v1");
  assert.equal(first.capabilities.optionalProfiles[0].available, true);
  assert.equal(first.semanticIdentity.plan.artifact.graph.nodes.find((node) => node.kind === "source").value.data, "Hej\n");
  assert.deepEqual(first.semanticIdentity.plan.artifact.initializedModules.map((module) => module.path), ["m.js"]);
  const changed = await executeSemanticCase(fixture("module-change"), "direct", 2);
  assert.equal(first.output, changed.output);
  assert.equal(first.semanticIdentity.ir.id, changed.semanticIdentity.ir.id);
  assert.notEqual(first.semanticIdentity.plan.id, changed.semanticIdentity.plan.id);
  assert.notEqual(first.semanticIdentity.result.id, changed.semanticIdentity.result.id);
  const explicitDefaults = fixture("pure-stage"); explicitDefaults.options = { runtimeLimits: { maxParallelism: 4 }, fixtureId: "ignored", adapters: [] };
  const same = await executeSemanticCase(explicitDefaults, "direct", 900);
  assert.equal(first.semanticIdentity.result.id, same.semanticIdentity.result.id);
  explicitDefaults.options.runtimeLimits.maxParallelism = 1;
  const changedPolicy = await executeSemanticCase(explicitDefaults, "direct", 901);
  assert.notEqual(first.semanticIdentity.plan.id, changedPolicy.semanticIdentity.plan.id);
});

test("canonical result preserves operational-looking user payload and authored revision fields", async () => {
  const response = await executeSemanticCase(fixture("payload-fields"), "editor", 711);
  const raw = response.resultEnvelope.channelSnapshots["system.out"].events[0].payload;
  const normalized = response.semanticIdentity.result.artifact.channelSnapshots["system.out"].events[0].payload;
  assert.deepEqual(normalized, raw);
  assert.equal(normalized.runId, "run-instance:000001");
  assert.equal(normalized.revision, 42); assert.equal(normalized.duration, 7);
  assert.equal(normalized.nested.stageId, "stage:run-instance:000001");
  const second = await executeSemanticCase(fixture("payload-fields"), "direct", 992);
  assert.equal(response.semanticIdentity.result.id, second.semanticIdentity.result.id);
  const changed = structuredClone(response.resultEnvelope);
  changed.channelSnapshots["system.out"].events[0].payload.duration = 8;
  assert.notEqual((await identifyResult(response.semanticIdentity, changed, response.plan)).id, response.semanticIdentity.result.id);
  changed.channelSnapshots["system.out"].events[0].payload.duration = 7;
  changed.anchors[0].selectors[0].end += 1;
  assert.notEqual((await identifyResult(response.semanticIdentity, changed, response.plan)).id, response.semanticIdentity.result.id);
  changed.sourceMaps[0].inputAnchorRefs = ["missing-anchor"];
  await assert.rejects(identifyResult(response.semanticIdentity, changed, response.plan), /Unresolved/);
  const mutable = structuredClone(response.resultEnvelope);
  const pendingIdentity = identifyResult(response.semanticIdentity, mutable, response.plan);
  mutable.render.data = "mutated after hashing started";
  mutable.channelSnapshots["system.out"].events[0].payload.revision = 1000;
  const detached = await pendingIdentity;
  assert.equal(detached.id, response.semanticIdentity.result.id);
  assert.equal(detached.artifact.render.data, response.output);
  assert.equal(detached.artifact.channelSnapshots["system.out"].events[0].payload.revision, 42);
});

test("tampering or swapping a canonical artifact breaks digest or chain verification", async () => {
  const response = await executeSemanticCase(fixture("payload-fields"), "direct");
  const bundle = structuredClone(response.semanticIdentity);
  bundle.result.artifact.channelSnapshots["system.out"].events[0].payload.revision++;
  await assert.rejects(verifySemanticBundle(bundle), /digest/);
  const other = await executeSemanticCase(fixture("pure-stage"), "direct");
  bundle.result = other.semanticIdentity.result;
  await assert.rejects(verifySemanticBundle(bundle), /chain/);
  const forged = structuredClone(response.semanticIdentity); forged.claims.fullRuntimeConformance = true;
  await assert.rejects(verifySemanticBundle(forged), /promote/);
  const report = await verifySemanticBundle(response.semanticIdentity);
  assert.equal(report.integrity, "verified"); assert.equal(report.profileConformance, "not-evaluated");
  assert.equal(report.fullRuntimeConformance, false);
  assert.match(await canonicalDigest(bundle.result.artifact), /^sha256:[a-f0-9]{64}$/);
});

test("verified cache reuse and fresh execution have identical canonical artifacts", async () => {
  const source = fixture("pure-stage").source + "\ntail A";
  const transport = new NodeKernelTransport(), client = rawClient(transport);
  const documentId = "cache-identity";
  try {
    await client.command("open", { document: { documentId, path: "cache.md", source } });
    const run = (documentRevision) => client.command("run", { documentId, documentRevision, runId: documentRevision, modules: fixture("pure-stage").modules, options: { semanticIdentity: true } });
    const first = await run(1);
    const offset = Array.from(source).length - 1;
    await client.command("change", { documentId, baseRevision: 1, changes: [{ from: offset, to: offset + 1, insert: "B" }] });
    await run(2);
    await client.command("change", { documentId, baseRevision: 2, changes: [{ from: offset, to: offset + 1, insert: "A" }] });
    const reused = await run(3);
    assert.equal(reused.ok, true, reused.error);
    assert.equal(reused.executionStats.reused, 1);
    assert.equal(first.semanticIdentity.ir.id, reused.semanticIdentity.ir.id);
    assert.equal(first.semanticIdentity.plan.id, reused.semanticIdentity.plan.id);
    assert.equal(first.semanticIdentity.result.id, reused.semanticIdentity.result.id);
    assert.notDeepEqual(first.resultEnvelope.provenance, reused.resultEnvelope.provenance);
  } finally { client.dispose(); await transport.close(); }
});

test("admitted failures retain inputs and failures/cancellation never expose a committed result identity", async () => {
  const failed = await executeSemanticCase(fixture("syntax-failure"), "direct");
  assert.equal(failed.semanticIdentity.result, null);
  assert.ok(failed.semanticIdentity.ir);
  const differentSource = fixture("syntax-failure"); differentSource.source += " extra";
  const different = await executeSemanticCase(differentSource, "direct");
  assert.notEqual(failed.semanticIdentity.source.id, different.semanticIdentity.source.id);
  const transport = new NodeKernelTransport(), client = rawClient(transport);
  try {
    await client.command("open", { document: { documentId: "cancel", path: "c.md", source: '>>>>! include "./c.js"\n>>>> wait\ntext\n<<<< wait' } });
    const pending = client.command("run", { documentId: "cancel", documentRevision: 1, runId: 500, options: { semanticIdentity: true }, modules: [{ path: "c.js", content: "define({wait:{async transform(input){await new Promise(r=>setTimeout(r,100));return input;}}});" }] });
    await client.command("cancel", { runId: 500 });
    const cancelled = await pending;
    assert.equal(cancelled.cancelled, true); assert.equal(cancelled.semanticIdentity?.result ?? null, null);
  } finally { client.dispose(); await transport.close(); }
});

test("CLI identify provides a reproducible artifact bundle", () => {
  const run = spawnSync(process.execPath, ["cli/textabana.mjs", "identify", "examples/document.md"], { encoding: "utf8", timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  const bundle = JSON.parse(run.stdout);
  assert.equal(bundle.profile, "textabana.semantic-artifacts/v1");
  assert.ok(bundle.result?.id.startsWith("sha256:"));
});

test("known transient warnings preserve successful identities and unknown map references fail", async () => {
  const response = await executeSemanticCase(fixture("warning"), "direct");
  assert.equal(response.ok, true, response.error);
  assert.equal(response.semanticIdentity.result.artifact.sourceMaps.length, 0);
  assert.ok(response.semanticIdentity.result.artifact.diagnostics.some((item) => item.message === "a benign warning"));
  const observations = { channels: response.channels, descriptors: response.channelDescriptors };
  assert.equal((await identifyResult(response.semanticIdentity, response.resultEnvelope, response.plan, observations)).id, response.semanticIdentity.result.id);
  const unknown = structuredClone(response.resultEnvelope); unknown.sourceMaps[0].outputRef = "unknown-event";
  await assert.rejects(identifyResult(response.semanticIdentity, unknown, response.plan, observations), /Unresolved/);
});

test("identity snapshots stay consistent when a module retains its emitted event", async () => {
  const fixture = { source: '>>>>! include "./m.js"\n>>>> emit\ntext\n<<<< emit', modules: [{ path: "m.js", content: `define({emit:{transform(input,_args,ctx){const event=ctx.system.out.line({value:1},{row:1});setTimeout(()=>{if(event?.payload)event.payload.value=999;},0);return input;}}});` }] };
  const response = await executeSemanticCase(fixture, "editor");
  assert.equal(response.ok, true, response.error);
  assert.equal(response.resultEnvelope.channelSnapshots["system.out"].events[0].payload.value, 1);
  assert.equal(response.channels["system.out"][0].payload.value, 1);
  assert.equal((await verifySemanticBundle(response.semanticIdentity)).integrity, "verified");
});
