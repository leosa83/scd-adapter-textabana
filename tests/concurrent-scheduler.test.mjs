import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
    sendWithoutWaiting(data) {
      void context.self.onmessage({ data });
    },
  };
}

async function run(documentSource, modules, options = {}, runId = 1) {
  const harness = createHarness();
  const result = await harness.send({ runId, documentSource, modules, options });
  return { result, harness };
}

const asyncBranchModule = {
  path: "modules/async-branches.js",
  content: `define({
  async_branch: {
    version: "1.0.0", state: "pure", determinism: "deterministic", effects: [], outputs: ["render"],
    async transform(input, args, context) {
      self.activeBranches = (self.activeBranches || 0) + 1;
      self.peakBranches = Math.max(self.peakBranches || 0, self.activeBranches);
      self.branchStarts = [...(self.branchStarts || []), args.label];
      await new Promise(resolve => setTimeout(resolve, Number(args.delay)));
      await context.checkpoint();
      self.branchSettlements = [...(self.branchSettlements || []), args.label];
      self.activeBranches -= 1;
      return args.label + ":" + String(input).trim() + "\\n";
    }
  }
});`,
};

const branchDocument = `>>>>! include "./modules/async-branches.js"
>>>> async_branch label="left" delay=30
Alpha
<<<< async_branch
>>>> async_branch label="right" delay=5
Beta
<<<< async_branch`;

test("independent safe async branches overlap but commit trace and render in plan order", async () => {
  const { result, harness } = await run(branchDocument, [asyncBranchModule]);

  assert.equal(result.ok, true, result.error);
  assert.equal(harness.context.self.peakBranches, 2);
  assert.equal(JSON.stringify(harness.context.self.branchStarts), JSON.stringify(["left", "right"]));
  assert.equal(JSON.stringify(harness.context.self.branchSettlements), JSON.stringify(["right", "left"]));
  assert.equal(result.output.trim(), "left:Alpha\nright:Beta");
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.args.label)), JSON.stringify(["left", "right"]));
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.invocationId.split(":").at(-1))), JSON.stringify(["0001", "0002"]));
  assert.equal(result.executionReport.scheduling.schema, "textabana.scheduler-report/lab-v1");
  assert.equal(result.executionReport.scheduling.mode, "bounded-safe-branch-concurrency");
  assert.equal(result.executionReport.scheduling.peakConcurrency, 2);
  assert.equal(result.executionReport.scheduling.waves[0].mode, "concurrent");
  assert.equal(result.executionReport.scheduling.commitOrder, "plan-order");
  assert.equal(result.executionReport.scheduling.hostMode, "single-worker-async-overlap");
  assert.equal(result.executionReport.scheduling.cpuParallel, false);
});

test("maxParallelism one preserves output while disabling branch overlap", async () => {
  const { result, harness } = await run(branchDocument, [asyncBranchModule], { runtimeLimits: { maxParallelism: 1 } });

  assert.equal(result.ok, true, result.error);
  assert.equal(harness.context.self.peakBranches, 1);
  assert.equal(result.output.trim(), "left:Alpha\nright:Beta");
  assert.equal(result.executionReport.scheduling.maxConcurrency, 1);
  assert.equal(result.executionReport.scheduling.peakConcurrency, 1);
  assert.equal(result.executionReport.scheduling.parallelizedNodeRefs.length, 0);
});

test("parallel outputs are detached at settlement before a sibling can observe later mutation", async () => {
  const moduleFile = {
    path: "modules/detached-output.js",
    content: `define({
  detach: {
    state: "pure", determinism: "deterministic", effects: [],
    async transform() {
      const output = { value: "initial" };
      setTimeout(() => { output.value = "late"; }, 5);
      return output;
    }
  },
  sibling: {
    state: "pure", determinism: "deterministic", effects: [],
    async transform(input, _args, context) {
      await new Promise(resolve => setTimeout(resolve, 25));
      await context.checkpoint();
      return input;
    }
  }
});`,
  };
  const document = `>>>>! include "./modules/detached-output.js"
>>>> detach
A
<<<< detach
>>>> sibling
B
<<<< sibling`;
  const { result } = await run(document, [moduleFile]);

  assert.equal(result.ok, true, result.error);
  assert.match(result.output, /"value": "initial"/);
  assert.doesNotMatch(result.output, /"value": "late"/);
  assert.equal(result.executionTrace[0].output.preview, "{\"value\":\"initial\"}");

  const largeModule = {
    path: "modules/large-detached-output.js",
    content: `define({
  large: { state: "pure", determinism: "deterministic", effects: [], transform() { return "x".repeat(70 * 1024); } },
  pass: { state: "pure", determinism: "deterministic", effects: [], transform(input) { return input; } }
});`,
  };
  const large = await run(
    `>>>>! include "./modules/large-detached-output.js"\n>>>> large | pass\nA\n<<<< large`,
    [largeModule],
    { runtimeLimits: { maxParallelism: 1 } },
  );
  assert.equal(large.result.ok, true, large.result.error);
  assert.equal(large.result.output.length, 70 * 1024);
  assert.equal(large.result.executionReport.scheduling.barrierNodeRefs.length, 0);
});

test("parallel-only contract violations use parallel diagnostics and reject unsafe output", async () => {
  const effectModule = {
    path: "modules/parallel-effect.js",
    content: `define({ unsafe_emit: { state: "pure", determinism: "deterministic", effects: [], transform(input, _args, context) { context.emit("undeclared", input); return input; } } });`,
  };
  const effectRun = await run(
    `>>>>! include "./modules/parallel-effect.js"\n>>>> unsafe_emit\nA\n<<<< unsafe_emit`,
    [effectModule],
  );
  assert.equal(effectRun.result.ok, false);
  assert.equal(effectRun.result.diagnostics.at(-1).code, "TBA-PARALLEL-EFFECT-VIOLATION-LAB");
  assert.doesNotMatch(effectRun.result.error, /Cachekandidaten/);

  const outputModule = {
    path: "modules/parallel-output.js",
    content: `define({
  unsafe_output: { state: "pure", determinism: "deterministic", effects: [], transform() { return () => "not cloneable"; } },
  safe_sibling: { state: "pure", determinism: "deterministic", effects: [], async transform(input, _args, context) { await context.checkpoint(); return input; } }
});`,
  };
  const outputRun = await run(
    `>>>>! include "./modules/parallel-output.js"\n>>>> unsafe_output\nA\n<<<< unsafe_output\n>>>> safe_sibling\nB\n<<<< safe_sibling`,
    [outputModule],
  );
  assert.equal(outputRun.result.ok, false);
  assert.equal(outputRun.result.diagnostics.at(-1).code, "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB");
  assert.equal(outputRun.result.executionTrace[0].status, "failed");
  assert.equal(outputRun.result.executionReport.nodeResolutions[0].reason, "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB");
  assert.equal(outputRun.result.resultEnvelope.run.committed, false);

  const sharedModule = {
    path: "modules/shared-output.js",
    content: `define({
  shared_output: {
    state: "pure", determinism: "deterministic", effects: [],
    transform() { const memory = new SharedArrayBuffer(1); const view = new Uint8Array(memory); setTimeout(() => { view[0] = 9; }, 5); return { view }; }
  },
  slow_sibling: { state: "pure", determinism: "deterministic", effects: [], async transform(input, _args, context) { await new Promise(resolve => setTimeout(resolve, 20)); await context.checkpoint(); return input; } }
});`,
  };
  const sharedRun = await run(
    `>>>>! include "./modules/shared-output.js"\n>>>> shared_output\nA\n<<<< shared_output\n>>>> slow_sibling\nB\n<<<< slow_sibling`,
    [sharedModule],
  );
  assert.equal(sharedRun.result.ok, false);
  assert.equal(sharedRun.result.diagnostics.at(-1).code, "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB");
  assert.equal(sharedRun.result.executionTrace[0].status, "failed");
  assert.equal(sharedRun.result.resultEnvelope.run.committed, false);

  const classModule = {
    path: "modules/class-output.js",
    content: `class Box { constructor(value) { this.value = value; } read() { return this.value; } }
define({
  class_output: { state: "pure", determinism: "deterministic", effects: [], transform() { return new Box(7); } },
  class_sibling: { state: "pure", determinism: "deterministic", effects: [], async transform(input, _args, context) { await context.checkpoint(); return input; } }
});`,
  };
  const classRun = await run(
    `>>>>! include "./modules/class-output.js"\n>>>> class_output\nA\n<<<< class_output\n>>>> class_sibling\nB\n<<<< class_sibling`,
    [classModule],
  );
  assert.equal(classRun.result.ok, false);
  assert.equal(classRun.result.diagnostics.at(-1).code, "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB");
  assert.equal(classRun.result.executionTrace[0].status, "failed");
});

test("effectful stages are serial barriers and dependent pipeline stages never start early", async () => {
  const moduleFile = {
    path: "modules/barriers.js",
    content: `define({
  pure_wait: {
    state: "pure", determinism: "deterministic", effects: [],
    async transform(input, args, context) {
      self.runtimeOrder = [...(self.runtimeOrder || []), "start:" + args.name];
      await new Promise(resolve => setTimeout(resolve, 5));
      await context.checkpoint();
      self.runtimeOrder = [...self.runtimeOrder, "end:" + args.name];
      return String(input).trim() + ":" + args.name;
    }
  },
  effect_wait: {
    state: "run", determinism: "deterministic", effects: ["timer"],
    async transform(input, args, context) {
      self.runtimeOrder = [...(self.runtimeOrder || []), "start:" + args.name];
      await new Promise(resolve => setTimeout(resolve, 5));
      await context.checkpoint();
      self.runtimeOrder = [...self.runtimeOrder, "end:" + args.name];
      return String(input).trim() + ":" + args.name;
    }
  }
});`,
  };
  const document = `>>>>! include "./modules/barriers.js"
>>>> pure_wait name="first" | pure_wait name="dependent"
A
<<<< pure_wait
>>>> effect_wait name="barrier"
B
<<<< effect_wait
>>>> pure_wait name="after"
C
<<<< pure_wait`;
  const { result, harness } = await run(document, [moduleFile]);

  assert.equal(result.ok, true, result.error);
  assert.deepEqual([...harness.context.self.runtimeOrder], [
    "start:first", "end:first", "start:dependent", "end:dependent",
    "start:barrier", "end:barrier", "start:after", "end:after",
  ]);
  assert.equal(result.executionReport.scheduling.peakConcurrency, 1);
  assert.equal(result.executionReport.scheduling.barrierNodeRefs.length, 1);
  assert.equal(result.executionReport.scheduling.waves.some((wave) => wave.mode === "barrier"), true);
});

test("a pending effect barrier fences later ready branches until the barrier completes", async () => {
  const moduleFile = {
    path: "modules/pending-barrier.js",
    content: `define({
  pure_wait: {
    state: "pure", determinism: "deterministic", effects: [],
    async transform(input, args, context) {
      self.pendingBarrierOrder = [...(self.pendingBarrierOrder || []), "start:" + args.name];
      await new Promise(resolve => setTimeout(resolve, Number(args.delay)));
      await context.checkpoint();
      self.pendingBarrierOrder = [...self.pendingBarrierOrder, "end:" + args.name];
      return String(input).trim() + ":" + args.name;
    }
  },
  effect_wait: {
    state: "run", determinism: "deterministic", effects: ["timer"],
    async transform(input, args, context) {
      self.pendingBarrierOrder = [...(self.pendingBarrierOrder || []), "start:" + args.name];
      await new Promise(resolve => setTimeout(resolve, Number(args.delay)));
      await context.checkpoint();
      self.pendingBarrierOrder = [...self.pendingBarrierOrder, "end:" + args.name];
      return String(input).trim() + ":" + args.name;
    }
  }
});`,
  };
  const document = `>>>>! include "./modules/pending-barrier.js"
>>>> pure_wait name="before" delay=20 | effect_wait name="barrier" delay=5
A
<<<< pure_wait
>>>> pure_wait name="after" delay=1
B
<<<< pure_wait`;
  const { result, harness } = await run(document, [moduleFile]);

  assert.equal(result.ok, true, result.error);
  assert.deepEqual([...harness.context.self.pendingBarrierOrder], [
    "start:before", "end:before",
    "start:barrier", "end:barrier",
    "start:after", "end:after",
  ]);
  assert.equal(result.executionReport.scheduling.peakConcurrency, 1);
  assert.equal(result.executionReport.scheduling.barrierNodeRefs.length, 1);
});

test("a failed concurrent branch drains started siblings and revokes all durable output", async () => {
  const moduleFile = {
    path: "modules/branch-failure.js",
    content: `define({
  branch_fail: {
    state: "pure", determinism: "deterministic", effects: [],
    async transform(input, args, context) {
      await new Promise(resolve => setTimeout(resolve, Number(args.delay)));
      await context.checkpoint();
      self.drainedBranches = [...(self.drainedBranches || []), args.name];
      if (args.fail) throw new Error("branch failure:" + args.name);
      return input;
    }
  }
});`,
  };
  const document = `>>>>! include "./modules/branch-failure.js"
>>>> branch_fail name="first" delay=5 fail=true
A
<<<< branch_fail
>>>> branch_fail name="sibling" delay=25
B
<<<< branch_fail`;
  const { result, harness } = await run(document, [moduleFile]);

  assert.equal(result.ok, false);
  assert.match(result.error, /branch failure:first/);
  assert.deepEqual([...harness.context.self.drainedBranches], ["first", "sibling"]);
  assert.equal(result.executionReport.scheduling.peakConcurrency, 2);
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.args.name)), JSON.stringify(["first", "sibling"]));
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.status)), JSON.stringify(["failed", "succeeded"]));
  assert.equal(result.resultEnvelope.run.committed, false);
  assert.equal(result.resultEnvelope.render.data, "");
  assert.equal(JSON.stringify(result.resultEnvelope.channelSnapshots), "{}");
  assert.equal(result.executionStats.writes, 0);
});

test("cancellation and deadline outrank an earlier ordinary branch error after drain", async () => {
  const moduleFile = {
    path: "modules/terminal-priority.js",
    content: `define({
  fail_early: {
    state: "pure", determinism: "deterministic", effects: [],
    async transform() { await new Promise(resolve => setTimeout(resolve, 2)); throw new Error("ordinary branch error"); }
  },
  settle_late: {
    state: "pure", determinism: "deterministic", effects: [],
    async transform(input, args, context) {
      await new Promise(resolve => setTimeout(resolve, Number(args.delay)));
      if (args.checkpoint) await context.checkpoint();
      return input;
    }
  }
});`,
  };
  const document = `>>>>! include "./modules/terminal-priority.js"
>>>> fail_early
A
<<<< fail_early
>>>> settle_late delay=35 checkpoint=true
B
<<<< settle_late`;

  const cancelHarness = createHarness();
  cancelHarness.sendWithoutWaiting({ runId: 32, documentSource: document, modules: [moduleFile], options: {} });
  await new Promise((resolve) => setTimeout(resolve, 8));
  cancelHarness.sendWithoutWaiting({ type: "cancel", runId: 32, reason: "priority-test" });
  while (!cancelHarness.messages.some((message) => message.runId === 32 && Object.hasOwn(message, "ok"))) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const cancelled = cancelHarness.messages.find((message) => message.runId === 32 && Object.hasOwn(message, "ok"));
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.diagnostics.at(-1).code, "TBA-RUN-CANCELLED-LAB");
  assert.equal(cancelled.executionReport.resources.status, "cancelled");

  const deadlineDocument = document.replace("checkpoint=true", "checkpoint=false");
  const deadline = await run(deadlineDocument, [moduleFile], { runtimeLimits: { deadlineMs: 10 } }, 33);
  assert.equal(deadline.result.ok, false);
  assert.equal(deadline.result.cancelled, false);
  assert.equal(deadline.result.diagnostics.at(-1).code, "TBA-RUN-DEADLINE-LAB");
  assert.equal(deadline.result.executionReport.resources.status, "deadline-exceeded");
});

test("cancelling concurrent editor branches drains the wave and rolls back cache and delta", async () => {
  const harness = createHarness();
  const opened = await harness.send({
    type: "open",
    requestId: "open:parallel-cancel",
    document: { documentId: "doc:parallel-cancel", path: "document.md", source: branchDocument, documentRevision: 1 },
  });
  await harness.send({
    type: "subscribe",
    requestId: "subscribe:parallel-cancel",
    documentId: "doc:parallel-cancel",
    subscriptionId: "subscription:parallel-cancel",
    channels: ["*"],
  });
  const baseline = await harness.send({
    type: "run",
    requestId: "run:parallel-baseline",
    runId: 40,
    documentId: "doc:parallel-cancel",
    documentRevision: opened.document.documentRevision,
    modules: [asyncBranchModule],
    options: {},
  });
  assert.equal(baseline.ok, true, baseline.error);
  await harness.sendWithoutWaiting({
    type: "run",
    requestId: "run:parallel-cancel",
    runId: 41,
    documentId: "doc:parallel-cancel",
    documentRevision: opened.document.documentRevision,
    modules: [asyncBranchModule],
    options: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await harness.sendWithoutWaiting({ type: "cancel", runId: 41, reason: "test" });
  while (!harness.messages.some((message) => message.type === "run-result" && message.runId === 41)) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const result = harness.messages.find((message) => message.type === "run-result" && message.runId === 41);

  assert.equal(result.cancelled, true);
  assert.equal(result.executionReport.resources.status, "cancelled");
  assert.equal(result.executionReport.resources.diagnosticCode, "TBA-RUN-CANCELLED-LAB");
  assert.equal(result.executionReport.scheduling.peakConcurrency, 2);
  assert.equal(result.executionReport.transactionState, "rolled-back-cancelled");
  assert.equal(result.executionStats.writes, 0);
  assert.equal(result.editorKernel.metadataDelta.mode, "not-committed");
  assert.equal(result.resultEnvelope.run.committed, false);
});

test("cooperative deadline fails at a checkpoint without claiming synchronous preemption", async () => {
  const moduleFile = {
    path: "modules/deadline.js",
    content: `define({ slow: { state: "pure", determinism: "deterministic", effects: [], async transform(input, _args, context) { await new Promise(resolve => setTimeout(resolve, 12)); await context.checkpoint(); return input; } } });`,
  };
  const { result } = await run(
    `>>>>! include "./modules/deadline.js"\n>>>> slow\nA\n<<<< slow`,
    [moduleFile],
    { runtimeLimits: { deadlineMs: 2 } },
  );

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.diagnostics.at(-1).code, "TBA-RUN-DEADLINE-LAB");
  assert.equal(result.executionReport.resources.status, "deadline-exceeded");
  assert.equal(result.executionReport.resources.enforcement.deadline, "cooperative-runtime-boundary");
  assert.equal(result.executionReport.resources.enforcement.synchronousPreemption, false);
  assert.equal(result.resultEnvelope.run.committed, false);
});

test("a queued run starts its deadline when execution begins rather than while waiting", async () => {
  const harness = createHarness();
  const moduleFile = {
    path: "modules/queue-deadline.js",
    content: `define({
  wait: { state: "run", determinism: "deterministic", effects: ["timer"], async transform(input, args, context) { await new Promise(resolve => setTimeout(resolve, Number(args.delay))); await context.checkpoint(); return input; } },
  quick: { state: "pure", determinism: "deterministic", effects: [], async transform(input, _args, context) { await context.checkpoint(); return input; } }
});`,
  };
  const slow = `>>>>! include "./modules/queue-deadline.js"\n>>>> wait delay=60\nslow\n<<<< wait`;
  const quick = `>>>>! include "./modules/queue-deadline.js"\n>>>> quick\nquick\n<<<< quick`;
  harness.sendWithoutWaiting({ runId: 45, documentSource: slow, modules: [moduleFile], options: {} });
  harness.sendWithoutWaiting({ runId: 46, documentSource: quick, modules: [moduleFile], options: { runtimeLimits: { deadlineMs: 40 } } });
  while (harness.messages.filter((message) => Object.hasOwn(message, "ok")).length < 2) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const result = harness.messages.find((message) => message.runId === 46 && Object.hasOwn(message, "ok"));

  assert.equal(result.ok, true, result.error);
  assert.equal(result.executionReport.resources.status, "within-limits");
  assert.equal(result.executionReport.resources.effective.deadlineMs, 40);
});

test("stage, event and render budgets fail before durable commit with exact diagnostics", async () => {
  const twoStageModule = {
    path: "modules/limits.js",
    content: `define({
  identity: { state: "pure", determinism: "deterministic", effects: [], transform(input) { self.limitStageCalls = (self.limitStageCalls || 0) + 1; return input; } },
  events: { state: "run", determinism: "deterministic", effects: ["channel:records"], transform(input, _args, context) { context.emit("records", { n: 1 }); context.emit("records", { n: 2 }); return input; } }
});`,
  };
  const stageLimited = await run(
    `>>>>! include "./modules/limits.js"\n>>>> identity | identity\nA\n<<<< identity`,
    [twoStageModule],
    { runtimeLimits: { maxStageResolutions: 1 } },
    51,
  );
  assert.equal(stageLimited.result.diagnostics.at(-1).code, "TBA-RUN-STAGE-LIMIT-LAB");
  assert.equal(stageLimited.harness.context.self.limitStageCalls, undefined);
  assert.equal(stageLimited.result.executionReport.resources.usage.plannedStageResolutions, 2);

  const eventLimited = await run(
    `>>>>! include "./modules/limits.js"\n>>>> events\nA\n<<<< events`,
    [twoStageModule],
    { runtimeLimits: { maxChannelEvents: 1 } },
    52,
  );
  assert.equal(eventLimited.result.diagnostics.at(-1).code, "TBA-RUN-EVENT-LIMIT-LAB");
  assert.equal(eventLimited.result.executionReport.resources.usage.channelEvents, 1);
  assert.equal(JSON.stringify(eventLimited.result.channels), "{}");

  const renderLimited = await run(
    `>>>>! include "./modules/limits.js"\n>>>> identity\nabcdef\n<<<< identity`,
    [twoStageModule],
    { runtimeLimits: { maxRenderBytes: 3 } },
    53,
  );
  assert.equal(renderLimited.result.diagnostics.at(-1).code, "TBA-RUN-RENDER-LIMIT-LAB");
  assert.ok(renderLimited.result.executionReport.resources.usage.renderBytes > 3);

  for (const { result } of [stageLimited, eventLimited, renderLimited]) {
    assert.equal(result.ok, false);
    assert.equal(result.resultEnvelope.run.committed, false);
    assert.equal(result.resultEnvelope.render.data, "");
    assert.equal(result.executionStats.writes, 0);
  }
});

test("invalid numeric runtime policy is rejected before parse or module initialization", async () => {
  for (const maxParallelism of [0, true, "2", null]) {
    const { result } = await run("plain text", [], { runtimeLimits: { maxParallelism } });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, "TBA-RUN-POLICY-LAB");
    assert.equal(result.inspection, null);
    assert.equal(result.plan, null);
    assert.equal(result.executionReport.resources.status, "invalid-policy");
    assert.equal(result.executionReport.scheduling.waveCount, 0);
  }
});
