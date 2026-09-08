import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runChannelCoreSuite, runPythonChannelCore, channelCoreSuiteUrl, projectChannelResponse } from "../conformance/channel-core-runner.mjs";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient } from "../conformance/host-runner.mjs";

test("channel core: both implementations match every frozen event, ledger and snapshot", async () => {
  const report = await runChannelCoreSuite();
  assert.equal(report.status, "passed"); assert.equal(report.checks.length, 80);
  assert.equal(report.claim.independentImplementations, true);
  for (const key of ["canonicalRuntime", "semanticArtifactEquivalence", "fullProfileConformance"]) assert.equal(report.claim[key], false);
  for (const file of ["reference/channel_core.py", "reference/scoped_text.py", "reference/text_core.py", "conformance/scoped-admission.mjs"]) assert.ok(report.implementations[file]);
  assert.equal(Object.keys(report.baseSpecificationDigests).length, 2);
});

test("channel core: copied Python files preserve nested payloads without repository or Node", async () => {
  const directory = await mkdtemp(join(tmpdir(), "channel-core-isolated-"));
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  const suite = JSON.parse(await readFile(channelCoreSuiteUrl, "utf8"));
  try {
    for (const file of ["channel_core.py", "scoped_text.py", "text_core.py"]) await copyFile(new URL(`../reference/${file}`, import.meta.url), join(directory, file));
    const runtime = join(directory, "channel_core.py"), document = join(directory, "input.md");
    const options = { cwd: directory, env: { ...process.env, PATH: "", PYTHONPATH: "", PYTHONSTARTUP: "" } };
    for (const id of ["copy-at-emission", "local-survives-none"]) {
      const fixture = suite.cases.find((item) => item.id === id); await writeFile(document, fixture.source);
      const { stdout } = await promisify(execFile)(python, ["-E", "-s", runtime, "run", document], options);
      assert.deepEqual(JSON.parse(stdout).result, fixture.expect);
    }
    const failure = suite.cases.find((item) => item.id === "emit-then-fail"); await writeFile(document, failure.source);
    await assert.rejects(promisify(execFile)(python, ["-E", "-s", runtime, "run", document], options), (error) => {
      assert.equal(error.code, 1); assert.deepEqual(JSON.parse(error.stdout).result, failure.expect); return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("channel core: changing only payload expectations and missing Python fail closed", async () => {
  await assert.rejects(runPythonChannelCore([""], { executable: "/nonexistent/channel-core-python" }), /ENOENT/);
  const directory = await mkdtemp(join(tmpdir(), "channel-core-tamper-"));
  try {
    const suite = JSON.parse(await readFile(channelCoreSuiteUrl, "utf8"));
    suite.cases.find((item) => item.id === "operational-looking-payload").expect.events[0].payload.meta.runId = "scrubbed";
    const path = join(directory, "weakened.json"); await writeFile(path, JSON.stringify(suite));
    await assert.rejects(runChannelCoreSuite({ suiteUrl: pathToFileURL(path) }), /manifest mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("channel core: projection rejects corrupt host links, persistence and partial rollback", async () => {
  const transport = new NodeKernelTransport(), client = rawClient(transport);
  const content = (await Promise.all(["text-core-module.js", "channel-core-module.js"].map((file) => readFile(new URL(`../reference/${file}`, import.meta.url), "utf8")))).join("\n");
  const run = (name) => client.command(undefined, { documentId: "channel-core-fixture", documentPath: "fixture.md", runId: 1, documentSource: `>>>>! include "./channel-core.js"\n>>>> ${name}\nx\n<<<< ${name}`, modules: [{ path: "channel-core.js", content }], options: { strictChannels: true } });
  try {
    const result = await run("fanout"); assert.equal(projectChannelResponse(result).events.length, 4);
    for (const corrupt of [
      (r) => { r.resultEnvelope.render.data = "stale"; },
      (r) => { r.channels.progress[0].sequence = 1; },
      (r) => { r.channels.records[0].origin.invocationId = "unknown"; },
      (r) => { r.resultEnvelope.sourceMaps[0].generatingActivity = "unknown"; },
      (r) => { r.resultEnvelope.channelSnapshots.progress = { descriptor: r.channelDescriptors.progress, events: r.channels.progress }; },
      (r) => { r.resultEnvelope.channelSnapshots.audit.events = []; },
    ]) {
      const changed = structuredClone(result); corrupt(changed); assert.throws(() => projectChannelResponse(changed));
    }
    const failed = await run("publishThenFail"); assert.equal(projectChannelResponse(failed).error, "stage");
    for (const corrupt of [
      (r) => { r.resultEnvelope.render.data = "partial"; },
      (r) => { r.channels.records = [result.channels.records[0]]; },
      (r) => { r.resultEnvelope.provenance.activities = result.resultEnvelope.provenance.activities; },
    ]) {
      const changed = structuredClone(failed); corrupt(changed); assert.throws(() => projectChannelResponse(changed));
    }
  } finally { client.dispose(); await transport.close(); }
});
