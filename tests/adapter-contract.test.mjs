import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");

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
    self,
  });
  vm.runInContext(workerSource, context);

  return async function run({ documentSource, modules, runId = 1, documentPath = "document.md", options = {} }) {
    const message = new Promise((resolve) => pending.set(runId, resolve));
    await context.self.onmessage({
      data: {
        runId,
        documentPath,
        documentSource,
        modules,
        options: { strictChannels: true, adapters: ["org.textabana.result-summary"], ...options },
      },
    });
    return message;
  };
}

const metadataSource = `define({
  inspect: {
    channels: {
      audit: {
        payloadKind: "object",
        mediaType: "application/json",
        schemaRef: "schema:audit/v1",
        delivery: "snapshot",
        persistence: "durable",
        ordering: "global-sequence",
        schema: { type: "object", required: ["text"] }
      }
    },
    transform(input, _args, context) {
      String(input).trim().split("\\n").forEach((text, index) => {
        const location = { row: index + 1, rowId: "row:" + text.toLowerCase(), lineOffset: index };
        context.system.out.row(location.rowId, { text }, location);
        context.emit("audit", { text }, location);
      });
      return input;
    }
  }
});`;

const fixture = `>>>>! include "./modules/metadata.js"
>>>> inspect
Alpha
Beta
<<<< inspect`;

const fixtureModules = [{ path: "modules/metadata.js", content: metadataSource }];

test("adapter registry publishes a machine-readable post-commit contract", async () => {
  const run = createHarness();
  const result = await run({ documentSource: fixture, modules: fixtureModules });

  assert.equal(result.ok, true, result.error);
  assert.equal(result.adapterRun.schema, "textabana.adapter-run/lab-v1");
  assert.equal(result.adapterRun.status, "succeeded");
  assert.equal(result.capabilities.profiles["adapter-contract/1"], "playground-subset");

  const executable = result.adapterRun.manifests.find((manifest) => manifest.adapterId === "org.textabana.result-summary");
  assert.equal(executable.schema, "textabana.adapter-manifest/lab-v1");
  assert.equal(executable.contract, "adapter-contract/1");
  assert.equal(executable.phase, "post-commit");
  assert.equal(executable.execution, "pure");
  assert.equal(executable.support, "playground-subset");
  assert.equal(executable.deterministic, true);
  assert.ok(executable.manifestDigest.startsWith("fnv1a:"));
  assert.ok(executable.capabilities.required.includes("atomic-success-result"));

  for (const adapterId of ["org.textabana.data-table", "org.textabana.notebook", "org.textabana.annotation-review"]) {
    assert.equal(result.adapterRun.manifests.find((manifest) => manifest.adapterId === adapterId).support, "contract-only");
  }
});

test("reference projection is source-bound, selective and fully resolvable", async () => {
  const run = createHarness();
  const result = await run({ documentSource: fixture, modules: fixtureModules });
  const projection = result.adapterRun.projections[0];

  assert.equal(projection.schema, "textabana.adapter-projection/lab-v1");
  assert.equal(projection.status, "succeeded");
  assert.equal(projection.sourceResultRef.resultId, result.resultEnvelope.resultId);
  assert.equal(projection.adapterRef.manifestDigest, result.adapterRun.manifests[0].manifestDigest);
  assert.equal(projection.output.schemaRef, "textabana.result-summary/lab-v1");
  assert.equal(projection.fidelity.mode, "selective");
  assert.equal(projection.fidelity.requiresSourceResult, true);
  assert.ok(projection.fidelity.omittedPaths.length > 0);

  const eventIds = new Set(Object.values(result.resultEnvelope.channelSnapshots).flatMap((snapshot) => snapshot.events.map((event) => event.eventId)));
  const anchorIds = new Set(result.resultEnvelope.anchors.map((anchor) => anchor.anchorId));
  const mappingIds = new Set(result.resultEnvelope.sourceMaps.map((mapping) => mapping.mappingId));
  const activityIds = new Set(result.resultEnvelope.provenance.activities.map((activity) => activity.activityId));
  assert.ok(projection.references.eventRefs.every((reference) => eventIds.has(reference)));
  assert.ok(projection.references.anchorRefs.every((reference) => anchorIds.has(reference)));
  assert.ok(projection.references.sourceMapRefs.every((reference) => mappingIds.has(reference)));
  assert.ok(projection.references.provenanceRefs.every((reference) => activityIds.has(reference)));
  assert.equal(JSON.stringify(projection.output.data.channels.map((channel) => channel.name)), JSON.stringify(["system.out", "audit"]));
  assert.equal(result.adapterRun.verification.immutable, true);
  assert.equal(result.adapterRun.verification.beforeDigest, result.adapterRun.verification.afterDigest);
});

test("semantic result and projection ids are stable across transport run ids", async () => {
  const run = createHarness();
  const first = await run({ documentSource: fixture, modules: fixtureModules, runId: 41 });
  const second = await run({ documentSource: fixture, modules: fixtureModules, runId: 99 });

  assert.notEqual(first.resultEnvelope.run.runId, second.resultEnvelope.run.runId);
  assert.equal(first.resultEnvelope.resultId, second.resultEnvelope.resultId);
  assert.equal(first.adapterRun.projections[0].projectionId, second.adapterRun.projections[0].projectionId);
  assert.deepEqual(first.adapterRun.projections[0].output.data, second.adapterRun.projections[0].output.data);
});

test("contract-only adapters never fabricate domain output or invalidate core success", async () => {
  const run = createHarness();
  const result = await run({
    documentSource: fixture,
    modules: fixtureModules,
    options: { strictChannels: true, adapters: ["org.textabana.data-table"] },
  });
  const projection = result.adapterRun.projections[0];

  assert.equal(result.ok, true);
  assert.equal(result.resultEnvelope.run.committed, true);
  assert.equal(projection.status, "unsupported");
  assert.equal(projection.output, undefined);
  assert.equal(projection.diagnostics[0].code, "TBA-ADAPTER-CONTRACT-ONLY-LAB");
  assert.equal(result.adapterRun.verification.immutable, true);
  assert.equal(result.capabilities.profiles["data/1"], "contract-only");
});

test("failed core runs skip all post-commit adapters", async () => {
  const run = createHarness();
  const result = await run({
    documentSource: ">>>> missing\nnever committed\n<<<< missing",
    modules: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.resultEnvelope.run.status, "failed");
  assert.equal(result.adapterRun.status, "skipped");
  assert.equal(result.adapterRun.projections.length, 0);
  assert.equal(result.adapterRun.diagnostics[0].code, "TBA-ADAPTER-SKIPPED-LAB");
});

test("repeated stages on one pipeline line receive unique invocation and activity identities", async () => {
  const run = createHarness();
  const result = await run({
    documentSource: `>>>>! include "./modules/repeat.js"\n>>>> repeat | repeat\nx\n<<<< repeat`,
    modules: [{
      path: "modules/repeat.js",
      content: `define({ repeat: { transform(input, _args, context) { context.system.out.line({ value: input }); return input; } } });`,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(new Set(result.plan.steps.map((step) => step.stageId)).size, 2);
  assert.equal(new Set(result.plan.steps.map((step) => step.invocationId)).size, 2);
  assert.equal(new Set(result.plan.steps.map((step) => step.activityId)).size, 2);
  assert.equal(new Set(result.channels["system.out"].map((event) => event.provenanceRef)).size, 2);
});

test("fresh runs recompile modules instead of leaking closure state", async () => {
  const run = createHarness();
  const modules = [{
    path: "modules/counter.js",
    content: `let count = 0; define({ counter: input => String(input).trim() + ":" + (++count) });`,
  }];
  const source = `>>>>! include "./modules/counter.js"\n>>>> counter\nvalue\n<<<< counter`;
  const first = await run({ documentSource: source, modules, runId: 1 });
  const second = await run({ documentSource: source, modules, runId: 2 });

  assert.equal(first.output.trim(), "value:1");
  assert.equal(second.output.trim(), "value:1");
});

test("row anchors are scoped by document identity and transient channels stay outside committed snapshots", async () => {
  const run = createHarness();
  const warningModule = [{
    path: "modules/warn.js",
    content: `define({ inspect: { transform(input, _args, context) { context.warn("review"); context.system.out.row("row:alpha", { text: "Alpha" }); return input; } } });`,
  }];
  const source = `>>>>! include "./modules/warn.js"\n>>>> inspect\nAlpha\n<<<< inspect`;
  const first = await run({ documentSource: source, modules: warningModule, runId: 1, documentPath: "first.md" });
  const second = await run({ documentSource: source, modules: warningModule, runId: 2, documentPath: "second.md" });

  const firstRow = first.channels["system.out"][0];
  const secondRow = second.channels["system.out"][0];
  assert.notEqual(firstRow.target.anchorRef, secondRow.target.anchorRef);
  assert.equal(firstRow.rowId, secondRow.rowId);
  assert.ok(first.channels.diagnostics);
  assert.equal(first.resultEnvelope.channelSnapshots.diagnostics, undefined);
});
