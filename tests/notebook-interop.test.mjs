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

async function run(documentSource, { runId = 1, moduleSource = template("notebookModule"), adapters = ["org.textabana.notebook"] } = {}) {
  let resolveMessage;
  const message = new Promise((resolve) => { resolveMessage = resolve; });
  const context = vm.createContext({
    console,
    performance,
    TextEncoder,
    TextDecoder,
    structuredClone,
    Uint8Array,
    btoa,
    atob,
    self: { postMessage: resolveMessage },
  });
  vm.runInContext(workerSource, context);
  await context.self.onmessage({
    data: {
      runId,
      documentPath: "document.md",
      documentSource,
      modules: moduleSource ? [{ path: "modules/notebook.js", content: moduleSource }] : [],
      options: { strictChannels: true, adapters },
    },
  });
  return message;
}

function projection(result) {
  return result.adapterRun.projections.find((item) => item.adapterRef.adapterId === "org.textabana.notebook");
}

function events(result, channel) {
  return result.channels[channel] ?? [];
}

test("notebook fixture commits a whole snapshot, stable cells, outputs and explicit state", async () => {
  const result = await run(template("notebookFixtureDocument"));
  const view = projection(result);

  assert.equal(result.ok, true, result.error);
  assert.equal(events(result, "notebook.snapshot").length, 1);
  assert.equal(events(result, "notebook.cells").length, 3);
  assert.equal(events(result, "notebook.outputs").length, 3);
  assert.equal(events(result, "notebook.state").length, 1);
  assert.equal(result.channelDescriptors["notebook.snapshot"].schemaRef, "schema:textabana/notebook-snapshot/lab-v1");
  assert.equal(result.channelDescriptors["notebook.cells"].schemaRef, "schema:textabana/notebook-cell/lab-v1");
  assert.equal(result.channelDescriptors["notebook.outputs"].schemaRef, "schema:textabana/notebook-output/lab-v1");
  assert.equal(result.channelDescriptors["notebook.state"].schemaRef, "schema:textabana/notebook-state/lab-v1");
  const snapshot = events(result, "notebook.snapshot")[0].payload;
  assert.equal(snapshot.wholeSnapshot, true);
  assert.deepEqual([...snapshot.cellIds], ["cell-source", "cell-route", "cell-confidence"]);
  assert.equal(events(result, "notebook.state")[0].payload.executionSupport, "playground-subset");
  assert.equal(events(result, "notebook.state")[0].payload.kernelState, "not-used");
  assert.equal(events(result, "notebook.cells")[0].payload.metadata.authored.owner, "research");
  assert.equal(view.status, "succeeded");
  assert.equal(view.output.schemaRef, "textabana.notebook-projection/lab-v1");
  assert.equal(view.output.mediaType, "application/json");
  assert.equal(result.capabilities.profiles["notebook/1"], "playground-subset");
});

test("explicit cell identity survives inserted lines and authored reordering", async () => {
  const source = template("notebookFixtureDocument");
  const baseline = await run(source, { runId: 1 });
  const inserted = await run(source.replace("## Cell: Source overview", "\n## Cell: Source overview"), { runId: 2 });
  const chunks = [...source.matchAll(/## Cell:[\s\S]*?(?=\n## Cell:|\n<<<< notebook_snapshot)/g)].map((match) => match[0]);
  assert.equal(chunks.length, 3);
  const reorderedSource = source.replace(chunks.join("\n"), [chunks[2], chunks[0], chunks[1]].join("\n"));
  const reordered = await run(reorderedSource, { runId: 3 });
  const byId = (result, cellId) => events(result, "notebook.cells").find((event) => event.payload.cellId === cellId);

  assert.equal(byId(baseline, "cell-source").payload.sourceDigest, byId(inserted, "cell-source").payload.sourceDigest);
  assert.equal(byId(baseline, "cell-source").target.anchorRef, byId(inserted, "cell-source").target.anchorRef);
  assert.equal(byId(inserted, "cell-source").line, byId(baseline, "cell-source").line + 1);
  assert.equal(byId(baseline, "cell-source").target.anchorRef, byId(reordered, "cell-source").target.anchorRef);
  assert.deepEqual([...projection(reordered).output.data.notebook.cellOrder], ["cell-confidence", "cell-source", "cell-route"]);
});

test("snapshot, semantic result and projection identities ignore transport run id", async () => {
  const source = template("notebookFixtureDocument");
  const first = await run(source, { runId: 41 });
  const second = await run(source, { runId: 99 });

  assert.notEqual(first.resultEnvelope.run.runId, second.resultEnvelope.run.runId);
  assert.equal(events(first, "notebook.snapshot")[0].payload.snapshotId, events(second, "notebook.snapshot")[0].payload.snapshotId);
  assert.equal(first.resultEnvelope.resultId, second.resultEnvelope.resultId);
  assert.equal(projection(first).projectionId, projection(second).projectionId);
  assert.equal(JSON.stringify(projection(first).output.data), JSON.stringify(projection(second).output.data));
});

test("each current output has three real MIME values and a fresh source binding", async () => {
  const result = await run(template("notebookFixtureDocument"));
  const cells = new Map(events(result, "notebook.cells").map((event) => [event.payload.cellId, event.payload]));
  for (const event of events(result, "notebook.outputs")) {
    const output = event.payload;
    assert.deepEqual(Object.keys(output.mimeBundle).sort(), ["application/vnd.textabana.result+json", "text/markdown", "text/plain"]);
    assert.equal(output.sourceDigest, cells.get(output.cellId).sourceDigest);
    assert.equal(output.status, "fresh");
    assert.equal(event.target.notebookId, "voyage-analysis");
    assert.equal(event.target.cellId, output.cellId);
    const cell = projection(result).output.data.cells.find((item) => item.cellId === output.cellId);
    assert.equal(cell.output.outputSourceDigest, cell.sourceDigest);
    assert.equal(cell.output.stale, false);
  }
});

test("cell and output events resolve through CellSelector, Anchor, SourceMap and provenance", async () => {
  const result = await run(template("notebookFixtureDocument"));
  const anchorIds = new Set(result.anchors.map((anchor) => anchor.anchorId));
  const mappingIds = new Set(result.sourceMaps.map((mapping) => mapping.mappingId));
  const activityIds = new Set(result.resultEnvelope.provenance.activities.map((activity) => activity.activityId));
  for (const event of [...events(result, "notebook.cells"), ...events(result, "notebook.outputs")]) {
    const mapping = result.sourceMaps.find((candidate) => candidate.outputRef === event.eventId);
    assert.ok(anchorIds.has(event.target.anchorRef));
    assert.equal(result.anchors.find((anchor) => anchor.anchorId === event.target.anchorRef).target.cellId, event.payload.cellId);
    assert.equal(mapping.outputSelector.type, "CellSelector");
    assert.equal(mapping.outputSelector.notebookId, event.payload.notebookId);
    assert.equal(mapping.outputSelector.cellId, event.payload.cellId);
    assert.ok(activityIds.has(mapping.generatingActivity));
  }
  const refs = projection(result).references;
  const eventIds = new Set(Object.values(result.resultEnvelope.channelSnapshots).flatMap((snapshot) => snapshot.events.map((event) => event.eventId)));
  assert.ok(refs.eventRefs.every((ref) => eventIds.has(ref)));
  assert.ok(refs.anchorRefs.every((ref) => anchorIds.has(ref)));
  assert.ok(refs.sourceMapRefs.every((ref) => mappingIds.has(ref)));
  assert.ok(refs.provenanceRefs.every((ref) => activityIds.has(ref)));
});

test("an older output becomes stale when the same cell id receives new source", async () => {
  const source = template("notebookFixtureDocument");
  const previous = await run(source, { runId: 1 });
  const current = await run(source.replace("Aurora lämnade Göteborg den 4 maj.", "Aurora lämnade Göteborg den 5 maj."), { runId: 2 });
  const oldOutput = events(previous, "notebook.outputs").find((event) => event.payload.cellId === "cell-source").payload;
  const currentCell = events(current, "notebook.cells").find((event) => event.payload.cellId === "cell-source").payload;
  const currentOutput = events(current, "notebook.outputs").find((event) => event.payload.cellId === "cell-source").payload;

  assert.notEqual(oldOutput.sourceDigest, currentCell.sourceDigest);
  assert.equal(currentOutput.sourceDigest, currentCell.sourceDigest);
  assert.equal(events(previous, "notebook.cells")[0].target.anchorRef, events(current, "notebook.cells")[0].target.anchorRef);
  assert.notEqual(events(previous, "notebook.snapshot")[0].payload.snapshotId, events(current, "notebook.snapshot")[0].payload.snapshotId);
  assert.notEqual(projection(previous).projectionId, projection(current).projectionId);
});

test("fresh, session and attached are explicit without fabricated kernel execution", async () => {
  const source = template("notebookFixtureDocument");
  let contentSnapshotId = null;
  for (const profile of ["fresh", "session", "attached"]) {
    const result = await run(source.replace('profile="fresh"', 'profile="' + profile + '"'));
    const state = events(result, "notebook.state")[0].payload;
    assert.equal(result.ok, true, result.error);
    assert.equal(state.requestedProfile, profile);
    assert.equal(state.executionSupport, profile === "fresh" ? "playground-subset" : "contract-only");
    assert.equal(state.kernelState, profile === "fresh" ? "not-used" : "external-unverified");
    assert.equal(projection(result).status, "succeeded");
    contentSnapshotId ??= events(result, "notebook.snapshot")[0].payload.snapshotId;
    assert.equal(events(result, "notebook.snapshot")[0].payload.snapshotId, contentSnapshotId);
  }

  for (const invalid of [
    source.replace('profile="fresh"', 'profile="magic"'),
    source.replace("{#cell-route audience=\"operations\"}", "{#cell-source audience=\"operations\"}"),
    source.replace(" {#cell-source owner=\"research\"}", ""),
  ]) {
    const result = await run(invalid);
    assert.equal(result.ok, false);
    assert.equal(result.emissions, 0);
    assert.equal(JSON.stringify(result.resultEnvelope.channelSnapshots), "{}");
    assert.equal(JSON.stringify(result.sourceMaps), "[]");
    assert.equal(result.adapterRun.status, "skipped");
  }
});

test("missing or malformed notebook input cannot invalidate a committed core result", async () => {
  const missing = await run("plain committed text", { moduleSource: null });
  assert.equal(missing.ok, true);
  assert.equal(projection(missing).status, "unsupported");
  assert.equal(projection(missing).diagnostics[0].code, "TBA-ADAPTER-INPUT-LAB");

  const malformedModule = template("notebookModule").replace("cellCount: cells.length", "cellCount: cells.length + 1");
  const malformed = await run(template("notebookFixtureDocument"), { moduleSource: malformedModule });
  assert.equal(malformed.ok, true, malformed.error);
  assert.equal(malformed.resultEnvelope.run.committed, true);
  assert.equal(projection(malformed).status, "failed");
  assert.equal(projection(malformed).diagnostics[0].code, "TBA-ADAPTER-PROJECTION-LAB");
  assert.equal(malformed.adapterRun.verification.immutable, true);
  assert.match(malformed.resultEnvelope.render.data, /Aurora lämnade Göteborg/);
});
