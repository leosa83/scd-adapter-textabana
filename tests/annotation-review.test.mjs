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

async function run(documentSource, { runId = 1, moduleSource = template("annotationModule"), adapters = ["org.textabana.annotation-review"] } = {}) {
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
      modules: moduleSource ? [{ path: "modules/annotation.js", content: moduleSource }] : [],
      options: { strictChannels: true, adapters },
    },
  });
  return message;
}

function events(result, channel) {
  return result.channels[channel] ?? [];
}

function projection(result) {
  return result.adapterRun.projections.find((item) => item.adapterRef.adapterId === "org.textabana.annotation-review");
}

test("annotation fixture commits a whole set, immutable candidates, reviews and revisions", async () => {
  const result = await run(template("annotationReviewFixtureDocument"));
  const view = projection(result);

  assert.equal(result.ok, true, result.error);
  assert.equal(events(result, "annotation.set").length, 1);
  assert.equal(events(result, "annotation.candidates").length, 3);
  assert.equal(events(result, "annotation.reviews").length, 3);
  assert.equal(events(result, "annotation.revisions").length, 4);
  assert.equal(result.channelDescriptors["annotation.set"].schemaRef, "schema:textabana/annotation-set/lab-v1");
  assert.equal(result.channelDescriptors["annotation.candidates"].schemaRef, "schema:textabana/annotation-candidate/lab-v1");
  assert.equal(result.channelDescriptors["annotation.reviews"].schemaRef, "schema:textabana/annotation-review/lab-v1");
  assert.equal(result.channelDescriptors["annotation.revisions"].schemaRef, "schema:textabana/annotation-revision/lab-v1");
  const set = events(result, "annotation.set")[0].payload;
  assert.equal(set.wholeSnapshot, true);
  assert.equal(set.candidateCount, 3);
  assert.equal(set.reviewCount, 3);
  assert.equal(set.revisionCount, 4);
  assert.equal(JSON.stringify(set.currentIds), JSON.stringify(["ann-route", "ann-status-reviewed"]));
  for (const event of events(result, "annotation.candidates")) {
    const candidate = event.payload;
    assert.equal(candidate.origin, "ai");
    assert.equal(candidate.status, "candidate");
    assert.equal(candidate.revision, 0);
    assert.ok(candidate.model.id && candidate.model.version && candidate.model.digest.startsWith("fnv1a:"));
    assert.ok(candidate.prompt.id && candidate.prompt.digest.startsWith("fnv1a:"));
    assert.equal(candidate.inputDigest, candidate.bodyDigest);
    assert.ok(candidate.confidence.score >= 0 && candidate.confidence.score <= 1);
    assert.ok(candidate.confidence.method);
  }
  assert.equal(view.status, "succeeded");
  assert.equal(view.output.schemaRef, "textabana.annotation-review-projection/lab-v1");
  assert.equal(result.capabilities.profiles["annotation/1"], "playground-subset");
});

test("human decisions are separate revisions and never mutate model candidate facts", async () => {
  const source = template("annotationReviewFixtureDocument");
  const accepted = await run(source, { runId: 1 });
  const rejected = await run(source.replace('decision="accept"', 'decision="reject"'), { runId: 2 });
  const candidate = (result) => events(result, "annotation.candidates").find((event) => event.payload.annotationId === "ann-route").payload;
  const review = (result) => events(result, "annotation.reviews").find((event) => event.payload.annotationId === "ann-route").payload;

  assert.equal(JSON.stringify(candidate(accepted)), JSON.stringify(candidate(rejected)));
  assert.equal(Object.hasOwn(candidate(accepted), "decision"), false);
  assert.equal(Object.hasOwn(candidate(accepted), "reviewer"), false);
  assert.equal(Object.hasOwn(candidate(accepted), "supersededBy"), false);
  assert.equal(review(accepted).decision, "accept");
  assert.equal(review(rejected).decision, "reject");
  assert.equal(review(accepted).revision, 1);
  assert.equal(accepted.adapterRun.verification.immutable, true);
  assert.equal(accepted.adapterRun.verification.beforeDigest, accepted.adapterRun.verification.afterDigest);
});

test("accept, reject and supersede form an auditable append-only revision chain", async () => {
  const result = await run(template("annotationReviewFixtureDocument"));
  const reviews = new Map(events(result, "annotation.reviews").map((event) => [event.payload.annotationId, event.payload]));
  const revisions = events(result, "annotation.revisions").map((event) => event.payload);

  assert.equal(reviews.get("ann-route").decision, "accept");
  assert.equal(reviews.get("ann-cargo").decision, "reject");
  assert.equal(reviews.get("ann-status").decision, "supersede");
  assert.equal(reviews.get("ann-status").supersededBy, "ann-status-reviewed");
  assert.equal(revisions.find((item) => item.annotationId === "ann-route").state, "accepted");
  assert.equal(revisions.find((item) => item.annotationId === "ann-cargo").state, "rejected");
  assert.equal(revisions.find((item) => item.annotationId === "ann-status").state, "superseded");
  const replacement = revisions.find((item) => item.annotationId === "ann-status-reviewed");
  assert.equal(replacement.origin, "human");
  assert.equal(replacement.supersedes, "ann-status");
  assert.equal(replacement.state, "accepted");
  assert.equal(JSON.stringify(projection(result).output.data.set.currentIds), JSON.stringify(["ann-route", "ann-status-reviewed"]));
});

test("stable annotation identity survives inserted lines and authored reordering", async () => {
  const source = template("annotationReviewFixtureDocument");
  const baseline = await run(source, { runId: 1 });
  const inserted = await run(source.replace("## Annotation: Route", "\n## Annotation: Route"), { runId: 2 });
  const chunks = [...source.matchAll(/## Annotation:[\s\S]*?(?=\n## Annotation:|\n<<<< annotation_review)/g)].map((match) => match[0]);
  assert.equal(chunks.length, 4);
  const reorderedSource = source.replace(chunks.join("\n"), [chunks[1], chunks[0], chunks[2], chunks[3]].join("\n"));
  const reordered = await run(reorderedSource, { runId: 3 });
  const candidate = (result, annotationId) => events(result, "annotation.candidates").find((event) => event.payload.annotationId === annotationId);

  assert.equal(candidate(baseline, "ann-route").payload.inputDigest, candidate(inserted, "ann-route").payload.inputDigest);
  assert.equal(candidate(baseline, "ann-route").target.anchorRef, candidate(inserted, "ann-route").target.anchorRef);
  assert.equal(candidate(inserted, "ann-route").line, candidate(baseline, "ann-route").line + 1);
  assert.equal(candidate(baseline, "ann-route").target.anchorRef, candidate(reordered, "ann-route").target.anchorRef);
  assert.equal(JSON.stringify(projection(reordered).output.data.set.authoredOrder), JSON.stringify(["ann-cargo", "ann-route", "ann-status", "ann-status-reviewed"]));
});

test("candidate, review and revision targets resolve through AnnotationSelector, Anchor, SourceMap and provenance", async () => {
  const result = await run(template("annotationReviewFixtureDocument"));
  const anchorIds = new Set(result.anchors.map((anchor) => anchor.anchorId));
  const mappingIds = new Set(result.sourceMaps.map((mapping) => mapping.mappingId));
  const activityIds = new Set(result.resultEnvelope.provenance.activities.map((activity) => activity.activityId));
  const annotationEvents = [
    ...events(result, "annotation.candidates"),
    ...events(result, "annotation.reviews"),
    ...events(result, "annotation.revisions"),
  ];
  for (const event of annotationEvents) {
    const mapping = result.sourceMaps.find((item) => item.outputRef === event.eventId);
    assert.ok(anchorIds.has(event.target.anchorRef));
    assert.equal(mapping.outputSelector.type, "AnnotationSelector");
    assert.equal(mapping.outputSelector.setId, "voyage-review");
    assert.equal(mapping.outputSelector.annotationId, event.payload.annotationId);
    assert.equal(mapping.outputSelector.revision, event.payload.revision);
    assert.ok(activityIds.has(mapping.generatingActivity));
  }
  const statusCandidate = events(result, "annotation.candidates").find((event) => event.payload.annotationId === "ann-status");
  const replacement = events(result, "annotation.revisions").find((event) => event.payload.annotationId === "ann-status-reviewed");
  const statusReview = events(result, "annotation.reviews").find((event) => event.payload.annotationId === "ann-status");
  const reviewMap = result.sourceMaps.find((item) => item.outputRef === statusReview.eventId);
  assert.equal(reviewMap.mapping, "derived");
  assert.ok(reviewMap.inputAnchorRefs.includes(statusCandidate.target.anchorRef));
  assert.ok(reviewMap.inputAnchorRefs.includes(replacement.target.anchorRef));

  const refs = projection(result).references;
  const eventIds = new Set(Object.values(result.resultEnvelope.channelSnapshots).flatMap((snapshot) => snapshot.events.map((event) => event.eventId)));
  assert.ok(refs.eventRefs.every((ref) => eventIds.has(ref)));
  assert.ok(refs.anchorRefs.every((ref) => anchorIds.has(ref)));
  assert.ok(refs.sourceMapRefs.every((ref) => mappingIds.has(ref)));
  assert.ok(refs.provenanceRefs.every((ref) => activityIds.has(ref)));
});

test("W3C and Label Studio projections retain resolvable Textabana targets", async () => {
  const result = await run(template("annotationReviewFixtureDocument"));
  const data = projection(result).output.data;
  const w3c = data.exports.w3cWebAnnotation;
  const anchorIds = new Set(result.anchors.map((anchor) => anchor.anchorId));

  assert.equal(w3c.type, "AnnotationPage");
  assert.ok(w3c["@context"].includes("http://www.w3.org/ns/anno.jsonld"));
  assert.equal(w3c.items.length, 4);
  for (const item of w3c.items) {
    assert.equal(item.type, "Annotation");
    assert.equal(item.target.source, "doc:document.md");
    assert.ok(anchorIds.has(item.target["textabana:anchorRef"]));
    assert.ok(item.target.selector.some((selector) => selector.type === "TextPositionSelector"));
    assert.ok(item.target.selector.some((selector) => selector.type === "TextQuoteSelector"));
  }
  assert.equal(data.exports.labelStudioTasks.length, 3);
  for (const task of data.exports.labelStudioTasks) {
    assert.ok(task.id && task.data.text);
    assert.equal(task.annotations[0].result[0].type, "choices");
    assert.ok(anchorIds.has(task.meta.textabana.anchorRef));
    assert.ok(task.meta.textabana.candidateEventRef);
    assert.ok(task.meta.textabana.reviewEventRef);
    assert.ok(task.meta.textabana.revisionEventRef);
  }
});

test("annotation set, semantic result and adapter projection are deterministic across transport run ids", async () => {
  const source = template("annotationReviewFixtureDocument");
  const first = await run(source, { runId: 41 });
  const second = await run(source, { runId: 99 });

  assert.notEqual(first.resultEnvelope.run.runId, second.resultEnvelope.run.runId);
  assert.equal(events(first, "annotation.set")[0].payload.setDigest, events(second, "annotation.set")[0].payload.setDigest);
  assert.equal(first.resultEnvelope.resultId, second.resultEnvelope.resultId);
  assert.equal(projection(first).projectionId, projection(second).projectionId);
  assert.equal(JSON.stringify(projection(first).output.data), JSON.stringify(projection(second).output.data));
});

test("invalid snapshots fail atomically while missing or malformed adapter input cannot invalidate a committed result", async () => {
  const source = template("annotationReviewFixtureDocument");
  const invalidSources = [
    source.replace("#ann-cargo", "#ann-route"),
    source.replace(' model_version="1.0"', ""),
    source.replace(' confidence_method="model-reported"', ""),
    source.replace("confidence=0.82", "confidence=1.2"),
    source.replace('supersedes="ann-status"', 'supersedes="ann-cargo"'),
  ];
  for (const invalid of invalidSources) {
    const result = await run(invalid);
    assert.equal(result.ok, false);
    assert.equal(result.emissions, 0);
    assert.equal(JSON.stringify(result.channels), "{}");
    assert.equal(JSON.stringify(result.sourceMaps), "[]");
    assert.equal(result.adapterRun.status, "skipped");
  }

  const missing = await run("plain committed text", { moduleSource: null });
  assert.equal(missing.ok, true);
  assert.equal(projection(missing).status, "unsupported");
  assert.equal(projection(missing).diagnostics[0].code, "TBA-ADAPTER-INPUT-LAB");

  const malformedModule = template("annotationModule").replace("reviewCount: reviewEvents.size,", "reviewCount: reviewEvents.size + 1,");
  const malformed = await run(source, { moduleSource: malformedModule });
  assert.equal(malformed.ok, true, malformed.error);
  assert.equal(malformed.resultEnvelope.run.committed, true);
  assert.equal(projection(malformed).status, "failed");
  assert.equal(projection(malformed).diagnostics[0].code, "TBA-ADAPTER-PROJECTION-LAB");
  assert.equal(malformed.adapterRun.verification.immutable, true);
  assert.match(malformed.resultEnvelope.render.data, /Aurora lämnade Göteborg/);
});
