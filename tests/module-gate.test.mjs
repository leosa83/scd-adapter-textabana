import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runModuleGateSuite, moduleGateSuiteUrl, projectModuleGateResult } from "../conformance/module-gate-runner.mjs";
import { runChannelWorker } from "../conformance/channel-core-runner.mjs";

test("module gate: frozen cases distinguish pre-entrypoint and post-load rejection", async () => {
  const report = await runModuleGateSuite();
  assert.equal(report.status, "passed"); assert.equal(report.checks.length, 54);
  assert.equal(report.claim.claimable, true);
  for (const key of ["independentImplementations", "canonicalRuntime", "semanticArtifactEquivalence", "fullProfileConformance", "javascriptSandbox"]) assert.equal(report.claim[key], false);
  const find = (id) => report.checks.find((check) => check.caseId === id).actual;
  assert.equal(find("duplicate-before-throwing-entrypoint").entrypoints, 0);
  assert.equal(find("entrypoint-throws").entrypoints, 1);
  assert.equal(find("loaded-state-drift").entrypoints, 1);
  assert.equal(find("loaded-state-drift").invocations, 0);
});

test("module gate: weakening only start-code expectations is rejected before execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "module-gate-tamper-"));
  try {
    const suite = JSON.parse(await readFile(moduleGateSuiteUrl, "utf8"));
    suite.cases.find((fixture) => fixture.id === "duplicate-function").expect.entrypoints = 1;
    const path = join(directory, "weakened.json"); await writeFile(path, JSON.stringify(suite));
    await assert.rejects(runModuleGateSuite({ suiteUrl: pathToFileURL(path) }), /manifest mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("module gate: expected failure codes cannot hide partial committed state", async () => {
  const failed = await runChannelWorker('>>>> publishThenFail\nx\n<<<< publishThenFail');
  assert.equal(projectModuleGateResult(failed, 1).committed, false);
  for (const corrupt of [
    (r) => { r.output = "partial"; r.resultEnvelope.render.data = "partial"; },
    (r) => { r.resultEnvelope.channelSnapshots.records = { events: [] }; },
    (r) => { r.resultEnvelope.provenance.activities = [{ activityId: "leaked" }]; },
  ]) {
    const changed = structuredClone(failed); corrupt(changed);
    assert.throws(() => projectModuleGateResult(changed, 1), /Nonatomic module failure/);
  }
});
