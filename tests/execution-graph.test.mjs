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
    structuredClone,
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
  assert.equal(result.executionStats.planned, 3);
  assert.equal(result.executionStats.executed, 2);
  assert.equal(result.executionStats.writes, 0);
  assert.equal(result.executionStats.reused, 0);
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
  assert.equal(contracts.pure.parallelEligibility, "candidate");
  assert.equal(contracts.emits.cacheEligibility, "ineligible");
  assert.equal(contracts.emits.parallelEligibility, "ineligible");
  assert.ok(contracts.emits.observableEffects.includes("channel:audit"));
  assert.equal(contracts.random.determinism, "nondeterministic");
  assert.equal(contracts.session.state, "session");
  assert.equal(contracts.external.state, "external");
  assert.equal(contracts.legacy.behavior, "segment-preserving");
  assert.equal(contracts.legacy.state, "unknown");
  assert.equal(contracts.legacy.determinism, "unknown");
  assert.equal(contracts.legacy.cacheEligibility, "ineligible");
  assert.equal(contracts.legacy.parallelEligibility, "ineligible");
  assert.ok(contracts.legacy.cacheBlockers.includes("effects-undeclared"));
});

test("cacheable module context excludes internal planning objects", async () => {
  const contextModule = {
    path: "modules/context.js",
    content: `define({
  inspect_context: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input, _args, context) {
      return String(context.planNode === undefined) + ":" + context.modulePath + ":" + String(context.authoredInput).trim() + ":" + String(input).trim();
    }
  }
});`,
  };
  const { result } = await run(
    `>>>>! include "./modules/context.js"
>>>> inspect_context
value
<<<< inspect_context`,
    [contextModule],
  );

  assert.equal(result.ok, true, result.error);
  assert.equal(result.output.trim(), "true:modules/context.js:value:value");
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
  assert.equal(first.result.plan.runtimePolicy.cache, "disabled-non-editor");
  assert.equal(first.result.executionReport.mode, "fresh-cache-disabled");
  assert.equal(new Set(firstStages.map((node) => node.nodeId)).size, 2);
  assert.equal(JSON.stringify(firstStages.map((node) => node.nodeId)), JSON.stringify(secondStages.map((node) => node.nodeId)));
  assert.equal(JSON.stringify(firstStages.map((node) => node.cache.staticKey)), JSON.stringify(secondStages.map((node) => node.cache.staticKey)));
  assert.equal(JSON.stringify(first.result.executionTrace.map((step) => step.planNodeRef)), JSON.stringify(firstStages.map((node) => node.nodeId)));
  assert.equal(first.result.resultEnvelope.resultId, second.result.resultEnvelope.resultId);
  assert.equal(first.result.conformanceReport.structuralDigest, second.result.conformanceReport.structuralDigest);

  const components = firstStages[0].cache.keyComponents;
  assert.equal(JSON.stringify(Object.keys(components).sort()), JSON.stringify(["argsDigest", "configDigest", "contextDigest", "contractDigest", "dependencyDigest", "environmentDigest", "functionDigest", "inputDigest", "irDigest", "moduleDigest", "moduleIdentityDigest", "moduleSetDigest", "profileDigest", "sourceDigest"]));
  assert.equal(components.inputDigest, null);
  assert.equal(first.result.executionTrace[0].schema, "textabana.execution-step/lab-v2");
  assert.equal(first.result.executionTrace[0].cache.semanticKey, materializeCacheKey(firstStages[0], first.result.executionTrace[0].cache.inputDigest));
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

test("editor baselines include authored block context in direct invalidation before verification", async () => {
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
  assert.equal(secondRun.invalidationPreview.directlyAffectedNodeIds.length, 2);
  assert.equal(secondRun.invalidationPreview.transitivelyAffectedNodeIds.length, 0);
  assert.equal(secondRun.invalidationPreview.executionDisposition.mode, "advisory");
  assert.equal(secondRun.invalidationPreview.executionDisposition.plannedNodeIds.length, 2);
  assert.equal(JSON.stringify(secondRun.invalidationPreview.executionDisposition.reusedNodeIds), "[]");
  assert.equal(JSON.stringify(secondRun.invalidationPreview.cacheStats), JSON.stringify({ reads: 0, writes: 0, hits: 0, misses: 0, reused: 0 }));

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

test("two committed revision observations enable selective reuse on the next occurrence", async () => {
  const harness = createHarness();
  const cacheModule = {
    path: "modules/cache.js",
    content: `define({
  branch: {
    version: "1.0.0", state: "pure", determinism: "deterministic", effects: [], outputs: ["render"],
    transform(input, args) {
      self.cacheStageCalls = (self.cacheStageCalls || 0) + 1;
      return String(args.name) + ":" + String(input).trim();
    }
  }
});`,
  };
  const sourceOne = `>>>>! include "./modules/cache.js"
>>>> branch name="left"
Aurora
<<<< branch
>>>> branch name="right"
Göteborg
<<<< branch`;
  const sourceTwo = sourceOne.replace("Göteborg", "Stockholm");
  const opened = await harness.send({
    type: "open",
    requestId: "open:cache",
    document: { documentId: "doc:cache", path: "document.md", source: sourceOne, documentRevision: 1 },
  });
  const first = await harness.send({
    type: "run", requestId: "run:cache:1", runId: 101, documentId: "doc:cache", documentRevision: opened.document.documentRevision, modules: [cacheModule], options: {},
  });

  assert.equal(first.ok, true, first.error);
  assert.equal(first.executionReport.transactionState, "committed");
  assert.equal(first.executionStats.executed, 2);
  assert.equal(first.executionStats.reused, 0);
  assert.equal(first.executionStats.observations, 2);
  assert.equal(first.executionStats.writes, 2);
  assert.equal(harness.context.self.cacheStageCalls, 2);

  const changed = await harness.send({
    type: "change",
    requestId: "change:cache:right",
    documentId: "doc:cache",
    baseRevision: 1,
    changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }],
  });
  const second = await harness.send({
    type: "run", requestId: "run:cache:2", runId: 102, documentId: "doc:cache", documentRevision: changed.document.documentRevision, modules: [cacheModule], options: {},
  });

  assert.equal(second.ok, true, second.error);
  assert.equal(second.executionStats.executed, 2);
  assert.equal(second.executionStats.reused, 0);
  assert.equal(second.executionStats.verified, 1);
  assert.equal(second.executionReport.nodeResolutions[0].cache.verification, "verified-by-two-observations");
  assert.equal(second.executionReport.nodeResolutions[1].cache.verification, "probation");
  assert.equal(harness.context.self.cacheStageCalls, 4);

  const warm = await harness.send({
    type: "run", requestId: "run:cache:3", runId: 103, documentId: "doc:cache", documentRevision: changed.document.documentRevision, modules: [cacheModule], options: {},
  });

  assert.equal(warm.ok, true, warm.error);
  assert.equal(warm.executionStats.executed, 1);
  assert.equal(warm.executionStats.reads, 2);
  assert.equal(warm.executionStats.hits, 1);
  assert.equal(warm.executionStats.misses, 1);
  assert.equal(warm.executionStats.reused, 1);
  assert.equal(warm.executionStats.writes, 0);
  assert.equal(warm.executionReport.nodeResolutions[1].cache.evidence, 1);
  assert.equal(warm.executionReport.nodeResolutions[1].reason, "same-revision-observation-ignored");
  assert.equal(harness.context.self.cacheStageCalls, 5);
  assert.equal(JSON.stringify(warm.executionTrace.map((step) => step.functionInvoked)), JSON.stringify([false, true]));
  assert.equal(warm.executionTrace[0].executionMode, "cache-reuse");
  assert.equal(warm.resultEnvelope.provenance.activities[0].activityType, "cache-materialization");
  assert.equal(warm.output, second.output);
  assert.equal(warm.resultEnvelope.resultId, second.resultEnvelope.resultId);
  assert.equal(warm.conformanceReport.structuralDigest, second.conformanceReport.structuralDigest);

  const replaced = await harness.send({
    type: "open",
    requestId: "open:cache:replacement",
    replaceSession: true,
    document: { documentId: "doc:cache", path: "document.md", source: sourceTwo, documentRevision: 1 },
  });
  const coldAgain = await harness.send({
    type: "run", requestId: "run:cache:replacement", runId: 104, documentId: "doc:cache", documentRevision: replaced.document.documentRevision, modules: [cacheModule], options: {},
  });
  assert.equal(coldAgain.invalidationPreview.mode, "cold-no-baseline");
  assert.equal(coldAgain.executionStats.reused, 0);
  assert.equal(coldAgain.executionStats.executed, 2);
  assert.equal(harness.context.self.cacheStageCalls, 7);
});

test("failed editor runs roll back pending cache observations", async () => {
  const harness = createHarness();
  const rollbackModule = {
    path: "modules/rollback.js",
    content: `define({
  first: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input) { self.rollbackFirstCalls = (self.rollbackFirstCalls || 0) + 1; return String(input).trim(); }
  },
  gate: {
    state: "run", determinism: "deterministic", effects: ["run-state"],
    transform(input) { if (self.failCacheGate) throw new Error("gate failed"); return input; }
  }
});`,
  };
  const source = `>>>>! include "./modules/rollback.js"
>>>> first | gate
value
<<<< first`;
  const opened = await harness.send({
    type: "open", requestId: "open:rollback", document: { documentId: "doc:rollback", path: "document.md", source, documentRevision: 1 },
  });
  harness.context.self.failCacheGate = true;
  const failed = await harness.send({
    type: "run", requestId: "run:rollback:1", runId: 111, documentId: "doc:rollback", documentRevision: opened.document.documentRevision, modules: [rollbackModule], options: {},
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.executionReport.transactionState, "rolled-back-failed");
  assert.equal(failed.executionStats.writes, 0);
  assert.equal(failed.executionStats.observations, 0);
  assert.equal(failed.executionReport.nodeResolutions[0].cache.write, false);
  assert.equal(failed.executionReport.nodeResolutions[0].cache.evidence, 0);

  harness.context.self.failCacheGate = false;
  const recovered = await harness.send({
    type: "run", requestId: "run:rollback:2", runId: 112, documentId: "doc:rollback", documentRevision: opened.document.documentRevision, modules: [rollbackModule], options: {},
  });
  assert.equal(recovered.ok, true, recovered.error);
  assert.equal(recovered.executionStats.reused, 0);
  assert.equal(recovered.executionReport.nodeResolutions[0].cache.evidence, 1);
  assert.equal(recovered.executionStats.writes, 1);
  assert.equal(harness.context.self.rollbackFirstCalls, 2);
});

test("a rolled-back second observation cannot appear verified or authorize reuse", async () => {
  const harness = createHarness();
  const rollbackSecondModule = {
    path: "modules/rollback-second.js",
    content: `define({
  candidate: { state: "pure", determinism: "deterministic", effects: [], transform(input) { self.secondObservationCalls = (self.secondObservationCalls || 0) + 1; return String(input).trim(); } },
  gate: { state: "run", determinism: "deterministic", effects: ["run-state"], transform(input) { if (self.failSecondObservation) throw new Error("second observation failed"); return input; } }
});`,
  };
  const sourceOne = `>>>>! include "./modules/rollback-second.js"
>>>> candidate | gate
left
<<<< candidate
tail-one`;
  const sourceTwo = sourceOne.replace("tail-one", "tail-two");
  const opened = await harness.send({ type: "open", requestId: "open:rollback-second", document: { documentId: "doc:rollback-second", path: "document.md", source: sourceOne, documentRevision: 1 } });
  const first = await harness.send({ type: "run", requestId: "run:rollback-second:1", runId: 115, documentId: "doc:rollback-second", documentRevision: opened.document.documentRevision, modules: [rollbackSecondModule], options: {} });
  assert.equal(first.executionReport.nodeResolutions[0].cache.evidence, 1);
  const changed = await harness.send({ type: "change", requestId: "change:rollback-second", documentId: "doc:rollback-second", baseRevision: 1, changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }] });
  harness.context.self.failSecondObservation = true;
  const failed = await harness.send({ type: "run", requestId: "run:rollback-second:2", runId: 116, documentId: "doc:rollback-second", documentRevision: changed.document.documentRevision, modules: [rollbackSecondModule], options: {} });

  assert.equal(failed.ok, false);
  assert.equal(failed.executionReport.transactionState, "rolled-back-failed");
  assert.equal(failed.executionStats.observations, 0);
  assert.equal(failed.executionStats.writes, 0);
  assert.equal(failed.executionReport.nodeResolutions[0].cache.evidence, 1);
  assert.equal(failed.executionReport.nodeResolutions[0].cache.verification, "probation");
  assert.equal(failed.executionReport.nodeResolutions[0].cache.write, false);

  harness.context.self.failSecondObservation = false;
  const recovered = await harness.send({ type: "run", requestId: "run:rollback-second:3", runId: 117, documentId: "doc:rollback-second", documentRevision: changed.document.documentRevision, modules: [rollbackSecondModule], options: {} });
  assert.equal(recovered.executionStats.reused, 0);
  assert.equal(recovered.executionStats.verified, 1);
  assert.equal(recovered.executionReport.nodeResolutions[0].cache.evidence, 2);
  assert.equal(harness.context.self.secondObservationCalls, 3);
});

test("a falsely effects-free candidate fails atomically when it emits", async () => {
  const harness = createHarness();
  const liarModule = {
    path: "modules/liar.js",
    content: `define({
  liar: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input, _args, context) { context.emit("audit", { hidden: true }); return input; }
  }
});`,
  };
  const source = `>>>>! include "./modules/liar.js"
>>>> liar
value
<<<< liar`;
  const opened = await harness.send({
    type: "open", requestId: "open:liar", document: { documentId: "doc:liar", path: "document.md", source, documentRevision: 1 },
  });
  const result = await harness.send({
    type: "run", requestId: "run:liar", runId: 121, documentId: "doc:liar", documentRevision: opened.document.documentRevision, modules: [liarModule], options: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TBA-CACHE-EFFECT-VIOLATION-LAB"), true);
  assert.equal(result.resultEnvelope.run.committed, false);
  assert.equal(JSON.stringify(result.channels), "{}");
  assert.equal(result.executionReport.transactionState, "rolled-back-failed");
  assert.equal(result.executionStats.writes, 0);
});

test("cache candidates cannot mutate their input and non-cacheable outputs stay fresh", async () => {
  const harness = createHarness();
  const safetyModule = {
    path: "modules/cache-safety.js",
    content: `define({
  object: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input) { return { value: String(input).trim() }; }
  },
  mutate: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input) { input.value = "mutated"; return input; }
  },
  date: {
    state: "pure", determinism: "deterministic", effects: [],
    transform() { return new Date(0); }
  }
});`,
  };
  const mutationSource = `>>>>! include "./modules/cache-safety.js"
>>>> object | mutate
value
<<<< object`;
  const opened = await harness.send({
    type: "open", requestId: "open:mutation", document: { documentId: "doc:mutation", path: "document.md", source: mutationSource, documentRevision: 1 },
  });
  const mutated = await harness.send({
    type: "run", requestId: "run:mutation", runId: 131, documentId: "doc:mutation", documentRevision: opened.document.documentRevision, modules: [safetyModule], options: {},
  });
  assert.equal(mutated.ok, false);
  assert.equal(mutated.diagnostics.some((diagnostic) => diagnostic.code === "TBA-CACHE-INPUT-MUTATION-LAB"), true);
  assert.equal(mutated.executionStats.writes, 0);

  const dateSource = `>>>>! include "./modules/cache-safety.js"
>>>> date
value
<<<< date`;
  const replaced = await harness.send({
    type: "open", requestId: "open:date", replaceSession: true, document: { documentId: "doc:mutation", path: "document.md", source: dateSource, documentRevision: 1 },
  });
  const nonCacheable = await harness.send({
    type: "run", requestId: "run:date", runId: 132, documentId: "doc:mutation", documentRevision: replaced.document.documentRevision, modules: [safetyModule], options: {},
  });
  assert.equal(nonCacheable.ok, true, nonCacheable.error);
  assert.equal(nonCacheable.executionStats.writes, 0);
  assert.equal(nonCacheable.executionReport.nodeResolutions[0].reason, "value-not-cacheable");
});

test("different outputs for one exact key quarantine the lab cache entry", async () => {
  const harness = createHarness();
  const untrustedModule = {
    path: "modules/untrusted-purity.js",
    content: `define({
  unstable: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input) { self.unstableCalls = (self.unstableCalls || 0) + 1; return String(input).trim() + ":" + self.unstableCalls; }
  },
  stable: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input) { return String(input).trim(); }
  }
});`,
  };
  const firstSource = `>>>>! include "./modules/untrusted-purity.js"
>>>> unstable
left
<<<< unstable
>>>> stable
right-one
<<<< stable`;
  const secondSource = firstSource.replace("right-one", "right-two");
  const opened = await harness.send({
    type: "open", requestId: "open:quarantine", document: { documentId: "doc:quarantine", path: "document.md", source: firstSource, documentRevision: 1 },
  });
  await harness.send({
    type: "run", requestId: "run:quarantine:1", runId: 141, documentId: "doc:quarantine", documentRevision: opened.document.documentRevision, modules: [untrustedModule], options: {},
  });
  const changed = await harness.send({
    type: "change", requestId: "change:quarantine", documentId: "doc:quarantine", baseRevision: 1,
    changes: [{ range: { from: 0, to: Array.from(firstSource).length }, insert: secondSource }],
  });
  const mismatch = await harness.send({
    type: "run", requestId: "run:quarantine:2", runId: 142, documentId: "doc:quarantine", documentRevision: changed.document.documentRevision, modules: [untrustedModule], options: {},
  });
  assert.equal(mismatch.ok, true, mismatch.error);
  assert.equal(mismatch.executionStats.quarantined, 1);
  assert.equal(mismatch.executionReport.nodeResolutions[0].cache.verification, "quarantined");

  const afterQuarantine = await harness.send({
    type: "run", requestId: "run:quarantine:3", runId: 143, documentId: "doc:quarantine", documentRevision: changed.document.documentRevision, modules: [untrustedModule], options: {},
  });
  assert.equal(afterQuarantine.executionStats.reused, 0);
  assert.equal(afterQuarantine.executionReport.nodeResolutions[0].reason, "quarantined");
  assert.equal(harness.context.self.unstableCalls, 3);
});

test("every reuse returns a detached clone to effectful downstream stages", async () => {
  const harness = createHarness();
  const cloneModule = {
    path: "modules/clone.js",
    content: `define({
  make_object: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input) { self.makeObjectCalls = (self.makeObjectCalls || 0) + 1; return { text: String(input).trim(), visits: 0 }; }
  },
  touch: {
    state: "run", determinism: "deterministic", effects: ["input-mutation"],
    transform(input) { self.touchCalls = (self.touchCalls || 0) + 1; input.visits += 1; return input; }
  },
  stable: {
    state: "pure", determinism: "deterministic", effects: [], transform(input) { return String(input).trim(); }
  }
});`,
  };
  const firstSource = `>>>>! include "./modules/clone.js"
>>>> make_object | touch
left
<<<< make_object
>>>> stable
right-one
<<<< stable`;
  const secondSource = firstSource.replace("right-one", "right-two");
  const opened = await harness.send({
    type: "open", requestId: "open:clone", document: { documentId: "doc:clone", path: "document.md", source: firstSource, documentRevision: 1 },
  });
  await harness.send({
    type: "run", requestId: "run:clone:1", runId: 151, documentId: "doc:clone", documentRevision: opened.document.documentRevision, modules: [cloneModule], options: {},
  });
  const changed = await harness.send({
    type: "change", requestId: "change:clone", documentId: "doc:clone", baseRevision: 1,
    changes: [{ range: { from: 0, to: Array.from(firstSource).length }, insert: secondSource }],
  });
  await harness.send({
    type: "run", requestId: "run:clone:2", runId: 152, documentId: "doc:clone", documentRevision: changed.document.documentRevision, modules: [cloneModule], options: {},
  });
  const warmOne = await harness.send({
    type: "run", requestId: "run:clone:3", runId: 153, documentId: "doc:clone", documentRevision: changed.document.documentRevision, modules: [cloneModule], options: {},
  });
  const warmTwo = await harness.send({
    type: "run", requestId: "run:clone:4", runId: 154, documentId: "doc:clone", documentRevision: changed.document.documentRevision, modules: [cloneModule], options: {},
  });

  assert.equal(warmOne.executionReport.nodeResolutions[0].disposition, "reused");
  assert.equal(warmTwo.executionReport.nodeResolutions[0].disposition, "reused");
  assert.equal(warmOne.output, warmTwo.output);
  assert.match(warmTwo.output, /"visits": 1/);
  assert.equal(harness.context.self.makeObjectCalls, 2);
  assert.equal(harness.context.self.touchCalls, 4);
});

test("a two-stage pure pipeline verifies and reuses every stage witness", async () => {
  const harness = createHarness();
  const twoStageModule = {
    path: "modules/two-stage.js",
    content: `define({
  first: { state: "pure", determinism: "deterministic", effects: [], transform(input) { self.firstWitnessCalls = (self.firstWitnessCalls || 0) + 1; return String(input).trim() + ":first"; } },
  second: { state: "pure", determinism: "deterministic", effects: [], transform(input) { self.secondWitnessCalls = (self.secondWitnessCalls || 0) + 1; return String(input) + ":second"; } }
});`,
  };
  const sourceOne = `>>>>! include "./modules/two-stage.js"
>>>> first | second
left
<<<< first
tail-one`;
  const sourceTwo = sourceOne.replace("tail-one", "tail-two");
  const opened = await harness.send({ type: "open", requestId: "open:two-stage", document: { documentId: "doc:two-stage", path: "document.md", source: sourceOne, documentRevision: 1 } });
  await harness.send({ type: "run", requestId: "run:two-stage:1", runId: 161, documentId: "doc:two-stage", documentRevision: opened.document.documentRevision, modules: [twoStageModule], options: {} });
  const changed = await harness.send({
    type: "change", requestId: "change:two-stage", documentId: "doc:two-stage", baseRevision: 1,
    changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }],
  });
  const second = await harness.send({ type: "run", requestId: "run:two-stage:2", runId: 162, documentId: "doc:two-stage", documentRevision: changed.document.documentRevision, modules: [twoStageModule], options: {} });
  const warm = await harness.send({ type: "run", requestId: "run:two-stage:3", runId: 163, documentId: "doc:two-stage", documentRevision: changed.document.documentRevision, modules: [twoStageModule], options: {} });

  assert.equal(second.executionStats.verified, 2);
  assert.equal(warm.executionStats.executed, 0);
  assert.equal(warm.executionStats.reused, 2);
  assert.equal(JSON.stringify(warm.executionTrace.map((step) => step.functionInvoked)), JSON.stringify([false, false]));
  assert.equal(harness.context.self.firstWitnessCalls, 2);
  assert.equal(harness.context.self.secondWitnessCalls, 2);
});

test("colliding legacy evidence hashes cannot overwrite cache provenance", async () => {
  const harness = createHarness();
  const evidenceCollisionModule = {
    path: "modules/ec.js",
    content: `define({
  a: { state: "pure", determinism: "deterministic", effects: [], transform() { return "A7qh"; } },
  b: { state: "pure", determinism: "deterministic", effects: [], transform() { return "B959"; } }
});`,
  };
  const sourceOne = `>>>>! include "./modules/ec.js"
>>>> a
x
<<<< a
>>>> b
y
<<<< b
tail-one`;
  const sourceTwo = sourceOne.replace("tail-one", "tail-two");
  const opened = await harness.send({ type: "open", requestId: "open:evidence-collision", document: { documentId: "doc:evidence-collision", path: "document.md", source: sourceOne, documentRevision: 1 } });
  await harness.send({ type: "run", requestId: "run:evidence-collision:1", runId: 166, documentId: "doc:evidence-collision", documentRevision: opened.document.documentRevision, modules: [evidenceCollisionModule], options: {} });
  const changed = await harness.send({
    type: "change", requestId: "change:evidence-collision", documentId: "doc:evidence-collision", baseRevision: 1,
    changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }],
  });
  await harness.send({ type: "run", requestId: "run:evidence-collision:2", runId: 167, documentId: "doc:evidence-collision", documentRevision: changed.document.documentRevision, modules: [evidenceCollisionModule], options: {} });
  const warm = await harness.send({ type: "run", requestId: "run:evidence-collision:3", runId: 168, documentId: "doc:evidence-collision", documentRevision: changed.document.documentRevision, modules: [evidenceCollisionModule], options: {} });

  const entities = new Map(warm.resultEnvelope.provenance.entities.map((entity) => [entity.entityId, entity]));
  const cacheEntities = [...entities.values()].filter((entity) => entity.entityType === "cached-stage-output");
  const evidenceEntities = [...entities.values()].filter((entity) => entity.entityType === "cache-observation");
  assert.equal(warm.executionStats.reused, 2);
  assert.equal(cacheEntities.length, 2);
  assert.equal(evidenceEntities.length, 4);
  for (const cacheEntity of cacheEntities) {
    assert.equal(cacheEntity.evidenceRefs.length, 2);
    assert.equal(new Set(cacheEntity.evidenceRefs).size, 2);
    for (const evidenceRef of cacheEntity.evidenceRefs) {
      const evidence = entities.get(evidenceRef);
      assert.equal(evidence.planNodeRef, cacheEntity.planNodeRef);
      assert.equal(evidence.outputDigest, cacheEntity.outputDigest);
    }
  }
  assert.equal(warm.conformanceReport.gate.status, "passed", JSON.stringify(warm.conformanceReport.gate));
});

test("cached object order remains observable and warm provenance stays run-local", async () => {
  const harness = createHarness();
  const objectOrderModule = {
    path: "modules/object-order.js",
    content: `define({
  ordered: { state: "pure", determinism: "deterministic", effects: [], transform() { self.orderedCalls = (self.orderedCalls || 0) + 1; return { b: 1, a: 2 }; } },
  keys: {
    state: "run", determinism: "deterministic", effects: ["channel:system.out"], outputs: ["render", "system.out"],
    transform(input, _args, context) { self.keysCalls = (self.keysCalls || 0) + 1; const keys = Object.keys(input).join(","); context.system.out.line({ keys }); return keys; }
  }
});`,
  };
  const sourceOne = `>>>>! include "./modules/object-order.js"
>>>> ordered | keys
left
<<<< ordered
tail-one`;
  const sourceTwo = sourceOne.replace("tail-one", "tail-two");
  const opened = await harness.send({ type: "open", requestId: "open:object-order", document: { documentId: "doc:object-order", path: "document.md", source: sourceOne, documentRevision: 1 } });
  await harness.send({ type: "run", requestId: "run:object-order:1", runId: 171, documentId: "doc:object-order", documentRevision: opened.document.documentRevision, modules: [objectOrderModule], options: {} });
  const changed = await harness.send({
    type: "change", requestId: "change:object-order", documentId: "doc:object-order", baseRevision: 1,
    changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }],
  });
  const second = await harness.send({ type: "run", requestId: "run:object-order:2", runId: 172, documentId: "doc:object-order", documentRevision: changed.document.documentRevision, modules: [objectOrderModule], options: {} });
  const warmOne = await harness.send({ type: "run", requestId: "run:object-order:3", runId: 173, documentId: "doc:object-order", documentRevision: changed.document.documentRevision, modules: [objectOrderModule], options: {} });
  const warmTwo = await harness.send({ type: "run", requestId: "run:object-order:4", runId: 173, documentId: "doc:object-order", documentRevision: changed.document.documentRevision, modules: [objectOrderModule], options: {} });

  assert.match(warmOne.output, /b,a/);
  assert.equal(warmOne.output, second.output);
  assert.equal(warmTwo.output, warmOne.output);
  assert.equal(warmOne.executionStats.reused, 1);
  assert.equal(warmOne.executionReport.nodeResolutions[0].disposition, "reused");
  assert.equal(JSON.stringify(warmOne.invalidationPreview.cacheStats), JSON.stringify({ reads: 0, writes: 0, hits: 0, misses: 0, reused: 0 }));
  assert.equal(JSON.stringify(warmOne.invalidationPreview.executionDisposition.reusedNodeIds), "[]");
  assert.equal(harness.context.self.orderedCalls, 2);
  assert.equal(harness.context.self.keysCalls, 4);
  assert.equal(second.resultEnvelope.resultId, warmOne.resultEnvelope.resultId);
  assert.equal(second.conformanceReport.structuralDigest, warmOne.conformanceReport.structuralDigest);
  assert.equal(warmOne.conformanceReport.structuralDigest, warmTwo.conformanceReport.structuralDigest);
  assert.notEqual(warmOne.resultEnvelope.run.instanceId, warmTwo.resultEnvelope.run.instanceId);
  assert.notEqual(warmOne.adapterRun.adapterRunId, warmTwo.adapterRun.adapterRunId);

  const ids = (result, field) => new Set(result.executionTrace.map((step) => step[field]));
  for (const field of ["stageId", "invocationId", "activityId"]) {
    assert.equal([...ids(warmOne, field)].some((id) => ids(warmTwo, field).has(id)), false);
  }
  const firstEvents = new Set(warmOne.channels["system.out"].map((event) => event.eventId));
  assert.equal(warmTwo.channels["system.out"].some((event) => firstEvents.has(event.eventId)), false);
  for (const result of [warmOne, warmTwo]) {
    const activities = new Set(result.resultEnvelope.provenance.activities.map((activity) => activity.activityId));
    const entities = new Set(result.resultEnvelope.provenance.entities.map((entity) => entity.entityId));
    assert.equal(result.sourceMaps.every((mapping) => activities.has(mapping.generatingActivity)), true);
    assert.equal(result.executionTrace[0].executionMode, "cache-reuse");
    const materialization = result.resultEnvelope.provenance.activities.find((activity) => activity.activityType === "cache-materialization");
    const cacheEntity = result.resultEnvelope.provenance.entities.find((entity) => entity.entityId === materialization.cacheEntryRef);
    assert.equal(entities.has(materialization.cacheEntryRef), true);
    assert.equal(materialization.evidenceRefs.length, 2);
    assert.equal(materialization.evidenceRefs.every((reference) => entities.has(reference)), true);
    assert.equal(materialization.evidenceRefs.every((reference) => result.resultEnvelope.provenance.entities.find((entity) => entity.entityId === reference).outputDigest === cacheEntity.outputDigest), true);
  }
});

test("authored argument order is keyed and nested argument mutation cannot alter the plan", async () => {
  const harness = createHarness();
  const argsModule = {
    path: "modules/args.js",
    content: `define({
  inspect_args: {
    state: "pure", determinism: "deterministic", effects: [],
    transform(input, args) { self.argumentCalls = (self.argumentCalls || 0) + 1; const order = Object.keys(args).join("|"); return order + ":" + args.items.reverse().join(",") + ":" + String(input).trim(); }
  }
});`,
  };
  const sourceOne = `>>>>! include "./modules/args.js"
>>>> inspect_args items=["a","b"] marker="x"
left
<<<< inspect_args
tail-one`;
  const sourceTwo = sourceOne.replace("tail-one", "tail-two");
  const sourceThree = sourceTwo.replace('items=["a","b"] marker="x"', 'marker="x" items=["a","b"]');
  const opened = await harness.send({ type: "open", requestId: "open:args", document: { documentId: "doc:args", path: "document.md", source: sourceOne, documentRevision: 1 } });
  await harness.send({ type: "run", requestId: "run:args:1", runId: 181, documentId: "doc:args", documentRevision: opened.document.documentRevision, modules: [argsModule], options: {} });
  const changed = await harness.send({
    type: "change", requestId: "change:args:tail", documentId: "doc:args", baseRevision: 1,
    changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }],
  });
  const second = await harness.send({ type: "run", requestId: "run:args:2", runId: 182, documentId: "doc:args", documentRevision: changed.document.documentRevision, modules: [argsModule], options: {} });
  const warm = await harness.send({ type: "run", requestId: "run:args:3", runId: 183, documentId: "doc:args", documentRevision: changed.document.documentRevision, modules: [argsModule], options: {} });
  const reordered = await harness.send({
    type: "change", requestId: "change:args:order", documentId: "doc:args", baseRevision: 2,
    changes: [{ range: { from: 0, to: Array.from(sourceTwo).length }, insert: sourceThree }],
  });
  const third = await harness.send({ type: "run", requestId: "run:args:4", runId: 184, documentId: "doc:args", documentRevision: reordered.document.documentRevision, modules: [argsModule], options: {} });
  const stageArgs = (result) => result.plan.graph.nodes.find((node) => node.kind === "stage").args;

  assert.equal(JSON.stringify(stageArgs(second).items), JSON.stringify(["a", "b"]));
  assert.equal(JSON.stringify(stageArgs(warm).items), JSON.stringify(["a", "b"]));
  assert.equal(second.output, warm.output);
  assert.equal(second.conformanceReport.structuralDigest, warm.conformanceReport.structuralDigest);
  assert.equal(warm.executionStats.reused, 1);
  assert.match(third.output, /marker\|items:b,a/);
  assert.equal(third.executionStats.reused, 0);
  const argsDigest = (result) => result.plan.graph.nodes.find((node) => node.kind === "stage").cache.keyComponents.argsDigest;
  assert.notEqual(argsDigest(second), argsDigest(third));
  assert.equal(harness.context.self.argumentCalls, 3);
});

test("the cache key binds transitive module bytes and actual initialization order", async () => {
  const harness = createHarness();
  const helper = (value) => ({ path: "modules/helper.js", content: `self.helperValue = "${value}"; define({});` });
  const main = {
    path: "modules/main.js",
    content: `>>>> include "./helper.js"
define({ read_helper: { state: "pure", determinism: "deterministic", effects: [], transform() { self.helperReads = (self.helperReads || 0) + 1; return self.helperValue; } } });`,
  };
  const sourceOne = `>>>>! include "./modules/main.js"
>>>> read_helper
x
<<<< read_helper
tail-one`;
  const sourceTwo = sourceOne.replace("tail-one", "tail-two");
  const opened = await harness.send({ type: "open", requestId: "open:module-set", document: { documentId: "doc:module-set", path: "document.md", source: sourceOne, documentRevision: 1 } });
  await harness.send({ type: "run", requestId: "run:module-set:1", runId: 191, documentId: "doc:module-set", documentRevision: opened.document.documentRevision, modules: [main, helper("ONE")], options: {} });
  const changed = await harness.send({ type: "change", requestId: "change:module-set", documentId: "doc:module-set", baseRevision: 1, changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }] });
  await harness.send({ type: "run", requestId: "run:module-set:2", runId: 192, documentId: "doc:module-set", documentRevision: changed.document.documentRevision, modules: [main, helper("ONE")], options: {} });
  const warm = await harness.send({ type: "run", requestId: "run:module-set:3", runId: 193, documentId: "doc:module-set", documentRevision: changed.document.documentRevision, modules: [main, helper("ONE")], options: {} });
  const helperChanged = await harness.send({ type: "run", requestId: "run:module-set:4", runId: 194, documentId: "doc:module-set", documentRevision: changed.document.documentRevision, modules: [main, helper("TWO")], options: {} });

  assert.equal(warm.executionStats.reused, 1);
  assert.match(warm.output, /ONE/);
  assert.equal(helperChanged.executionStats.reused, 0);
  assert.match(helperChanged.output, /TWO/);
  assert.equal(harness.context.self.helperReads, 3);

  const orderHarness = createHarness();
  const a = { path: "modules/a.js", content: 'self.moduleOrderValue = "A"; define({});' };
  const b = { path: "modules/b.js", content: 'self.moduleOrderValue = "B"; define({});' };
  const reader = { path: "modules/read.js", content: 'define({ read_order: { state: "pure", determinism: "deterministic", effects: [], transform() { self.orderReads = (self.orderReads || 0) + 1; return self.moduleOrderValue; } } });' };
  const orderOne = `>>>>! include "./modules/a.js"
>>>>! include "./modules/b.js"
>>>>! include "./modules/read.js"
>>>> read_order
x
<<<< read_order
tail-one`;
  const orderTwo = orderOne.replace("tail-one", "tail-two");
  const orderSwapped = orderTwo.replace('>>>>! include "./modules/a.js"\n>>>>! include "./modules/b.js"', '>>>>! include "./modules/b.js"\n>>>>! include "./modules/a.js"');
  const orderOpened = await orderHarness.send({ type: "open", requestId: "open:module-order", document: { documentId: "doc:module-order", path: "document.md", source: orderOne, documentRevision: 1 } });
  await orderHarness.send({ type: "run", requestId: "run:module-order:1", runId: 195, documentId: "doc:module-order", documentRevision: orderOpened.document.documentRevision, modules: [a, b, reader], options: {} });
  const orderChanged = await orderHarness.send({ type: "change", requestId: "change:module-order:tail", documentId: "doc:module-order", baseRevision: 1, changes: [{ range: { from: 0, to: Array.from(orderOne).length }, insert: orderTwo }] });
  await orderHarness.send({ type: "run", requestId: "run:module-order:2", runId: 196, documentId: "doc:module-order", documentRevision: orderChanged.document.documentRevision, modules: [a, b, reader], options: {} });
  const orderWarm = await orderHarness.send({ type: "run", requestId: "run:module-order:3", runId: 197, documentId: "doc:module-order", documentRevision: orderChanged.document.documentRevision, modules: [a, b, reader], options: {} });
  const swapped = await orderHarness.send({ type: "change", requestId: "change:module-order:swap", documentId: "doc:module-order", baseRevision: 2, changes: [{ range: { from: 0, to: Array.from(orderTwo).length }, insert: orderSwapped }] });
  const reorderedRun = await orderHarness.send({ type: "run", requestId: "run:module-order:4", runId: 198, documentId: "doc:module-order", documentRevision: swapped.document.documentRevision, modules: [a, b, reader], options: {} });

  assert.equal(orderWarm.executionStats.reused, 1);
  assert.match(orderWarm.output, /B/);
  assert.equal(reorderedRun.executionStats.reused, 0);
  assert.match(reorderedRun.output, /A/);
  assert.equal(orderHarness.context.self.orderReads, 3);
});

test("non-cacheable cyclic input bypasses cache without changing fresh semantics", async () => {
  const cycleModule = {
    path: "modules/cycle.js",
    content: `define({
  make_cycle: { state: "run", determinism: "deterministic", effects: ["object-state"], transform() { const value = {}; value.self = value; return value; } },
  inspect_cycle: { state: "pure", determinism: "deterministic", effects: [], transform(input) { return input.self === input ? "ok" : "bad"; } }
});`,
  };
  const source = `>>>>! include "./modules/cycle.js"
>>>> make_cycle | inspect_cycle
x
<<<< make_cycle`;
  const direct = await run(source, [cycleModule], { runId: 201 });
  assert.equal(direct.result.ok, true, direct.result.error);
  assert.equal(direct.result.output.trim(), "ok");

  const harness = createHarness();
  const opened = await harness.send({ type: "open", requestId: "open:cycle", document: { documentId: "doc:cycle", path: "document.md", source, documentRevision: 1 } });
  const editor = await harness.send({ type: "run", requestId: "run:cycle", runId: 202, documentId: "doc:cycle", documentRevision: opened.document.documentRevision, modules: [cycleModule], options: {} });
  assert.equal(editor.ok, true, editor.error);
  assert.equal(editor.output.trim(), "ok");
  assert.equal(editor.executionReport.nodeResolutions[1].reason, "value-not-cacheable");
  assert.equal(editor.executionReport.nodeResolutions[1].cache.read, false);
  assert.equal(editor.executionReport.nodeResolutions[1].cache.write, false);
});

test("proxy, non-extensible and aliased outputs stay fresh instead of changing meaning", async () => {
  const harness = createHarness();
  const nonCacheableValuesModule = {
    path: "modules/non-cacheable-values.js",
    content: `define({
  make_proxy: { state: "pure", determinism: "deterministic", effects: [], transform() { self.proxyMakes = (self.proxyMakes || 0) + 1; return new Proxy({ a: 1 }, { get(target, key) { return key === "a" ? 2 : Reflect.get(target, key); } }); } },
  read_proxy: { state: "run", determinism: "deterministic", effects: ["object-observation"], transform(input) { return "proxy:" + input.a; } },
  make_locked: { state: "pure", determinism: "deterministic", effects: [], transform() { self.lockedMakes = (self.lockedMakes || 0) + 1; return Object.preventExtensions({ a: 1 }); } },
  read_extensible: { state: "run", determinism: "deterministic", effects: ["object-observation"], transform(input) { return "extensible:" + Object.isExtensible(input); } },
  make_alias: { state: "pure", determinism: "deterministic", effects: [], transform() { self.aliasMakes = (self.aliasMakes || 0) + 1; const shared = {}; return { a: shared, b: shared }; } },
  read_alias: { state: "run", determinism: "deterministic", effects: ["object-observation"], transform(input) { return "alias:" + (input.a === input.b); } }
});`,
  };
  const sourceOne = `>>>>! include "./modules/non-cacheable-values.js"
>>>> make_proxy | read_proxy
x
<<<< make_proxy
>>>> make_locked | read_extensible
x
<<<< make_locked
>>>> make_alias | read_alias
x
<<<< make_alias
tail-one`;
  const sourceTwo = sourceOne.replace("tail-one", "tail-two");
  const opened = await harness.send({ type: "open", requestId: "open:non-cacheable-values", document: { documentId: "doc:non-cacheable-values", path: "document.md", source: sourceOne, documentRevision: 1 } });
  await harness.send({ type: "run", requestId: "run:non-cacheable-values:1", runId: 205, documentId: "doc:non-cacheable-values", documentRevision: opened.document.documentRevision, modules: [nonCacheableValuesModule], options: {} });
  const changed = await harness.send({ type: "change", requestId: "change:non-cacheable-values", documentId: "doc:non-cacheable-values", baseRevision: 1, changes: [{ range: { from: 0, to: Array.from(sourceOne).length }, insert: sourceTwo }] });
  const second = await harness.send({ type: "run", requestId: "run:non-cacheable-values:2", runId: 206, documentId: "doc:non-cacheable-values", documentRevision: changed.document.documentRevision, modules: [nonCacheableValuesModule], options: {} });
  const warm = await harness.send({ type: "run", requestId: "run:non-cacheable-values:3", runId: 207, documentId: "doc:non-cacheable-values", documentRevision: changed.document.documentRevision, modules: [nonCacheableValuesModule], options: {} });

  assert.equal(warm.output, second.output);
  assert.match(warm.output, /proxy:2/);
  assert.match(warm.output, /extensible:false/);
  assert.match(warm.output, /alias:true/);
  assert.equal(warm.executionStats.reused, 0);
  assert.equal(JSON.stringify([0, 2, 4].map((index) => warm.executionReport.nodeResolutions[index].reason)), JSON.stringify(["value-not-cacheable", "value-not-cacheable", "value-not-cacheable"]));
  assert.equal(harness.context.self.proxyMakes, 3);
  assert.equal(harness.context.self.lockedMakes, 3);
  assert.equal(harness.context.self.aliasMakes, 3);
});

test("post-commit conformance failure discards pending cache evidence", async () => {
  const harness = createHarness();
  const gatedModule = { path: "modules/gated.js", content: 'define({ gated: { state: "pure", determinism: "deterministic", effects: [], transform(input) { self.gatedCalls = (self.gatedCalls || 0) + 1; return input; } } });' };
  const source = `>>>>! include "./modules/gated.js"
>>>> gated
x
<<<< gated`;
  const opened = await harness.send({ type: "open", requestId: "open:gated", document: { documentId: "doc:gated", path: "document.md", source, documentRevision: 1 } });
  const rejected = await harness.send({ type: "run", requestId: "run:gated:1", runId: 211, documentId: "doc:gated", documentRevision: opened.document.documentRevision, modules: [gatedModule], options: { fixtureId: "failed-run" } });
  const accepted = await harness.send({ type: "run", requestId: "run:gated:2", runId: 212, documentId: "doc:gated", documentRevision: opened.document.documentRevision, modules: [gatedModule], options: {} });

  assert.equal(rejected.ok, true, rejected.error);
  assert.equal(rejected.conformanceReport.gate.status, "failed");
  assert.equal(rejected.executionReport.transactionState, "rolled-back-post-commit-gate");
  assert.equal(rejected.executionStats.observations, 0);
  assert.equal(rejected.executionStats.writes, 0);
  assert.equal(rejected.executionReport.nodeResolutions[0].cache.evidence, 0);
  assert.equal(accepted.executionStats.reused, 0);
  assert.equal(accepted.executionReport.nodeResolutions[0].cache.evidence, 1);
  assert.equal(harness.context.self.gatedCalls, 2);
});
