import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");

function template(name) {
  const match = pageSource.match(new RegExp("const " + name + " = `([\\s\\S]*?)`;"));
  assert.ok(match, `missing template constant ${name}`);
  return vm.runInNewContext("`" + match[1] + "`");
}

const modulePaths = {
  coreModule: "modules/core.js",
  editorialModule: "modules/editorial.js",
  metadataModule: "modules/metadata.js",
  base64Module: "modules/base64.js",
  dataModule: "modules/data.js",
  notebookModule: "modules/notebook.js",
  annotationModule: "modules/annotation.js",
  conformanceModule: "modules/conformance.js",
};

const modules = Object.entries(modulePaths).map(([name, path]) => ({ path, content: template(name) }));
const requestedAdapters = [
  "org.textabana.result-summary",
  "org.textabana.data-table",
  "org.textabana.notebook",
  "org.textabana.annotation-review",
  "org.textabana.ml-lineage",
];

function createHarness() {
  const pending = new Map();
  const self = {
    postMessage(message) {
      const resolve = pending.get(message.runId);
      if (!resolve) throw new Error(`No pending run ${message.runId}`);
      pending.delete(message.runId);
      resolve(message);
    },
  };
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
    self,
  });
  vm.runInContext(workerSource, context);

  return {
    async run({ documentSource, fixtureId = "ad-hoc", runId = 1, moduleSet = modules, adapters = requestedAdapters, cancelAfterMs }) {
      const message = new Promise((resolve) => pending.set(runId, resolve));
      const task = context.self.onmessage({
        data: {
          runId,
          documentPath: "document.md",
          documentSource,
          modules: moduleSet,
          options: { fixtureId, strictChannels: true, adapters },
        },
      });
      if (cancelAfterMs !== undefined) {
        setTimeout(() => context.self.onmessage({ data: { type: "cancel", runId } }), cancelAfterMs);
      }
      const result = await message;
      await task;
      return result;
    },
    cancel(runId) {
      return context.self.onmessage({ data: { type: "cancel", runId } });
    },
  };
}

test("golden fixture publishes a passed machine-readable conformance gate", async () => {
  const harness = createHarness();
  const result = await harness.run({ documentSource: template("conformanceGoldenFixtureDocument"), fixtureId: "conformance-golden" });
  const report = result.conformanceReport;

  assert.equal(result.ok, true, result.error);
  assert.equal(report.schema, "textabana.conformance-report/lab-v1");
  assert.equal(report.suite.suiteId, "textabana.playground/interop-0.7");
  assert.equal(report.suite.version, "1.2.0-lab.1");
  assert.equal(report.golden.status, "passed", JSON.stringify(report.golden));
  assert.equal(report.gate.status, "passed", JSON.stringify(report.gate));
  assert.equal(report.golden.expectedStructuralDigest, "fnv1a-lab:u6b48h");
  assert.equal(report.golden.actualStructuralDigest, report.structuralDigest);
  assert.ok(report.reportId.startsWith("conformance:"));
});

test("declared support, evaluated status and claimability remain separate", async () => {
  const harness = createHarness();
  const result = await harness.run({ documentSource: template("conformanceGoldenFixtureDocument"), fixtureId: "conformance-golden" });
  const byProfile = new Map(result.conformanceReport.profiles.map((profile) => [profile.profile, profile]));

  assert.equal(byProfile.get("language-core/0.4").declaredSupport, "playground-subset");
  assert.equal(byProfile.get("language-core/0.4").status, "passed");
  assert.equal(byProfile.get("language-core/0.4").claimable, true);
  assert.equal(byProfile.get("data/1").status, "not-run");
  assert.equal(byProfile.get("data/1").derivedSupport, null);
  assert.equal(byProfile.get("ml-lineage/1").declaredSupport, "contract-only");
  assert.equal(byProfile.get("ml-lineage/1").derivedSupport, "contract-only");
  assert.equal(byProfile.get("ml-lineage/1").claimable, false);
  assert.ok(!result.conformanceReport.summary.claimableProfiles.includes("ml-lineage/1"));
});

test("domain profiles run only when their canonical input channels are present", async () => {
  const cases = [
    ["dataJoinFixtureDocument", "data-join", "data/1"],
    ["notebookFixtureDocument", "notebook-snapshot", "notebook/1"],
    ["annotationReviewFixtureDocument", "annotation-review", "annotation/1"],
  ];
  let runId = 10;
  for (const [documentName, fixtureId, profileId] of cases) {
    const harness = createHarness();
    const result = await harness.run({ documentSource: template(documentName), fixtureId, runId });
    const profile = result.conformanceReport.profiles.find((item) => item.profile === profileId);
    assert.equal(result.ok, true, result.error);
    assert.equal(profile.status, "passed", profileId);
    assert.equal(profile.claimable, true, profileId);
    runId += 1;
  }
});

test("structural digest is transport-stable and covers module semantics", async () => {
  const harness = createHarness();
  const source = template("conformanceGoldenFixtureDocument");
  const first = await harness.run({ documentSource: source, fixtureId: "conformance-golden", runId: 41 });
  const second = await harness.run({ documentSource: source, fixtureId: "conformance-golden", runId: 99 });
  const changedModules = modules.map((module) => module.path === "modules/conformance.js"
    ? { ...module, content: module.content.replace("return input;", "return String(input).toUpperCase();") }
    : module);
  const regression = await harness.run({ documentSource: source, fixtureId: "conformance-golden", runId: 100, moduleSet: changedModules });

  assert.notEqual(first.resultEnvelope.run.runId, second.resultEnvelope.run.runId);
  assert.equal(first.conformanceReport.reportId, second.conformanceReport.reportId);
  assert.equal(first.conformanceReport.structuralDigest, second.conformanceReport.structuralDigest);
  assert.notEqual(regression.conformanceReport.structuralDigest, first.conformanceReport.structuralDigest);
  assert.equal(regression.conformanceReport.golden.status, "failed");
  assert.equal(regression.conformanceReport.gate.status, "failed");
  assert.ok(regression.conformanceReport.gate.blockingRequirementIds.includes("GOLDEN-STRUCTURE"));
});

test("negative fixtures pass only on exact terminal status and diagnostic family", async () => {
  const cases = [
    ["failedRunFixtureDocument", "failed-run", "TBA-TYPE-CHANNEL-LAB"],
    ["negativeUnknownFunctionFixtureDocument", "negative-unknown-function", "TBA-RUN-LAB"],
    ["negativeUnclosedBlockFixtureDocument", "negative-unclosed-block", "TBA-PARSE-BLOCK-UNCLOSED-LAB"],
  ];
  let runId = 20;
  for (const [documentName, fixtureId, diagnosticCode] of cases) {
    const harness = createHarness();
    const result = await harness.run({ documentSource: template(documentName), fixtureId, runId });
    assert.equal(result.ok, false);
    assert.equal(result.resultEnvelope.run.status, "failed");
    assert.equal(result.resultEnvelope.run.committed, false);
    assert.equal(result.resultEnvelope.render.data, "");
    assert.equal(Object.keys(result.resultEnvelope.channelSnapshots).length, 0);
    assert.equal(result.diagnostics.at(-1).code, diagnosticCode);
    assert.equal(result.adapterRun.status, "skipped");
    assert.equal(result.conformanceReport.gate.status, "passed");
    runId += 1;
  }
});

test("a fixed negative fixture is rejected instead of accepting any outcome", async () => {
  const harness = createHarness();
  const result = await harness.run({ documentSource: "# Nu giltig källa", fixtureId: "failed-run" });

  assert.equal(result.ok, true);
  assert.equal(result.conformanceReport.gate.status, "failed");
  assert.ok(result.conformanceReport.gate.blockingRequirementIds.includes("CASE-OUTCOME"));
  assert.ok(result.conformanceReport.gate.blockingRequirementIds.includes("CASE-DIAGNOSTIC"));
});

test("cooperative cancellation is a distinct atomic terminal state", async () => {
  const harness = createHarness();
  const result = await harness.run({
    documentSource: template("cancellationProbeFixtureDocument"),
    fixtureId: "cancellation-probe",
    runId: 77,
    cancelAfterMs: 40,
  });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.resultEnvelope.run.status, "cancelled");
  assert.equal(result.resultEnvelope.run.committed, false);
  assert.equal(result.diagnostics.at(-1).code, "TBA-RUN-CANCELLED-LAB");
  assert.equal(result.executionTrace.at(-1).status, "cancelled");
  assert.equal(Object.keys(result.resultEnvelope.channelSnapshots).length, 0);
  assert.equal(result.resultEnvelope.anchors.length, 0);
  assert.equal(result.resultEnvelope.sourceMaps.length, 0);
  assert.equal(result.adapterRun.status, "skipped");
  assert.equal(result.conformanceReport.cancellation.status, "passed");
  assert.equal(result.conformanceReport.gate.status, "passed");
});

test("stale cancellation cannot rewrite a later run", async () => {
  const harness = createHarness();
  await harness.cancel(404);
  const result = await harness.run({ documentSource: template("conformanceGoldenFixtureDocument"), fixtureId: "conformance-golden", runId: 405 });

  assert.equal(result.ok, true, result.error);
  assert.equal(result.resultEnvelope.run.status, "succeeded");
  assert.equal(result.conformanceReport.cancellation.status, "not-run");
});

test("normalization policy is explicit and the snapshot covers every pipeline layer", async () => {
  const harness = createHarness();
  const result = await harness.run({ documentSource: template("conformanceGoldenFixtureDocument"), fixtureId: "conformance-golden" });
  const report = result.conformanceReport;

  for (const path of ["/transport/runId", "/executionTrace/*/duration", "/adapterRun/adapterRunId", "/cancellation/cancelToken"]) {
    assert.ok(report.normalization.ignoredPaths.includes(path), path);
  }
  assert.equal(report.extensions["textabana.playground"].canonical, false);
  assert.equal(report.extensions["textabana.playground"].fullConformance, false);
  assert.ok(report.structuralSnapshot.source);
  assert.ok(report.structuralSnapshot.modules.length >= 8);
  assert.ok(report.structuralSnapshot.ir);
  assert.ok(report.structuralSnapshot.plan);
  assert.ok(report.structuralSnapshot.result);
  assert.ok(report.structuralSnapshot.projection);
});

test("summary counts and claims are derived from requirement outcomes", async () => {
  const harness = createHarness();
  const result = await harness.run({ documentSource: template("conformanceGoldenFixtureDocument"), fixtureId: "conformance-golden" });
  const report = result.conformanceReport;

  assert.equal(report.summary.passed, report.profiles.filter((profile) => profile.status === "passed").length);
  assert.equal(report.summary.failed, report.profiles.filter((profile) => profile.status === "failed").length);
  assert.equal(report.summary.notRun, report.profiles.filter((profile) => profile.status === "not-run").length);
  assert.deepEqual(
    report.summary.claimableProfiles,
    report.profiles.filter((profile) => profile.claimable && profile.requirements.every((requirement) => requirement.status === "passed")).map((profile) => profile.profile),
  );
  assert.ok(report.stages.every((stage) => stage.status !== "failed"));
  assert.ok(report.profiles.flatMap((profile) => profile.requirements).filter((requirement) => requirement.status === "passed").every((requirement) => requirement.evidenceRefs.length > 0));
});
