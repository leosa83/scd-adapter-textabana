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

const modules = [
  { path: "modules/core.js", content: template("coreModule") },
  { path: "modules/editorial.js", content: template("editorialModule") },
  { path: "modules/metadata.js", content: template("metadataModule") },
  { path: "modules/base64.js", content: template("base64Module") },
  { path: "modules/data.js", content: template("dataModule") },
  { path: "modules/notebook.js", content: template("notebookModule") },
  { path: "modules/annotation.js", content: template("annotationModule") },
];

async function run(documentSource, runId = 1) {
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
      modules,
      options: { strictChannels: true },
    },
  });
  return message;
}

test("scope-torture drives the shared language, editor and channel projections", async () => {
  const result = await run(template("sampleDocument"));

  assert.equal(result.ok, true, result.error);
  assert.ok(result.inspection.scopes.length >= 6);
  assert.ok(result.inspection.blocks.length >= 3);
  assert.ok(result.plan.steps.length >= 6);
  assert.ok(result.channels["system.out"].length >= 2);
  assert.ok(result.channels.records.length >= 1);
  assert.ok(result.channels.metrics.length >= 1);
  assert.equal(result.channelDescriptors.records.declared, true);
  assert.equal(result.channelDescriptors.metrics.declared, true);
  assert.doesNotMatch(result.output, />>>>|<<<<|\{\.claim/);
});

test("editor-revision emits stable row anchors and physical line projections", async () => {
  const first = await run(template("editorFixtureDocument"), 1);
  const movedSource = template("editorFixtureDocument").replace(
    "Fartyget Aurora avgick från Göteborg den 4 maj.\nLasten uppgavs",
    "En nytillkommen ingress.\nFartyget Aurora avgick från Göteborg den 4 maj.\nLasten uppgavs",
  );
  const second = await run(movedSource, 2);
  const firstRows = first.channels["system.out"].filter((event) => event.target.mode === "row");
  const secondRows = second.channels["system.out"].filter((event) => event.target.mode === "row");
  const auroraBefore = firstRows.find((event) => event.payload.text.startsWith("Fartyget Aurora"));
  const auroraAfter = secondRows.find((event) => event.rowId === auroraBefore.rowId);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(auroraAfter.target.anchorRef, auroraBefore.target.anchorRef);
  assert.equal(auroraAfter.line, auroraBefore.line + 1);
});

test("channel fan-out keeps render separate from declared channels", async () => {
  const result = await run(template("channelFixtureDocument"));

  assert.equal(result.ok, true, result.error);
  assert.match(result.output, /Aurora lämnade Göteborg/);
  assert.deepEqual(Object.keys(result.channels), ["system.out", "records", "metrics"]);
  assert.equal(result.resultEnvelope.run.committed, true);
  assert.equal(result.resultEnvelope.channelSnapshots.records.descriptor.schemaRef, "schema:textabana/record/v1");
});

test("base64 inverse remains a golden playground fixture", async () => {
  const result = await run(template("base64FixtureDocument"));

  assert.equal(result.ok, true, result.error);
  assert.equal(result.output.trim(), "# Base64 som nästlad intervallfunktion ger invers\n\n\nTextabana kan transformera den här texten");
  assert.equal(JSON.stringify(result.plan.steps.map((step) => step.function)), JSON.stringify(["base64encode", "base64decode"]));
});

test("failed-run fixture exposes diagnostics but no committed domain output", async () => {
  const result = await run(template("failedRunFixtureDocument"));

  assert.equal(result.ok, false);
  assert.match(result.error, /saknar deklarerad ChannelDescriptor/);
  assert.equal(result.resultEnvelope.run.status, "failed");
  assert.equal(result.resultEnvelope.render.data, "");
  assert.equal(JSON.stringify(result.resultEnvelope.channelSnapshots), "{}");
  assert.equal(result.diagnostics[0].code, "TBA-TYPE-CHANNEL-LAB");
});

test("data-join fixture produces typed records and clean Markdown", async () => {
  const result = await run(template("dataJoinFixtureDocument"));

  assert.equal(result.ok, true, result.error);
  assert.equal(result.channels["data.datasets"].length, 3);
  assert.equal(result.channels["data.input.records"].length, 4);
  assert.equal(result.channels["data.output.records"].length, 2);
  assert.equal(result.channels["data.lineage"].filter((event) => event.payload.granularity === "record").length, 2);
  assert.equal(result.channels["data.lineage"].filter((event) => event.payload.granularity === "cell").length, 10);
  assert.equal(result.channels["data.aggregates"][0].payload.mapping, "derived");
  assert.equal(result.channels["data.output.records"][0].payload.values.estimated_value_usd, 120000);
  assert.match(result.output, /\| ship:aurora \| Aurora \| Göteborg \| silver \| 120000 \|/);
  assert.doesNotMatch(result.output, />>>>|<<<<|### ships|### manifests/);
});

test("notebook-snapshot fixture exposes stable cells and a clean Markdown render", async () => {
  const result = await run(template("notebookFixtureDocument"));

  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(result.channels["notebook.cells"].map((event) => event.payload.cellId)), JSON.stringify(["cell-source", "cell-route", "cell-confidence"]));
  assert.equal(result.channels["notebook.snapshot"][0].payload.wholeSnapshot, true);
  assert.equal(result.channels["notebook.outputs"].length, 3);
  assert.match(result.output, /## Cell: Source overview/);
  assert.doesNotMatch(result.output, />>>>|<<<<|\{#cell-/);
});

test("annotation-review fixture exposes immutable review channels and clean Markdown", async () => {
  const result = await run(template("annotationReviewFixtureDocument"));

  assert.equal(result.ok, true, result.error);
  assert.equal(result.channels["annotation.set"].length, 1);
  assert.equal(result.channels["annotation.candidates"].length, 3);
  assert.equal(result.channels["annotation.reviews"].length, 3);
  assert.equal(result.channels["annotation.revisions"].length, 4);
  assert.equal(result.channels["annotation.candidates"][0].payload.status, "candidate");
  assert.equal(Object.hasOwn(result.channels["annotation.candidates"][0].payload, "decision"), false);
  assert.match(result.output, /## Annotation: Route/);
  assert.match(result.output, /Positionen kräver extern verifiering/);
  assert.doesNotMatch(result.output, />>>>|<<<<|\{#ann-/);
});
