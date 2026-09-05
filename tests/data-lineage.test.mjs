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

async function run(documentSource, { runId = 1, modules, adapters = ["org.textabana.result-summary", "org.textabana.data-table"] } = {}) {
  let resolveMessage;
  const message = new Promise((resolve) => { resolveMessage = resolve; });
  const context = vm.createContext({
    console,
    performance,
    TextEncoder,
    TextDecoder,
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
      modules: modules ?? [{ path: "modules/data.js", content: template("dataModule") }],
      options: { strictChannels: true, adapters },
    },
  });
  return message;
}

function dataProjection(result) {
  return result.adapterRun.projections.find((projection) => projection.adapterRef.adapterId === "org.textabana.data-table");
}

test("data fixture commits typed datasets, records and a JSON adapter projection", async () => {
  const result = await run(template("dataJoinFixtureDocument"));
  const projection = dataProjection(result);
  const outputDataset = result.channels["data.datasets"].find((event) => event.payload.role === "output");

  assert.equal(result.ok, true, result.error);
  assert.equal(result.channels["data.datasets"].length, 3);
  assert.equal(result.channels["data.input.records"].length, 4);
  assert.equal(result.channels["data.output.records"].length, 2);
  assert.equal(outputDataset.payload.recordCount, 2);
  assert.equal(outputDataset.payload.fields.find((field) => field.name === "estimated_value_usd").type, "integer");
  assert.equal(result.channels["data.output.records"][0].payload.values.estimated_value_usd, 120000);
  assert.equal(projection.status, "succeeded");
  assert.equal(projection.output.mediaType, "application/json");
  assert.equal(projection.output.schemaRef, "textabana.data-table-projection/lab-v1");
  assert.equal(projection.output.artifactRefs.length, 0);
  assert.equal(projection.output.data.rows.length, 2);
  assert.equal(projection.fidelity.mode, "selective");
  assert.equal(result.adapterRun.verification.immutable, true);
  assert.equal(result.capabilities.profiles["data/1"], "playground-subset");
  for (const capability of ["arrow-ipc", "parquet", "duckdb", "artifact-store", "openlineage-export"]) {
    assert.ok(result.capabilities.unsupported.includes(capability));
  }
});

test("inner join preserves left order and produces clean GFM", async () => {
  const source = template("dataJoinFixtureDocument").replace(
    "| ship:aurora | Aurora | Göteborg |\n| ship:isabela | Isabela | Guayaquil |",
    "| ship:isabela | Isabela | Guayaquil |\n| ship:aurora | Aurora | Göteborg |",
  );
  const result = await run(source);
  const keys = result.channels["data.output.records"].map((event) => event.payload.values.ship_id);

  assert.equal(JSON.stringify(keys), JSON.stringify(["ship:isabela", "ship:aurora"]));
  assert.ok(result.output.indexOf("ship:isabela") < result.output.indexOf("ship:aurora"));
  assert.doesNotMatch(result.output, />>>>|<<<<|### ships|### manifests/);
});

test("record and cell lineage resolve through derived SourceMaps", async () => {
  const result = await run(template("dataJoinFixtureDocument"));
  const anchorIds = new Set(result.anchors.map((anchor) => anchor.anchorId));
  const activityIds = new Set(result.resultEnvelope.provenance.activities.map((activity) => activity.activityId));
  const outputEvents = result.channels["data.output.records"];

  for (const event of outputEvents) {
    const mapping = result.sourceMaps.find((candidate) => candidate.outputRef === event.eventId);
    assert.equal(mapping.mapping, "derived");
    assert.equal(mapping.inputAnchorRefs.length, 2);
    assert.equal(new Set(mapping.inputAnchorRefs).size, 2);
    assert.ok(mapping.inputAnchorRefs.every((anchorRef) => anchorIds.has(anchorRef)));
    assert.equal(mapping.outputSelector.datasetId, "voyage_cargo");
    assert.equal(mapping.outputSelector.recordId, event.payload.recordId);
    assert.ok(activityIds.has(mapping.generatingActivity));
  }

  const recordLineage = result.channels["data.lineage"].filter((event) => event.payload.granularity === "record");
  const cellLineage = result.channels["data.lineage"].filter((event) => event.payload.granularity === "cell");
  assert.equal(recordLineage.length, 2);
  assert.equal(cellLineage.length, 10);
  const cargo = cellLineage.find((event) => event.payload.output.column === "cargo");
  const cargoMap = result.sourceMaps.find((mapping) => mapping.outputRef === cargo.eventId);
  assert.equal(JSON.stringify(cargo.payload.inputs.map((selector) => selector.datasetId + "." + selector.column)), JSON.stringify(["manifests.cargo"]));
  assert.equal(cargoMap.outputSelector.column, "cargo");
  assert.equal(cargoMap.mapping, "derived");
});

test("record identity survives inserted lines, sorting and filtering", async () => {
  const source = template("dataJoinFixtureDocument");
  const baseline = await run(source, { runId: 1 });
  const inserted = await run(source.replace("| ship:aurora | Aurora | Göteborg |", "\n| ship:aurora | Aurora | Göteborg |"), { runId: 2 });
  const sorted = await run(source.replace(
    "| ship:aurora | Aurora | Göteborg |\n| ship:isabela | Isabela | Guayaquil |",
    "| ship:isabela | Isabela | Guayaquil |\n| ship:aurora | Aurora | Göteborg |",
  ), { runId: 3 });
  const filtered = await run(source
    .replace("| ship:isabela | Isabela | Guayaquil |\n", "")
    .replace("| ship:isabela | instruments | 45000 |\n", ""), { runId: 4 });
  const aurora = (result) => result.channels["data.output.records"].find((event) => event.payload.values.ship_id === "ship:aurora");

  assert.equal(aurora(baseline).payload.recordId, aurora(inserted).payload.recordId);
  assert.equal(aurora(baseline).target.anchorRef, aurora(inserted).target.anchorRef);
  assert.equal(aurora(baseline).payload.recordId, aurora(sorted).payload.recordId);
  assert.equal(aurora(baseline).payload.recordId, aurora(filtered).payload.recordId);
  assert.equal(aurora(inserted).line, aurora(baseline).line + 1);
});

test("data projection identity is stable across transport run ids", async () => {
  const first = await run(template("dataJoinFixtureDocument"), { runId: 41 });
  const second = await run(template("dataJoinFixtureDocument"), { runId: 99 });

  assert.notEqual(first.resultEnvelope.run.runId, second.resultEnvelope.run.runId);
  assert.equal(first.resultEnvelope.resultId, second.resultEnvelope.resultId);
  assert.equal(dataProjection(first).projectionId, dataProjection(second).projectionId);
  assert.equal(JSON.stringify(dataProjection(first).output.data), JSON.stringify(dataProjection(second).output.data));
});

test("aggregation has explicit derived lineage", async () => {
  const result = await run(template("dataJoinFixtureDocument"));
  const event = result.channels["data.aggregates"][0];
  const mapping = result.sourceMaps.find((candidate) => candidate.outputRef === event.eventId);

  assert.equal(event.payload.operation, "count");
  assert.equal(event.payload.value, 2);
  assert.equal(event.payload.mapping, "derived");
  assert.equal(mapping.mapping, "derived");
  assert.equal(mapping.inputAnchorRefs.length, 2);
  assert.equal(mapping.outputSelector.column, "count");
});

test("missing or inconsistent data input cannot invalidate a committed core result", async () => {
  const missing = await run("plain text", { modules: [] });
  const missingProjection = dataProjection(missing);
  assert.equal(missing.ok, true);
  assert.equal(missingProjection.status, "unsupported");
  assert.equal(missingProjection.output, undefined);
  assert.equal(missingProjection.diagnostics[0].code, "TBA-ADAPTER-INPUT-LAB");

  const malformedModule = `define({ broken: { channels: {
    "data.datasets": { schemaRef: "schema:textabana/dataset/lab-v1" },
    "data.input.records": { schemaRef: "schema:textabana/data-record/lab-v1" },
    "data.output.records": { schemaRef: "schema:textabana/data-record/lab-v1" },
    "data.lineage": { schemaRef: "schema:textabana/data-lineage/lab-v1" }
  }, transform(input, _args, context) {
    context.emit("data.datasets", { datasetId: "out", schemaRef: "schema:out", role: "output", key: ["id"], fields: [{ name: "id", type: "utf8", nullable: false }], recordCount: 2 });
    context.emit("data.input.records", { datasetId: "in", recordId: "in:1", schemaRef: "schema:in", key: { id: "1" }, values: { id: "1" } });
    context.emit("data.output.records", { datasetId: "out", recordId: "out:1", schemaRef: "schema:out", key: { id: "1" }, values: { id: "1" } });
    context.emit("data.lineage", { lineageId: "lineage:1", operation: "inner-join", granularity: "record", mapping: "derived", output: { datasetId: "out", recordId: "out:1" }, inputs: [], inputRecordIds: [], inputAnchorRefs: [] });
    return input;
  } } });`;
  const malformed = await run(`>>>>! include "./modules/broken.js"\n>>>> broken\ncommitted\n<<<< broken`, { modules: [{ path: "modules/broken.js", content: malformedModule }] });
  const malformedProjection = dataProjection(malformed);
  assert.equal(malformed.ok, true);
  assert.equal(malformed.resultEnvelope.run.committed, true);
  assert.equal(malformedProjection.status, "failed");
  assert.equal(malformed.adapterRun.verification.immutable, true);
  assert.equal(malformed.resultEnvelope.render.data.trim(), "committed");
});

test("duplicate join keys fail atomically", async () => {
  const duplicate = template("dataJoinFixtureDocument").replace("| ship:isabela | instruments | 45000 |", "| ship:aurora | instruments | 45000 |");
  const result = await run(duplicate);

  assert.equal(result.ok, false);
  assert.match(result.error, /duplicerad join key/);
  assert.equal(JSON.stringify(result.resultEnvelope.channelSnapshots), "{}");
  assert.equal(JSON.stringify(result.sourceMaps), "[]");
  assert.equal(result.adapterRun.status, "skipped");
});
