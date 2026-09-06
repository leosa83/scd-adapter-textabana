import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { parseDocument } from "../runtime/parser.js";

const workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");

function createHarness() {
  const messages = [];
  const self = { postMessage(message) { messages.push(message); } };
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
      await context.self.onmessage({ data });
      return messages.at(-1);
    },
  };
}

async function run(documentSource, modules = [], options = {}, documentPath = "document.md") {
  const harness = createHarness();
  const result = await harness.send({ runId: 1, documentSource, documentPath, modules, options });
  return { result, harness };
}

const coreModule = {
  path: "modules/core.js",
  content: `define({
    upper: input => String(input).toUpperCase(),
    wrap: (input, args) => String(args.before) + String(input).trim() + String(args.after),
    generated_property: () => "{.generated}"
  });`,
};

function codePointSlice(source, span) {
  return Array.from(source).slice(span.start, span.end).join("");
}

function walkAst(node, visit) {
  visit(node);
  for (const child of node.children || []) walkAst(child, visit);
  for (const property of node.properties || []) walkAst(property, visit);
}

function assertPortableJson(value, path = "$") {
  assert.notEqual(value, undefined, `${path} must not be undefined`);
  assert.notEqual(typeof value, "function", `${path} must not be a function`);
  assert.notEqual(typeof value, "symbol", `${path} must not be a symbol`);
  assert.notEqual(typeof value, "bigint", `${path} must not be a bigint`);
  if (typeof value === "number") assert.equal(Number.isFinite(value), true, `${path} must be finite`);
  if (Array.isArray(value)) value.forEach((item, index) => assertPortableJson(item, `${path}[${index}]`));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) assertPortableJson(item, `${path}.${key}`);
  }
}

function pointPosition(source, offset) {
  let line = 1;
  let column = 0;
  for (const character of Array.from(source).slice(0, offset)) {
    if (character === "\n") { line += 1; column = 0; }
    else column += 1;
  }
  return { line, column };
}

function assertAllSourceSpans(value, source, path = "$", seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return 0;
  seen.add(value);
  let count = 0;
  if (value.unit === "unicode-code-point" && Number.isInteger(value.start) && Number.isInteger(value.end)) {
    const start = pointPosition(source, value.start);
    const end = pointPosition(source, value.end);
    assert.ok(value.start >= 0 && value.end >= value.start && value.end <= Array.from(source).length, `${path} is outside source`);
    assert.deepEqual([value.startLine, value.startColumn], [start.line, start.column], `${path} start projection`);
    assert.deepEqual([value.endLine, value.endColumn], [end.line, end.column], `${path} end projection`);
    if (value.synthetic) assert.equal(value.start, value.end, `${path} synthetic spans are zero-width`);
    count += 1;
  }
  for (const [key, item] of Object.entries(value)) count += assertAllSourceSpans(item, source, `${path}.${key}`, seen);
  return count;
}

test("Lezer CST is lossless and typed IR spans use half-open Unicode code points", () => {
  const source = "A😀\r\n>>>> upper\r\nx {.claim priority=10}\r\n<<<< upper";
  const parsed = parseDocument(source, { documentPath: "docs/sample.tba", documentId: "doc:emoji" });
  const length = Array.from(source).length;

  assert.equal(parsed.executable, true);
  assert.equal(parsed.ir.schema, "textabana.ir/lab-v2");
  assert.equal(parsed.ir.parser.engine, "lezer-lr");
  assert.equal(parsed.ir.syntax.cst.lossless, true);
  assert.equal(parsed.ir.syntax.cst.nodes.map((node) => node.lexeme).join(""), source);
  assert.equal(parsed.ir.sourceRef.documentId, "doc:emoji");
  assert.equal(parsed.ir.nodes[0].sourceSpan.end, 3);
  assert.equal(codePointSlice(source, parsed.ir.nodes[0].sourceSpan), "A😀\r");

  const ids = new Set();
  for (const node of parsed.ir.nodes) {
    assert.equal(ids.has(node.nodeId), false, `duplicate IR node id ${node.nodeId}`);
    ids.add(node.nodeId);
    assert.equal(node.sourceSpan.unit, "unicode-code-point");
    assert.equal(Number.isInteger(node.sourceSpan.start), true);
    assert.equal(Number.isInteger(node.sourceSpan.end), true);
    assert.ok(node.sourceSpan.start >= 0 && node.sourceSpan.end >= node.sourceSpan.start && node.sourceSpan.end <= length);
    if (!node.sourceSpan.synthetic && node.kind !== "Blank") assert.ok(codePointSlice(source, node.sourceSpan).length > 0);
  }
  walkAst(parsed.ir.syntax.ast, (node) => {
    assert.ok(node.sourceSpan.start >= 0 && node.sourceSpan.end <= length);
    for (const child of node.children || []) {
      assert.ok(node.sourceSpan.start <= child.sourceSpan.start);
      assert.ok(node.sourceSpan.end >= child.sourceSpan.end);
    }
  });
  assert.doesNotThrow(() => JSON.stringify(parsed.ir));
});

test("all public syntax, scope, stage, argument and diagnostic spans project to the same snapshot", () => {
  const source = `😀 intro\r
>>>>! include "./modules/core.js"\r
>>>>! config scope-order="declaration:asc"\r
>>>>+ upper @id=ambient @order=10\r
>>>> wrap before="[" after="]"\r
  | upper label="x"\r
text {.claim priority=10}\r
<<<< wrap\r
<<<<+ @id=ambient\r
`;
  const parsed = parseDocument(source, { documentId: "doc:span-audit" });
  let cursor = 0;

  assert.equal(parsed.executable, true);
  for (const node of parsed.cst.nodes) {
    assert.equal(node.sourceSpan.start, cursor);
    assert.equal(codePointSlice(source, node.sourceSpan), node.lexeme);
    cursor = node.sourceSpan.end;
  }
  assert.equal(cursor, Array.from(source).length);
  assert.ok(assertAllSourceSpans(parsed.ir, source) > 30);

  const brokenSource = `>>>> wrap\n>>>> upper\ntext\n<<<< wrap`;
  const broken = parseDocument(brokenSource);
  assert.equal(broken.executable, false);
  assert.ok(assertAllSourceSpans(broken.ir, brokenSource) > 10);
  assert.equal(broken.diagnostics[0].related.length, 2);
});

test("empty and trailing blank lines use explicit source-backed zero-width IR spans", () => {
  for (const source of ["", "\n", "x\n"]) {
    const parsed = parseDocument(source);
    assert.equal(parsed.ir.syntax.cst.nodes.map((node) => node.lexeme).join(""), source);
    const blankNodes = parsed.ir.nodes.filter((node) => node.kind === "Blank");
    assert.ok(blankNodes.length > 0);
    for (const node of blankNodes) {
      assert.equal(node.sourceSpan.start, node.sourceSpan.end);
      assert.notEqual(node.sourceSpan.synthetic, true);
      assert.equal(codePointSlice(source, node.sourceSpan), "");
    }
  }
});

test("recovery IR remains finite and round-trippable when interval order is invalid", () => {
  const parsed = parseDocument(`>>>>+ upper @id=bad @order=no
text
<<<<+ @id=bad`);

  assert.equal(parsed.executable, false);
  assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-INVALID-CONTROL-LAB"), true);
  assert.equal(parsed.ir.scopes[0].order, 1);
  assertPortableJson(parsed.ir);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.ir)), parsed.ir);
});

test("numeric overflow and prototype-sensitive argument names cannot escape typed IR", () => {
  const huge = "9".repeat(400);
  const parsed = parseDocument(`>>>> upper amount=${huge} values=[1,${huge}] __proto__={"polluted":true}
x
<<<< upper`);

  assert.equal(parsed.executable, false);
  assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-NUMBER-RANGE-LAB"), true);
  assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-INVALID-ARGUMENT-LAB"), true);
  assert.equal(Object.prototype.polluted, undefined);
  assertPortableJson(parsed.ir);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.ir)), parsed.ir);
});

test("escaped markers and fenced controls are literal and never resolve modules", async () => {
  const source = `\\>>>> upper

\`\`\`textabana
>>>>! include "./missing.js"
>>>> upper
inside
<<<< upper
\`\`\`

~~~textabana
>>>>! config scope-order="declaration:desc"
<<<<+ @id=missing
~~~`;
  const { result } = await run(source);

  assert.equal(result.ok, true, result.error);
  assert.equal(result.modulesLoaded, 0);
  assert.equal(result.executionTrace.length, 0);
  assert.match(result.output, /^>>>> upper/);
  assert.match(result.output, />>>>! include "\.\/missing\.js"/);
  assert.match(result.output, /<<<<\+ @id=missing/);
  assert.equal(result.inspection.sourceLines.filter((line) => line.kind.startsWith("fence")).length, 10);
});

test("an incomplete trailing pipeline creates non-executable recovery before module initialization", async () => {
  const tripwireModule = {
    path: "modules/tripwire.js",
    content: `self.moduleInitialized = true; define({ tripwire: input => input });`,
  };
  const source = `>>>>! include "./modules/tripwire.js"
>>>> tripwire |
never
<<<< tripwire`;
  const { result, harness } = await run(source, [tripwireModule]);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TBA-PARSE-MISSING-STAGE-LAB");
  assert.equal(result.diagnostics[0].phase, "parsing");
  assert.equal(result.inspection.validity.status, "recovered");
  assert.equal(result.inspection.validity.executable, false);
  assert.equal(result.inspection.nodes.some((node) => node.kind === "Recovery" && node.executable === false), true);
  assert.equal(result.inspection.blocks[0].executable, false);
  assert.equal(result.inspection.blocks[0].pipeline[0].executable, false);
  assert.equal(result.executionTrace.length, 0);
  assert.equal(result.plan, null);
  assert.equal(result.modulesLoaded, 0);
  assert.equal(harness.context.self.moduleInitialized, undefined);
  assert.equal(result.resultEnvelope.render.data, "");
  assert.deepEqual(Object.keys(result.resultEnvelope.channelSnapshots), []);
});

test("a late syntax error blocks an earlier complete stage before module initialization", async () => {
  const tripwireModule = {
    path: "modules/tripwire.js",
    content: `self.lateGateInitialized = true; define({ tripwire: input => input });`,
  };
  const source = `>>>>! include "./modules/tripwire.js"
>>>> tripwire
would otherwise run
<<<< tripwire
<<<< orphan`;
  const { result, harness } = await run(source, [tripwireModule]);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TBA-PARSE-BLOCK-ORPHAN-CLOSE-LAB");
  assert.equal(result.modulesLoaded, 0);
  assert.equal(harness.context.self.lateGateInitialized, undefined);
  assert.equal(result.executionTrace.length, 0);
  assert.equal(result.plan, null);
});

test("an interval open rejects pipeline syntax because nested opens define interval piping", async () => {
  const source = `>>>>! include "./modules/core.js"
>>>>+ upper | wrap before="[" after="]" @id=invalid
text
<<<<+ @id=invalid`;
  const { result } = await run(source, [coreModule]);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-INTERVAL-PIPELINE-LAB"), true);
  assert.equal(result.inspection.scopes.length, 0);
  assert.equal(result.inspection.nodes.some((node) => node.kind === "Recovery" && node.recoveryKind === "InvalidIntervalPipeline"), true);
  assert.equal(result.executionTrace.length, 0);
  assert.equal(result.plan, null);
});

test("an interval trailing pipe keeps recovered scope syntax non-executable", async () => {
  const source = `>>>>! include "./modules/core.js"
>>>>+ upper @id=recovered |
text
<<<<+ @id=recovered`;
  const { result } = await run(source, [coreModule]);

  const intervalOpen = result.inspection.nodes.find((node) => node.kind === "IntervalOpen");
  const intervalClose = result.inspection.nodes.find((node) => node.kind === "IntervalClose");
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-MISSING-STAGE-LAB"), true);
  assert.equal(intervalOpen.executable, false);
  assert.equal(intervalOpen.stage.executable, false);
  assert.equal(intervalClose.executable, false);
  assert.equal(result.executionTrace.length, 0);
});

test("unknown virtual stages and invalid @intervals arguments fail in parsing", async () => {
  const unknown = await run(`>>>>! include "./modules/core.js"
>>>> upper | @wat value=1
x
<<<< upper`, [coreModule]);
  const invalidIntervals = parseDocument(`>>>> upper @inherit=explicit
  | @intervals bananas=[x] only=[x] except=[y]
x
<<<< upper`);

  assert.equal(unknown.result.ok, false);
  assert.equal(unknown.result.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-VIRTUAL-STAGE-LAB"), true);
  assert.equal(unknown.result.modulesLoaded, 0);
  assert.equal(unknown.result.executionTrace.length, 0);
  assert.equal(invalidIntervals.executable, false);
  assert.ok(invalidIntervals.diagnostics.filter((diagnostic) => diagnostic.code === "TBA-PARSE-INTERVALS-STAGE-LAB").length >= 2);
  assert.equal(invalidIntervals.ir.blocks[0].executable, false);
});

test("configuration is source-ordered and the last valid scope-order wins", () => {
  const parsed = parseDocument(`>>>>! config scope-order="declaration:desc"
>>>>! config scope-order="declaration:asc"
text`);

  assert.equal(parsed.executable, true);
  assert.equal(parsed.ir.configuration.scopeOrder, "asc");
});

test("engine controls require exact portable types and active scope ids are unique", () => {
  const cases = [
    [">>>>+ upper @id=x @order=true\nx\n<<<<+ @id=x", "TBA-PARSE-INVALID-CONTROL-LAB"],
    [">>>>+ upper @id=[x,y]\nx\n<<<<+ upper", "TBA-PARSE-SCOPE-ID-LAB"],
    [">>>> upper @inherit=[none]\nx\n<<<< upper", "TBA-PARSE-INVALID-CONTROL-LAB"],
    [">>>> upper @inherit=only @intervals=[1,null,true]\nx\n<<<< upper", "TBA-PARSE-INVALID-CONTROL-LAB"],
    [">>>> upper @inherit=explicit | @intervals only=[1,null,true]\nx\n<<<< upper", "TBA-PARSE-INTERVALS-STAGE-LAB"],
    [">>>> upper @inherit=explicit | @intervals except=[\"bad space\"]\nx\n<<<< upper", "TBA-PARSE-INTERVALS-STAGE-LAB"],
    [">>>>! config scope-order=[declaration:asc]\nx", "TBA-PARSE-INVALID-CONFIG-LAB"],
  ];
  for (const [source, code] of cases) {
    const parsed = parseDocument(source);
    assert.equal(parsed.executable, false);
    assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.code === code), true);
    assertPortableJson(parsed.ir);
  }

  const duplicate = parseDocument(`>>>>+ upper @id=same
>>>>+ wrap @id=same
text
<<<<+ @id=same`);
  assert.equal(duplicate.executable, false);
  assert.equal(duplicate.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-SCOPE-ID-LAB"), true);
  assert.equal(duplicate.ir.scopes.length, 1);

  const typedSource = ">>>>+ upper @id=x @order=true\nx\n<<<<+ @id=x";
  const typed = parseDocument(typedSource);
  const orderDiagnostic = typed.diagnostics.find((diagnostic) => diagnostic.recoveryNodeId && diagnostic.code === "TBA-PARSE-INVALID-CONTROL-LAB");
  assert.equal(codePointSlice(typedSource, orderDiagnostic.sourceSpan), "@order=true");
});

test("mismatched close recovers locally and retains a following valid sibling", async () => {
  const source = `>>>>! include "./modules/core.js"
>>>> upper
first
<<<< wrap
>>>> upper
second
<<<< upper`;
  const { result } = await run(source, [coreModule]);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TBA-PARSE-BLOCK-MISMATCH-LAB");
  assert.equal(result.inspection.blocks.length, 2);
  assert.equal(result.inspection.blocks[0].complete, false);
  assert.equal(result.inspection.blocks[1].complete, true);
  assert.equal(result.inspection.blocks[1].name, "upper");
  assert.equal(result.executionTrace.length, 0);
  assert.equal(result.modulesLoaded, 0);
});

test("an ancestor close inserts a synthetic non-executable close for inner blocks", () => {
  const parsed = parseDocument(`>>>> wrap before="[" after="]"
>>>> upper
inner
<<<< wrap
after`);
  const [outer, inner] = parsed.ir.blocks;

  assert.equal(parsed.executable, false);
  assert.equal(parsed.diagnostics[0].code, "TBA-PARSE-BLOCK-MISMATCH-LAB");
  assert.equal(parsed.diagnostics[0].sourceSpan.synthetic, true);
  assert.equal(parsed.diagnostics[0].sourceSpan.start, parsed.diagnostics[0].sourceSpan.end);
  assert.equal(inner.complete, false);
  assert.equal(inner.executable, false);
  assert.equal(inner.closeSpan.synthetic, true);
  assert.ok(inner.sourceSpan.end >= inner.closeSpan.end);
  assert.equal(outer.complete, true);
  assert.equal(outer.closeSpan.synthetic, undefined);
  assert.equal(outer.executable, false);
  assert.equal(parsed.ir.sourceLines[3].kind, "block-close");
});

test("unterminated strings and scopes return exact stable recovery diagnostics", async () => {
  const brokenString = await run(`>>>> upper label="unfinished
x
<<<< upper`, [coreModule]);
  const brokenScope = await run(`>>>>+ upper @id=ambient
x`, [coreModule]);

  assert.equal(brokenString.result.diagnostics[0].code, "TBA-PARSE-UNTERMINATED-STRING-LAB");
  assert.equal(brokenString.result.executionTrace.length, 0);
  assert.equal(brokenScope.result.diagnostics[0].code, "TBA-PARSE-SCOPE-UNCLOSED-LAB");
  assert.equal(brokenScope.result.diagnostics[0].sourceSpan.start, Array.from(`>>>>+ upper @id=ambient
x`).length);
  assert.equal(brokenScope.result.diagnostics[0].sourceSpan.start, brokenScope.result.diagnostics[0].sourceSpan.end);
});

test("authored properties are lowered once while generated property-like text is preserved", async () => {
  const authored = await run("Text {.claim priority=10}\n{.metadata}\nAfter");
  const generated = await run(
    `>>>>! include "./modules/core.js"
>>>> generated_property
x
<<<< generated_property`,
    [coreModule],
  );

  assert.equal(authored.result.ok, true);
  assert.equal(authored.result.output, "Text\n\nAfter");
  assert.equal(authored.result.inspection.nodes.filter((node) => node.kind === "Property").length, 2);
  assert.equal(generated.result.ok, true);
  assert.equal(generated.result.output, "{.generated}");
});

test("multiline pipeline stages retain their authored spans and plan references", async () => {
  const source = `>>>>! include "./modules/core.js"
>>>> upper
  | wrap before="[" after="]"
hello
<<<< upper`;
  const { result } = await run(source, [coreModule]);
  const stages = result.inspection.blocks[0].pipeline;

  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(stages.map((stage) => [stage.name, stage.line])), JSON.stringify([["upper", 2], ["wrap", 3]]));
  assert.equal(JSON.stringify(result.executionTrace.map((step) => [step.function, step.line])), JSON.stringify([["upper", 2], ["wrap", 3]]));
  for (const step of result.executionTrace) {
    const syntaxStage = stages.find((stage) => stage.stageId === step.syntaxStageRef);
    assert.ok(syntaxStage);
    assert.equal(syntaxStage.name, step.function);
    assert.equal(JSON.stringify(step.syntaxSpan), JSON.stringify(syntaxStage.sourceSpan));
  }
});

test("interval execution steps retain their authored stage reference and span", async () => {
  const source = `>>>>! include "./modules/core.js"
>>>>+ upper @id=ambient
text
<<<<+ @id=ambient`;
  const { result } = await run(source, [coreModule]);
  const intervalOpen = result.inspection.nodes.find((node) => node.kind === "IntervalOpen");
  const step = result.executionTrace.find((candidate) => candidate.modality === "interval");

  assert.equal(result.ok, true, result.error);
  assert.ok(intervalOpen);
  assert.ok(step);
  assert.equal(step.syntaxStageRef, intervalOpen.stage.stageId);
  assert.deepEqual(step.syntaxSpan, intervalOpen.stage.sourceSpan);
});

test("one interval stage keeps quoted pipes intact and rejects continuation syntax", async () => {
  const quoted = await run(`>>>>! include "./modules/core.js"
>>>>+ wrap before="[|]" after="]" @id=quoted
x
<<<<+ @id=quoted`, [coreModule]);
  const continuation = await run(`>>>>! include "./modules/core.js"
>>>>+ upper @id=ambient
  | wrap before="[" after="]"
x
<<<<+ @id=ambient`, [coreModule]);

  assert.equal(quoted.result.ok, true, quoted.result.error);
  assert.equal(quoted.result.inspection.nodes.find((node) => node.kind === "IntervalOpen").stage.args.before, "[|]");
  assert.equal(continuation.result.ok, false);
  assert.equal(continuation.result.diagnostics.some((diagnostic) => diagnostic.code === "TBA-PARSE-ORPHAN-PIPE-LAB"), true);
  assert.equal(continuation.result.executionTrace.length, 0);
});

test("repeated interval invocations share syntax identity but keep invocation identity", async () => {
  const source = `>>>>! include "./modules/core.js"
>>>>+ upper @id=ambient
alpha
>>>> wrap before="<" after=">"
beta
<<<< wrap
gamma
<<<<+ @id=ambient`;
  const { result } = await run(source, [coreModule]);
  const intervalOpen = result.inspection.nodes.find((node) => node.kind === "IntervalOpen");
  const intervalSteps = result.executionTrace.filter((step) => step.modality === "interval");

  assert.equal(result.ok, true, result.error);
  assert.equal(intervalSteps.length, 3);
  assert.equal(new Set(intervalSteps.map((step) => step.invocationId)).size, 3);
  assert.deepEqual(new Set(intervalSteps.map((step) => step.syntaxStageRef)), new Set([intervalOpen.stage.stageId]));
  for (const step of intervalSteps) assert.deepEqual(step.syntaxSpan, intervalOpen.stage.sourceSpan);
});

test("indented orphan continuation is recovery while a Markdown table row remains text", async () => {
  const orphan = await run("  | upper\nordinary", [coreModule]);
  const emptyBlockContinuation = parseDocument(">>>> upper\n  |\nx\n<<<< upper");
  const table = await run("| A | B |\n| - | - |\n| 1 | 2 |");

  assert.equal(orphan.result.ok, false);
  assert.equal(orphan.result.diagnostics[0].code, "TBA-PARSE-ORPHAN-PIPE-LAB");
  assert.equal(emptyBlockContinuation.diagnostics[0].code, "TBA-PARSE-MISSING-STAGE-LAB");
  assert.equal(emptyBlockContinuation.ir.blocks[0].executable, false);
  assert.equal(emptyBlockContinuation.ir.blocks[0].pipeline[0].executable, false);
  assert.equal(table.result.ok, true);
  assert.equal(table.result.output, "| A | B |\n| - | - |\n| 1 | 2 |");
});

test("diagnostic keys survive unrelated line insertion while snapshot spans move", () => {
  const source = ">>>> upper |\nx\n<<<< upper";
  const before = parseDocument(source);
  const after = parseDocument(`intro\n${source}`);

  assert.equal(before.diagnostics[0].diagnosticKey, after.diagnostics[0].diagnosticKey);
  assert.equal(after.diagnostics[0].sourceSpan.startLine, before.diagnostics[0].sourceSpan.startLine + 1);
  assert.notEqual(before.diagnostics[0].diagnosticId, after.diagnostics[0].diagnosticId);
});

test("diagnostic keys are unique for repeated recoveries and stable across unrelated insertion", () => {
  const source = `>>>> upper |
x
<<<< upper
>>>> upper |
y
<<<< upper`;
  const before = parseDocument(source).diagnostics.filter((diagnostic) => diagnostic.code === "TBA-PARSE-MISSING-STAGE-LAB");
  const after = parseDocument(`intro
${source}`).diagnostics.filter((diagnostic) => diagnostic.code === "TBA-PARSE-MISSING-STAGE-LAB");

  assert.equal(new Set(before.map((diagnostic) => diagnostic.diagnosticKey)).size, 2);
  assert.deepEqual(after.map((diagnostic) => diagnostic.diagnosticKey), before.map((diagnostic) => diagnostic.diagnosticKey));
});

test("Editor Kernel analyze exposes recovery on the current revision without execution", async () => {
  const harness = createHarness();
  const documentId = "doc:parser-loop";
  const valid = ">>>> upper\nx\n<<<< upper";
  const close = "\n<<<< upper";
  const closeFrom = Array.from(valid).length - Array.from(close).length;

  await harness.send({ type: "open", requestId: "open", documentId, path: "document.md", source: valid });
  const change = await harness.send({
    type: "change",
    requestId: "break",
    documentId,
    baseRevision: 1,
    coordinateUnit: "unicode-code-point",
    changes: [{ from: closeFrom, to: Array.from(valid).length, insert: "" }],
  });
  const recovered = await harness.send({ type: "analyze", requestId: "analyze-2", documentId, documentRevision: 2 });

  assert.equal(change.document.documentRevision, 2);
  assert.equal(recovered.command, "analyze");
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.analysis.executable, false);
  assert.equal(recovered.analysis.inspection.sourceRef.documentId, documentId);
  assert.equal(recovered.analysis.diagnostics[0].code, "TBA-PARSE-BLOCK-UNCLOSED-LAB");
  assert.equal(recovered.analysis.inspection.nodes.some((node) => node.kind === "Recovery"), true);
  assert.equal(harness.messages.some((message) => message.type === "run-result"), false);

  await harness.send({
    type: "change",
    requestId: "repair",
    documentId,
    baseRevision: 2,
    coordinateUnit: "unicode-code-point",
    changes: [{ from: closeFrom, to: closeFrom, insert: close }],
  });
  const repaired = await harness.send({ type: "analyze", requestId: "analyze-3", documentId, documentRevision: 3 });
  assert.equal(repaired.status, "valid");
  assert.equal(repaired.analysis.executable, true);
  assert.equal(repaired.analysis.diagnostics.length, 0);
});

test("document-relative includes resolve through the parser IR", async () => {
  const relativeModule = { path: "docs/modules/core.js", content: "define({ upper: input => String(input).toUpperCase() });" };
  const source = `>>>>! include "./modules/core.js"
>>>> upper
relative
<<<< upper`;
  const { result } = await run(source, [relativeModule], {}, "docs/document.tba");

  assert.equal(result.ok, true, result.error);
  assert.equal(result.output.trim(), "RELATIVE");
  assert.equal(result.inspection.directives[0].path, "docs/modules/core.js");
});
