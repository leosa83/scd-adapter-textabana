import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { admitScopedText } from "./scoped-admission.mjs";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient } from "./host-runner.mjs";

export const CHANNEL_CORE_INCLUDE = '>>>>! include "./channel-core.js"\n';
export const CHANNEL_CORE_PROFILE = "textabana.channel-core/v1";
export const channelCoreSuiteUrl = new URL("./profiles/channel-core-v1.json", import.meta.url);
export const channelCoreManifestUrl = new URL("./profiles/channel-core-v1.manifest.json", import.meta.url);
const pythonUrl = new URL("../reference/channel_core.py", import.meta.url);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rejected = (error) => ({ ok: false, output: "", error, committed: false, committedStages: 0, stages: [], events: [], snapshots: {} });

// Check actual host state before dropping operational identities from the comparison.
export function projectChannelResponse(response) {
  const envelope = response.resultEnvelope;
  assert.equal(envelope.render.data, response.output, "Result render must match host output");
  if (!response.ok) {
    assert.equal(envelope.run.committed, false, "Nonatomic kernel failure: commit");
    assert.equal(response.output, "", "Nonatomic kernel failure: output");
    for (const value of [response.channels, response.channelDescriptors, envelope.channelSnapshots]) assert.equal(Object.keys(value).length, 0, "Nonatomic kernel failure: channels");
    for (const value of [response.anchors, response.sourceMaps, envelope.anchors, envelope.sourceMaps, envelope.provenance.activities]) assert.equal(value.length, 0, "Nonatomic kernel failure: references");
    const diagnostic = response.diagnostics.find((item) => item.severity === "error");
    if (!diagnostic) throw new Error("Kernel failure without a diagnostic.");
    if (/LIMIT|BUDGET/.test(diagnostic.code) || /(?:text-core render|channel-core payload) limit/.test(diagnostic.message)) return rejected("limit");
    if (!["TBA-RUN-LAB", "TBA-TYPE-CHANNEL-LAB", "TBA-ANCHOR-COLLISION-LAB"].includes(diagnostic.code)) throw new Error(`Unexpected kernel failure: ${diagnostic.code}`);
    return rejected("stage");
  }
  assert.equal(envelope.run.committed, true);
  const invocations = response.executionTrace.filter((step) => step.status === "succeeded" && step.functionInvoked);
  const stages = invocations.map((step) => ({ function: step.function, args: step.args, modality: step.modality, scopeId: step.scopeId }));
  const invocationIndex = new Map(invocations.map((step, index) => [step.invocationId, index]));
  assert.equal(invocationIndex.size, invocations.length);
  const anchors = new Set(envelope.anchors.map((anchor) => anchor.anchorId));
  const activities = new Map(envelope.provenance.activities.map((activity) => [activity.activityId, activity]));
  const rawEvents = Object.entries(response.channels).flatMap(([name, events]) => {
    for (const event of events) assert.equal(event.channel, name);
    return events;
  }).sort((a, b) => a.sequence - b.sequence);
  assert.equal(new Set(rawEvents.map((event) => event.eventId)).size, rawEvents.length);
  assert.equal(envelope.sourceMaps.length, rawEvents.length);
  const events = rawEvents.map((event, index) => {
    assert.equal(event.sequence, index + 1);
    assert.equal(event.schema, "textabana.event/v1");
    assert.equal(event.id, event.eventId);
    assert.equal(event.phase, "run"); assert.equal(event.state, "committed");
    const ordinal = invocationIndex.get(event.origin.invocationId);
    assert.notEqual(ordinal, undefined, "Event must reference a committed invocation");
    const step = invocations[ordinal];
    assert.equal(event.origin.stageId, step.stageId); assert.equal(event.origin.function, step.function);
    assert.equal(event.origin.module, "channel-core.js"); assert.equal(event.origin.modality, step.modality);
    assert.equal(event.origin.scopeId ?? null, step.scopeId);
    assert.equal(event.provenanceRef, step.activityId);
    assert.equal(activities.get(event.provenanceRef)?.invocationId, step.invocationId);
    assert.ok(anchors.has(event.target.anchorRef));
    const maps = envelope.sourceMaps.filter((mapping) => mapping.outputRef === event.eventId);
    assert.equal(maps.length, 1); assert.equal(maps[0].generatingActivity, event.provenanceRef);
    assert.deepEqual(maps[0].inputAnchorRefs, [event.target.anchorRef]); assert.equal(maps[0].mapping, "derived");
    assert.equal(event.type, event.target.mode); assert.equal(event.rowId, event.target.rowId); assert.equal(event.row, event.target.row);
    const { mode, rowId, row, rowSet } = event.target;
    return { sequence: event.sequence, channel: event.channel, kind: event.kind, phase: event.phase, state: event.state, payload: event.payload, target: { mode, rowId, row, rowSet }, stage: ordinal + 1 };
  });
  const snapshots = {};
  const expectedNames = Object.entries(response.channelDescriptors).filter(([name, descriptor]) => descriptor.persistence !== "transient" && (descriptor.required || response.channels[name]?.length)).map(([name]) => name).sort();
  assert.deepEqual(Object.keys(envelope.channelSnapshots).sort(), expectedNames);
  for (const [name, snapshot] of Object.entries(envelope.channelSnapshots)) {
    assert.deepEqual(snapshot.descriptor, response.channelDescriptors[name]);
    assert.deepEqual(snapshot.events, rawEvents.filter((event) => event.channel === name));
    snapshots[name] = { descriptor: snapshot.descriptor, events: snapshot.events.map((event) => event.sequence) };
  }
  return { ok: true, output: response.output, error: null, committed: true, committedStages: stages.length, stages, events, snapshots };
}

export async function runJavaScriptChannelCore(source) {
  const admission = admitScopedText(source);
  if (admission) return rejected(admission);
  return projectChannelResponse(await runChannelWorker(source));
}

// Shared host transport; each profile owns admission and its comparison projection.
export async function runChannelWorker(source) {
  const transport = new NodeKernelTransport(), client = rawClient(transport);
  try {
    const content = (await Promise.all(["text-core-module.js", "channel-core-module.js"].map((file) => readFile(new URL(`../reference/${file}`, import.meta.url), "utf8")))).join("\n");
    return await client.command(undefined, {
      documentId: "channel-core-fixture", documentPath: "fixture.md", runId: 1,
      documentSource: CHANNEL_CORE_INCLUDE + source,
      modules: [{ path: "channel-core.js", content }],
      options: { strictChannels: true, runtimeLimits: { maxParallelism: 1, maxStageResolutions: 128, maxRenderBytes: 262144, maxChannelEvents: 64 } },
    });
  } finally { client.dispose(); await transport.close(); }
}

export async function runChannelCoreSuite({ suiteUrl = channelCoreSuiteUrl } = {}) {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8"));
  const manifest = parseStrictJson(await readFile(channelCoreManifestUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite);
  const specificationDigest = digest(await readFile(new URL("../CHANNEL_CORE_PROFILE.md", import.meta.url)));
  const baseSpecificationDigests = Object.fromEntries(await Promise.all(["TEXT_CORE_PROFILE.md", "SCOPED_TEXT_PROFILE.md"].map(async (file) => [file, digest(await readFile(new URL(`../${file}`, import.meta.url)))])));
  if (canonicalize(manifest.baseSpecificationDigests) !== canonicalize(baseSpecificationDigests)) throw new Error("Channel core base specification mismatch.");
  if (manifest.schema !== "textabana.channel-core-manifest/v1" || manifest.profile !== CHANNEL_CORE_PROFILE || manifest.version !== "1.0.0" || manifest.suiteDigest !== suiteDigest || manifest.specificationDigest !== specificationDigest || manifest.caseCount !== suite.cases?.length || suite.schema !== "textabana.channel-core-suite/v1" || suite.profile !== CHANNEL_CORE_PROFILE || suite.version !== "1.0.0" || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length) throw new Error("Channel core profile manifest mismatch.");
  const paths = ["reference/channel_core.py", "reference/scoped_text.py", "reference/text_core.py", "reference/text-core-module.js", "reference/channel-core-module.js", "conformance/channel-core-runner.mjs", "conformance/scoped-admission.mjs", "runtime/parser.js", "runtime/generated/textabana-parser.js", "runtime/canonical-json.js", "public/runtime-worker.js", "sdk/node/transport.mjs", "sdk/node/worker-bridge.mjs", "conformance/host-runner.mjs", "package-lock.json"];
  const sourceDigests = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, digest(await readFile(new URL(`../${path}`, import.meta.url)))])));
  const implementations = await sourceDigests(), python = await runPythonChannelCore(suite.cases.map((fixture) => fixture.source)), checks = [];
  for (const [index, fixture] of suite.cases.entries()) {
    const javascript = await runJavaScriptChannelCore(fixture.source);
    const matches = canonicalize(javascript) === canonicalize(fixture.expect) && canonicalize(python[index]) === canonicalize(fixture.expect);
    checks.push({ caseId: fixture.id, status: matches ? "passed" : "failed", sourceDigest: digest(Buffer.from(fixture.source)), expected: fixture.expect, javascript, python: python[index] });
  }
  if (canonicalize(implementations) !== canonicalize(await sourceDigests())) throw new Error("Implementation changed during channel core suite.");
  const passed = checks.every((check) => check.status === "passed");
  return { schema: "textabana.external-report/v1", profile: CHANNEL_CORE_PROFILE, suiteVersion: suite.version, suiteDigest, specificationDigest, baseSpecificationDigests, manifestDigest: await canonicalDigest(manifest), implementations, runtimes: ["javascript-worker", "python-standalone"], checks, status: passed ? "passed" : "failed", claim: { scope: CHANNEL_CORE_PROFILE, claimable: passed, independentImplementations: passed, canonicalRuntime: false, semanticArtifactEquivalence: false, fullProfileConformance: false } };
}

export async function runPythonChannelCore(sources, { executable = "python3", env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [fileURLToPath(pythonUrl), "batch"], { env, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    let stdout = "", stderr = "", settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error("Python reference timed out.")); }, 30000);
    child.on("error", (error) => finish(error)); child.stdin.on("error", (error) => finish(error));
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 16 * 1024 * 1024) { child.kill(); finish(new Error("Oversized Python response.")); } });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    child.on("close", (code) => {
      if (code !== 0) return finish(new Error(`Python reference exited ${code}: ${stderr}`));
      try {
        const response = parseStrictJson(stdout);
        if (response.profile !== CHANNEL_CORE_PROFILE || !Array.isArray(response.results) || response.results.length !== sources.length) throw new Error("Invalid Python reference response.");
        finish(null, response.results);
      } catch (error) { finish(error); }
    });
    child.stdin.end(JSON.stringify({ sources }));
  });
}
