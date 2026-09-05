import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import {
  materializeCacheKey,
  semanticValueDigest,
  validateExecutionGraph,
} from "../runtime/execution-graph.js";

const workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");

function createHarness() {
  const messages = [];
  const waiters = [];
  const self = {
    postMessage(message) {
      messages.push(message);
      const waiter = waiters.shift();
      if (waiter) waiter(message);
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
    context,
    messages,
    async send(data) {
      const response = new Promise((resolve) => waiters.push(resolve));
      await context.self.onmessage({ data });
      return response;
    },
  };
}

async function run(documentSource, modules, { runId = 1, options = {} } = {}) {
  const harness = createHarness();
  const result = await harness.send({ runId, documentSource, modules, options });
  return { result, harness };
}

const purePipelineModule = {
  path: "modules/pure.js",
  content: `self.moduleInitializations = (self.moduleInitializations || 0) + 1;
define({
  first: {
    version: "1.0.0", state: "pure", determinism: "deterministic", effects: [], behavior: "segment-preserving",
    transform(input) { self.stageCalls = (self.stageCalls || 0) + 1; return String(input).trim() + ":first"; }
  },
  fail: {
    version: "1.0.0", state: "pure", determinism: "deterministic", effects: [],
    transform() { self.stageCalls = (self.stageCalls || 0) + 1; throw new Error("planned failure"); }
  },
  never: {
    version: "1.0.0", state: "pure", determinism: "deterministic", effects: [],
    transform(input) { self.stageCalls = (self.stageCalls || 0) + 1; return input; }
  }
});`,
};

test("the complete graph exists before transforms and survives a middle-stage failure", async () => {
  const { result, harness } = await run(
    `>>>>! include "./modules/pure.js"\n>>>> first | fail | never\nx\n<<<< first`,
    [purePipelineModule],
  );

  assert.equal(result.ok, false);
  assert.equal(result.plan.schema, "textabana.execution-plan/lab-v2");
  assert.equal(result.plan.constructionPhase, "post-module-init-pre-transform");
  assert.equal(JSON.stringify(result.plan.graph.nodes.filter((node) => node.kind === "stage").map((node) => node.function)), JSON.stringify(["first", "fail", "never"]));
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.function)), JSON.stringify(["first", "fail"]));
  assert.equal(result.executionTrace.every((step) => typeof step.planNodeRef === "string"), true);
  assert.equal(harness.context.self.moduleInitializations, 1);
  assert.equal(harness.context.self.stageCalls, 2);
  assert.equal(result.resultEnvelope.run.committed, false);
  assert.equal(result.resultEnvelope.render.data, "");
  assert.equal(JSON.stringify(result.resultEnvelope.channelSnapshots), "{}");
  assert.equal(JSON.stringify(result.executionStats), JSON.stringify({ reads: 0, writes: 0, hits: 0, reused: 0 }));
});

test("execution contracts never infer purity from behavior or missing declarations", async () => {
  const contractModule = {
    path: "modules/contracts.js",
    content: `define({
  pure: { state: "pure", determinism: "deterministic", effects: [], behavior: "reducing", transform: input => input },
  emits: {
    state: "pure", determinism: "deterministic", effects: ["channel:audit"],
    channels: { audit: { payloadKind: "object", schemaRef: "schema:audit/v1" } },
    transform: input => input
  },
  random: { state: "pure", determinism: "nondeterministic", effects: [], transform: input => input },
  session: { state: "session", determinism: "deterministic", effects: [], transform: input => input },
  external: { state: "external", determinism: "external", effects: ["network"], transform: input => input },
  legacy: { behavior: "segment-preserving", transform: input => input }
});`,
  };
  const { result } = await run(
    `>>>>! include "./modules/contracts.js"\n>>>> pure | emits | random | session | external | legacy\nx\n<<<< pure`,
    [contractModule],
  );
  const contracts = Object.fromEntries(result.plan.graph.nodes
    .filter((node) => node.kind === "stage")
    .map((node) => [node.function, node.contract]));

  assert.equal(contracts.pure.cacheEligibility, "candidate");
  assert.equal(contracts.emits.cacheEligibility, "ineligible");
  assert.ok(contracts.emits.observableEffects.includes("channel:audit"));
  assert.equal(contracts.random.determinism, "nondeterministic");
  assert.equal(contracts.session.state, "session");
  assert.equal(contracts.external.state, "external");
  assert.equal(contracts.legacy.behavior, "segment-preserving");
  assert.equal(contracts.legacy.state, "unknown");
  assert.equal(contracts.legacy.determinism, "unknown");
  assert.equal(contracts.legacy.cacheEligibility, "ineligible");
  assert.ok(contracts.legacy.cacheBlockers.includes("effects-undeclared"));
});

test("semantic cache digests preserve exact values and canonical object key order", () => {
  assert.notEqual(semanticValueDigest("a b"), semanticValueDigest("a\nb"));
  assert.notEqual(semanticValueDigest("a b"), semanticValueDigest(" a   b "));
  assert.notEqual(semanticValueDigest("a b"), semanticValueDigest("a\tb"));
  assert.notEqual(semanticValueDigest("1"), semanticValueDigest(1));
  assert.equal(semanticValueDigest({ a: 1, b: [true, "x"] }), semanticValueDigest({ b: [true, "x"], a: 1 }));
});

test("graph ids, cache recipes and trace bindings are deterministic across transport runs", async () => {
  const source = `>>>>! include "./modules/pure.js"\n>>>> first | first\nx\n<<<< first`;
  const first = await run(source, [purePipelineModule], { runId: 11 });
  const second = await run(source, [purePipelineModule], { runId: 99 });
  const firstStages = first.result.plan.graph.nodes.filter((node) => node.kind === "stage");
  const secondStages = second.result.plan.graph.nodes.filter((node) => node.kind === "stage");

  assert.equal(first.result.plan.graph.graphId, second.result.plan.graph.graphId);
  assert.equal(new Set(firstStages.map((node) => node.nodeId)).size, 2);
  assert.equal(JSON.stringify(firstStages.map((node) => node.nodeId)), JSON.stringify(secondStages.map((node) => node.nodeId)));
  assert.equal(JSON.stringify(firstStages.map((node) => node.cache.staticKey)), JSON.stringify(secondStages.map((node) => node.cache.staticKey)));
  assert.equal(JSON.stringify(first.result.executionTrace.map((step) => step.planNodeRef)), JSON.stringify(firstStages.map((node) => node.nodeId)));
  assert.equal(first.result.resultEnvelope.resultId, second.result.resultEnvelope.resultId);
  assert.equal(first.result.conformanceReport.structuralDigest, second.result.conformanceReport.structuralDigest);

  const components = firstStages[0].cache.keyComponents;
  assert.equal(JSON.stringify(Object.keys(components).sort()), JSON.stringify(["argsDigest", "configDigest", "environmentDigest", "inputDigest", "irDigest", "moduleDigest", "moduleIdentityDigest", "profileDigest", "sourceDigest"]));
  assert.equal(components.inputDigest, null);
  assert.equal(first.result.executionTrace[0].cache.semanticKey, materializeCacheKey(firstStages[0], first.result.executionTrace[0].input.digest));
  assert.equal(first.result.executionTrace.every((step) => !step.cache.read && !step.cache.write && !step.cache.hit && !step.cache.reused), true);
});

test("the typed DAG preserves nested block and repeated interval invocation order", async () => {
  const orderModule = {
    path: "modules/order.js",
    content: `define({
  upper: { state: "pure", determinism: "deterministic", effects: [], transform: input => String(input).toUpperCase() },
  wrap: { state: "pure", determinism: "deterministic", effects: [], transform: input => "[" + String(input).trim() + "]" }
});`,
  };
  const { result } = await run(
    `>>>>! include "./modules/order.js"\n>>>>+ wrap @id=ambient\none\n>>>> upper\ntwo\n<<<< upper\nthree\n<<<<+ @id=ambient`,
    [orderModule],
  );
  const graph = result.plan.graph;
  const stages = graph.nodes.filter((node) => node.kind === "stage");
  const positions = new Map(graph.nodes.map((node) => [node.nodeId, node.orderKey[0]]));
  const intervalStages = stages.filter((node) => node.modality === "interval");

  assert.equal(validateExecutionGraph(graph), true);
  assert.equal(JSON.stringify(stages.map((node) => node.function)), JSON.stringify(["wrap", "upper", "wrap", "wrap"]));
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.function)), JSON.stringify(["wrap", "upper", "wrap", "wrap"]));
  assert.equal(new Set(intervalStages.map((node) => node.nodeId)).size, 3);
  assert.equal(new Set(intervalStages.map((node) => node.syntaxStageRef)).size, 1);
  for (const edge of graph.edges) {
    assert.ok(positions.has(edge.from.nodeId));
    assert.ok(positions.has(edge.to.nodeId));
    assert.ok(positions.get(edge.from.nodeId) < positions.get(edge.to.nodeId));
  }
  assert.equal(graph.nodes.filter((node) => node.kind === "render").length, 1);
  assert.equal(graph.nodes.find((node) => node.nodeId === graph.terminalNodeId).kind, "render");

  const invalidPort = JSON.parse(JSON.stringify(graph));
  invalidPort.edges[0].to.port = "missing";
  assert.throws(() => validateExecutionGraph(invalidPort), /okänd inputport/);

  const duplicateEdge = JSON.parse(JSON.stringify(graph));
  duplicateEdge.edges[1].edgeId = duplicateEdge.edges[0].edgeId;
  assert.throws(() => validateExecutionGraph(duplicateEdge), /duplicerat edgeId/);

  const invalidEntries = JSON.parse(JSON.stringify(graph));
  invalidEntries.entryNodeIds = [];
  assert.throws(() => validateExecutionGraph(invalidEntries), /entryNodeIds/);

  const unknownEdgeKind = JSON.parse(JSON.stringify(graph));
  unknownEdgeKind.edges[0].kind = "implicit";
  assert.throws(() => validateExecutionGraph(unknownEdgeKind), /okänd typ/);

  const untypedPort = JSON.parse(JSON.stringify(graph));
  delete untypedPort.nodes[0].outputPort.valueKind;
  assert.throws(() => validateExecutionGraph(untypedPort), /typad outputport/);
});

test("editor baselines distinguish direct, transitive and unchanged candidates without reuse", async () => {
  const harness = createHarness();
  const editorModule = {
    path: "modules/editor-pure.js",
    content: `define({
  first: { state: "pure", determinism: "deterministic", effects: [], transform: input => String(input).trim() + ":1" },
  second: { state: "pure", determinism: "deterministic", effects: [], transform: input => String(input) + ":2" }
});`,
  };
  const source = `>>>>! include "./modules/editor-pure.js"\n>>>> first | second\nalpha\n<<<< first`;
  const opened = await harness.send({
    type: "open",
    requestId: "open:graph",
    document: { documentId: "doc:graph", path: "document.md", source, documentRevision: 1 },
  });
  const firstRun = await harness.send({
    type: "run", requestId: "run:graph:1", runId: 1, documentId: "doc:graph", documentRevision: opened.document.documentRevision, modules: [editorModule], options: {},
  });
  assert.equal(firstRun.invalidationPreview.mode, "cold-no-baseline");

  const bodyStart = Array.from(source.slice(0, source.indexOf("\nalpha\n") + 1)).length;
  const changed = await harness.send({
    type: "change",
    requestId: "change:graph",
    documentId: "doc:graph",
    baseRevision: 1,
    changes: [{ range: { from: bodyStart, to: bodyStart + 5 }, insert: "beta" }],
  });
  const secondRun = await harness.send({
    type: "run", requestId: "run:graph:2", runId: 2, documentId: "doc:graph", documentRevision: changed.document.documentRevision, modules: [editorModule], options: {},
  });
  assert.equal(secondRun.invalidationPreview.mode, "baseline-diff");
  assert.equal(secondRun.invalidationPreview.directlyAffectedNodeIds.length, 1);
  assert.equal(secondRun.invalidationPreview.transitivelyAffectedNodeIds.length, 1);
  assert.equal(secondRun.invalidationPreview.executionDisposition.mode, "planned-fresh");
  assert.equal(secondRun.invalidationPreview.executionDisposition.plannedNodeIds.length, 2);
  assert.equal(JSON.stringify(secondRun.invalidationPreview.executionDisposition.reusedNodeIds), "[]");
  assert.equal(JSON.stringify(secondRun.invalidationPreview.cacheStats), JSON.stringify({ reads: 0, writes: 0, hits: 0, reused: 0 }));

  const unchangedRun = await harness.send({
    type: "run", requestId: "run:graph:3", runId: 3, documentId: "doc:graph", documentRevision: changed.document.documentRevision, modules: [editorModule], options: {},
  });
  assert.equal(unchangedRun.invalidationPreview.mode, "baseline-diff");
  assert.equal(unchangedRun.invalidationPreview.directlyAffectedNodeIds.length, 0);
  assert.equal(unchangedRun.invalidationPreview.transitivelyAffectedNodeIds.length, 0);
  assert.equal(unchangedRun.invalidationPreview.unchangedNodeIds.length, 2);
  assert.equal(unchangedRun.invalidationPreview.retainedCandidateNodeIds.length, 2);
  assert.equal(unchangedRun.executionTrace.length, 2);
  assert.equal(unchangedRun.executionStats.reused, 0);
});

test("renaming a same-width function invalidates the planned stage", async () => {
  const harness = createHarness();
  const stageModule = {
    path: "modules/case.js",
    content: `define({
  upper: { state: "pure", determinism: "deterministic", effects: [], transform: input => String(input).toUpperCase() },
  lower: { state: "pure", determinism: "deterministic", effects: [], transform: input => String(input).toLowerCase() }
});`,
  };
  const source = `>>>>! include "./modules/case.js"\n>>>> upper\nTextabana\n<<<< upper`;
  const opened = await harness.send({
    type: "open",
    requestId: "open:function-rename",
    document: { documentId: "doc:function-rename", path: "document.md", source, documentRevision: 1 },
  });
  const firstRun = await harness.send({
    type: "run", requestId: "run:function-rename:1", runId: 1, documentId: opened.document.documentId, documentRevision: opened.document.documentRevision, modules: [stageModule], options: {},
  });
  assert.equal(firstRun.output.trim(), "TEXTABANA");

  const functionOffset = Array.from(source.slice(0, source.indexOf("upper"))).length;
  const changed = await harness.send({
    type: "change",
    requestId: "change:function-rename",
    documentId: opened.document.documentId,
    baseRevision: opened.document.documentRevision,
    changes: [
      { range: { from: functionOffset, to: functionOffset + 5 }, insert: "lower" },
      { range: { from: Array.from(source.slice(0, source.lastIndexOf("upper"))).length, to: Array.from(source.slice(0, source.lastIndexOf("upper"))).length + 5 }, insert: "lower" },
    ],
  });
  const secondRun = await harness.send({
    type: "run", requestId: "run:function-rename:2", runId: 2, documentId: changed.document.documentId, documentRevision: changed.document.documentRevision, modules: [stageModule], options: {},
  });

  assert.equal(secondRun.output.trim(), "textabana");
  assert.equal(secondRun.invalidationPreview.directlyAffectedNodeIds.length, 1);
  assert.equal(secondRun.invalidationPreview.unchangedNodeIds.length, 0);
  assert.equal(secondRun.executionStats.reused, 0);
});

test("changing an include path invalidates module identity even when content digests match", async () => {
  const harness = createHarness();
  const moduleContent = `define({
  stamp: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input, args, context) { return context.modulePath + ":" + String(input).trim(); }
  }
});`;
  const moduleSet = [
    { path: "modules/a.js", content: moduleContent },
    { path: "modules/b.js", content: moduleContent },
  ];
  const source = `>>>>! include "./modules/a.js"\n>>>> stamp\nx\n<<<< stamp`;
  const opened = await harness.send({
    type: "open",
    requestId: "open:module-identity",
    document: { documentId: "doc:module-identity", path: "document.md", source, documentRevision: 1 },
  });
  const firstRun = await harness.send({
    type: "run", requestId: "run:module-identity:1", runId: 1, documentId: opened.document.documentId, documentRevision: opened.document.documentRevision, modules: moduleSet, options: {},
  });
  assert.equal(firstRun.output.trim(), "modules/a.js:x");

  const pathOffset = Array.from(source.slice(0, source.indexOf("a.js"))).length;
  const changed = await harness.send({
    type: "change",
    requestId: "change:module-identity",
    documentId: opened.document.documentId,
    baseRevision: opened.document.documentRevision,
    changes: [{ range: { from: pathOffset, to: pathOffset + 1 }, insert: "b" }],
  });
  const secondRun = await harness.send({
    type: "run", requestId: "run:module-identity:2", runId: 2, documentId: changed.document.documentId, documentRevision: changed.document.documentRevision, modules: moduleSet, options: {},
  });

  assert.equal(secondRun.output.trim(), "modules/b.js:x");
  assert.equal(secondRun.invalidationPreview.directlyAffectedNodeIds.length, 1);
  assert.equal(secondRun.invalidationPreview.unchangedNodeIds.length, 0);
});

test("changing interval order invalidates the changed execution topology", async () => {
  const harness = createHarness();
  const intervalModule = {
    path: "modules/interval-order.js",
    content: `define({
  a: { state: "pure", determinism: "deterministic", effects: [], transform: input => "A(" + String(input).trim() + ")" },
  b: { state: "pure", determinism: "deterministic", effects: [], transform: input => "B(" + String(input).trim() + ")" }
});`,
  };
  const source = `>>>>! include "./modules/interval-order.js"\n>>>>+ a @id=a @order=1\n>>>>+ b @id=b @order=2\nx\n<<<<+ @id=a\n<<<<+ @id=b`;
  const opened = await harness.send({
    type: "open",
    requestId: "open:interval-order",
    document: { documentId: "doc:interval-order", path: "document.md", source, documentRevision: 1 },
  });
  const firstRun = await harness.send({
    type: "run", requestId: "run:interval-order:1", runId: 1, documentId: opened.document.documentId, documentRevision: opened.document.documentRevision, modules: [intervalModule], options: {},
  });
  assert.equal(firstRun.output.trim(), "B(A(x))");

  const firstOrderOffset = Array.from(source.slice(0, source.indexOf("@order=1") + "@order=".length)).length;
  const secondOrderOffset = Array.from(source.slice(0, source.indexOf("@order=2") + "@order=".length)).length;
  const changed = await harness.send({
    type: "change",
    requestId: "change:interval-order",
    documentId: opened.document.documentId,
    baseRevision: opened.document.documentRevision,
    changes: [
      { range: { from: firstOrderOffset, to: firstOrderOffset + 1 }, insert: "2" },
      { range: { from: secondOrderOffset, to: secondOrderOffset + 1 }, insert: "1" },
    ],
  });
  const secondRun = await harness.send({
    type: "run", requestId: "run:interval-order:2", runId: 2, documentId: changed.document.documentId, documentRevision: changed.document.documentRevision, modules: [intervalModule], options: {},
  });
  const classified = new Set([
    ...secondRun.invalidationPreview.directlyAffectedNodeIds,
    ...secondRun.invalidationPreview.transitivelyAffectedNodeIds,
    ...secondRun.invalidationPreview.unchangedNodeIds,
  ]);

  assert.equal(secondRun.output.trim(), "A(B(x))");
  assert.equal(classified.size, 2);
  assert.equal(secondRun.invalidationPreview.unchangedNodeIds.length, 0);
  assert.ok(secondRun.invalidationPreview.reasons.some((reason) => reason.code === "TBA-INVALIDATION-TOPOLOGY-LAB"));
});
