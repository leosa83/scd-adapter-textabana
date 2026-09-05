import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function runRuntime(documentSource, modules, options = {}) {
  const source = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");
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
  vm.runInContext(source, context);
  await context.self.onmessage({ data: { runId: 1, documentSource, modules, options } });
  return message;
}

test("includes are hidden and a pipeline runs left to right", async () => {
  const result = await runRuntime(
    `>>>> include "./modules/core.js"\n\n>>>> trim | uppercase\n hello \n<<<< trim`,
    [{
      path: "modules/core.js",
      content: `define({\n  trim: input => String(input).trim(),\n  uppercase: input => String(input).toUpperCase()\n});`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "HELLO");
  assert.equal(result.output.includes(">>>>") || result.output.includes("<<<<"), false);
  assert.equal(result.modulesLoaded, 1);
});

test("nested blocks render from the inside out", async () => {
  const result = await runRuntime(
    `>>>> include "./modules/core.js"\n>>>> wrap before="[" after="]"\nA\n>>>> uppercase\nb\n<<<< uppercase\nC\n<<<< wrap`,
    [{
      path: "modules/core.js",
      content: `define({\n  uppercase: input => String(input).toUpperCase(),\n  wrap: { transform(input, args) { return String(args.before) + String(input).trim() + String(args.after); } }\n});`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "[A\nB\nC]");
});

test("block output becomes interval input by default", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>>+ interval @id=ambient\n>>>> block\nx\n<<<< block\n<<<<+ @id=ambient`,
    [{
      path: "modules/core.js",
      content: `define({\n  block: input => "B(" + String(input).trim() + ")",\n  interval: input => "I(" + String(input).trim() + ")"\n});`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "I(B(x))");
});

test("a block can isolate itself from ambient intervals", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>>+ interval @id=ambient\n>>>> block @inherit=none\nx\n<<<< block\n<<<<+ @id=ambient`,
    [{
      path: "modules/core.js",
      content: `define({\n  block: input => "B(" + String(input).trim() + ")",\n  interval: input => "I(" + String(input).trim() + ")"\n});`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "B(x)");
});

test("an explicit interval stage controls placement and selection", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>>+ first @id=one @order=10\n>>>>+ second @id=two @order=20\n>>>> block @inherit=explicit | @intervals only=[one] | finish\nx\n<<<< block\n<<<<+ @id=one\n<<<<+ @id=two`,
    [{
      path: "modules/core.js",
      content: `define({\n  block: input => "B(" + String(input).trim() + ")",\n  first: input => "ONE(" + input + ")",\n  second: input => "TWO(" + input + ")",\n  finish: input => "F(" + input + ")"\n});`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "F(ONE(B(x)))");
});

test("base64 interval functions encode and decode tagged UTF-8 text", async () => {
  const moduleSource = `function encodeUtf8(value) {\n  const bytes = new TextEncoder().encode(value);\n  let binary = "";\n  for (const byte of bytes) binary += String.fromCharCode(byte);\n  return btoa(binary);\n}\nfunction decodeUtf8(value) {\n  const binary = atob(value.replace(/\\s+/g, ""));\n  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));\n}\ndefine({\n  base64encode: input => String(input).replace(/<base64encode>([\\s\\S]*?)<\\/base64encode>/gi, (_m, text) => encodeUtf8(text.trim())),\n  base64decode: input => String(input).replace(/<base64decode>([\\s\\S]*?)<\\/base64decode>/gi, (_m, text) => decodeUtf8(text.trim()))\n});`;
  const result = await runRuntime(
    `>>>>! include "./modules/base64.js"\n>>>>+ base64encode @id=encoder\n<base64encode>räksmörgås</base64encode>\n<<<<+ @id=encoder\n>>>>+ base64decode @id=decoder\n<base64decode>VGV4dGFiYW5h</base64decode>\n<<<<+ @id=decoder`,
    [{ path: "modules/base64.js", content: moduleSource }],
  );

  assert.equal(result.ok, true);
  assert.match(result.output, /csOka3Ntw7ZyZ8Olcw==/);
  assert.match(result.output, /Textabana/);
  assert.doesNotMatch(result.output, /<base64(?:encode|decode)>/);
});

test("nested Base64 interval functions compose to an inverse", async () => {
  const moduleSource = `function encodeUtf8(value) {\n  const bytes = new TextEncoder().encode(value);\n  let binary = "";\n  for (const byte of bytes) binary += String.fromCharCode(byte);\n  return btoa(binary);\n}\nfunction decodeUtf8(value) {\n  const binary = atob(value.replace(/\\s+/g, ""));\n  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));\n}\ndefine({\n  base64encode: input => String(input).replace(/<base64encode>([\\s\\S]*?)<\\/base64encode>/gi, (_m, text) => encodeUtf8(text.trim())),\n  base64decode: input => String(input).replace(/<base64decode>([\\s\\S]*?)<\\/base64decode>/gi, (_m, text) => decodeUtf8(text.trim()))\n});`;
  const result = await runRuntime(
    `>>>>! include "./modules/base64.js"\n>>>>+ base64encode @id=encoder\n>>>>+ base64decode @id=decoder\n<base64decode><base64encode> Textabana kan transformera den här texten </base64encode></base64decode>\n<<<<+ @id=encoder\n<<<<+ @id=decoder`,
    [{ path: "modules/base64.js", content: moduleSource }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "Textabana kan transformera den här texten");
});

test("functions can emit to unlimited named channels without changing render", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/metadata.js"\n>>>> collect channel="records"\nAlpha\nBeta\n<<<< collect`,
    [{
      path: "modules/metadata.js",
      content: `define({\n  collect: {\n    transform(input, args, context) {\n      const lines = String(input).trim().split("\\n");\n      lines.forEach((text, index) => {\n        const location = { row: index + 1, rowId: "record-" + (index + 1), lineOffset: index };\n        context.emit(args.channel, { text }, location);\n        context.emit("search.index", { text: text.toLowerCase() }, location);\n      });\n      return input;\n    }\n  }\n});`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "Alpha\nBeta");
  assert.deepEqual(Object.keys(result.channels), ["records", "search.index"]);
  assert.equal(result.channels.records.length, 2);
  assert.equal(result.channels["search.index"].length, 2);
  assert.equal(result.channels.records[0].payload.text, "Alpha");
  assert.equal(result.channels.records[0].line, 3);
  assert.equal(result.channels.records[1].line, 4);
  assert.equal(result.channels.records[1].rowId, "record-2");
});

test("system.out guarantees row, line, schema and execution provenance", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/metadata.js"\n>>>> inspect\nFörsta posten\nAndra posten\n<<<< inspect`,
    [{
      path: "modules/metadata.js",
      content: `define({\n  inspect: {\n    transform(input, _args, context) {\n      String(input).trim().split("\\n").forEach((text, index) => {\n        context.system.out.row("item-" + (index + 1), { kind: "statement", text }, { row: index + 1, lineOffset: index });\n      });\n      return input;\n    }\n  }\n});`,
    }],
  );

  assert.equal(result.ok, true);
  const [first, second] = result.channels["system.out"];
  assert.equal(first.schema, "textabana.event/v1");
  assert.equal(first.kind, "annotation");
  assert.equal(first.target.mode, "row");
  assert.match(first.target.anchorRef, /^anchor:row:/);
  assert.equal(first.type, "row");
  assert.equal(first.row, 1);
  assert.equal(first.rowId, "item-1");
  assert.equal(first.line, 3);
  assert.equal(first.source.startLine, 3);
  assert.equal(first.source.endLine, 4);
  assert.equal(first.source.mapping, "exact");
  assert.equal(first.origin.function, "inspect");
  assert.equal(first.origin.module, "modules/metadata.js");
  assert.equal(first.origin.modality, "block");
  assert.equal(second.row, 2);
  assert.equal(second.line, 4);
  assert.equal(result.emissions, 2);
  assert.equal(result.anchors.length, 2);
  assert.equal(result.sourceMaps.length, 2);
});

test("system.out.line and warnings retain physical source lines", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/metadata.js"\n>>>> inspect\nFörsta raden\nAndra raden\n<<<< inspect`,
    [{
      path: "modules/metadata.js",
      content: `define({ inspect: { transform(input, _args, context) { context.warn("Kontrollera första raden", { lineOffset: 0 }); context.system.out.line({ text: "Andra raden" }, { row: 2, rowId: "line-two", lineOffset: 1 }); return input; } } });`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics[0].line, 3);
  assert.equal(result.channels.diagnostics[0].line, 3);
  assert.equal(result.channels.diagnostics[0].payload.level, "warning");
  assert.equal(result.channels["system.out"][0].type, "line");
  assert.equal(result.channels["system.out"][0].target.mode, "line");
  assert.equal(result.channels["system.out"][0].kind, "annotation");
  assert.equal(result.channels["system.out"][0].line, 4);
  assert.equal(result.channels["system.out"][0].rowId, "line-two");
});

test("interval inheritance controls both transformation and channel emissions", async () => {
  const modules = [{
    path: "modules/core.js",
    content: `define({\n  block: input => "B(" + String(input).trim() + ")",\n  observe: { transform(input, _args, context) { context.annotate({ seen: String(input).trim() }); return "I(" + String(input).trim() + ")"; } }\n});`,
  }];
  const inherited = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>>+ observe @id=watch\n>>>> block\nx\n<<<< block\n<<<<+ @id=watch`,
    modules,
  );
  const isolated = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>>+ observe @id=watch\n>>>> block @inherit=none\nx\n<<<< block\n<<<<+ @id=watch`,
    modules,
  );

  assert.equal(inherited.output.trim(), "I(B(x))");
  assert.equal(inherited.channels["system.out"].length, 1);
  assert.equal(inherited.channels["system.out"][0].origin.modality, "interval");
  assert.equal(inherited.channels["system.out"][0].origin.scopeId, "watch");
  assert.equal(inherited.channels["system.out"][0].line, 4);
  assert.equal(isolated.output.trim(), "B(x)");
  assert.equal(isolated.channels["system.out"], undefined);
});

test("channel sequence follows deterministic pipeline execution order", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>> first | second\nx\n<<<< first`,
    [{
      path: "modules/core.js",
      content: `define({\n  first: { transform(input, _args, context) { context.emit("audit", { step: "first" }); return input; } },\n  second: { transform(input, _args, context) { context.emit("audit", { step: "second" }); return input; } }\n});`,
    }],
  );

  assert.equal(JSON.stringify(result.channels.audit.map((event) => event.payload.step)), JSON.stringify(["first", "second"]));
  assert.equal(JSON.stringify(result.channels.audit.map((event) => event.sequence)), JSON.stringify([1, 2]));
});

test("a failed run publishes no partial channel snapshot", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>> fail\nx\n<<<< fail`,
    [{
      path: "modules/core.js",
      content: `define({ fail: { transform(input, _args, context) { context.emit("audit", { partial: true }); context.emit("system.private", {}); return input; } } });`,
    }],
  );

  assert.equal(result.ok, false);
  assert.equal(Object.keys(result.channels).length, 0);
  assert.equal(result.emissions, 0);
  assert.match(result.error, /reserverat/);
  assert.equal(result.resultEnvelope.run.status, "failed");
  assert.equal(result.resultEnvelope.render.data, "");
  assert.equal(JSON.stringify(result.resultEnvelope.channelSnapshots), "{}");
});

test("the shared runner exposes scope projection, actual execution trace and one atomic result", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/core.js"\n>>>>+ wrap @id=ambient @order=20\n>>>> upper @inherit=default\nalpha\n<<<< upper\n<<<<+ @id=ambient`,
    [{
      path: "modules/core.js",
      content: `define({ upper: input => String(input).toUpperCase(), wrap: input => "[" + String(input).trim() + "]" });`,
    }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.inspection.schema, "textabana.ir/lab-v2");
  assert.equal(result.inspection.scopes[0].id, "ambient");
  assert.equal(JSON.stringify(result.inspection.scopes[0].segments.map(({ startLine, endLine }) => ({ startLine, endLine }))), JSON.stringify([{ startLine: 4, endLine: 4 }]));
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.function)), JSON.stringify(["upper", "wrap"]));
  assert.equal(JSON.stringify(result.executionTrace.map((step) => step.modality)), JSON.stringify(["block", "interval"]));
  assert.equal(result.resultEnvelope.run.runId, "run:1");
  assert.equal(result.resultEnvelope.render.data.trim(), "[ALPHA]");
  assert.equal(result.capabilities.profiles["language-core/0.4"], "playground-subset");
});

test("strict channel mode requires a declared descriptor and validates required fields", async () => {
  const moduleSource = `define({ publish: { channels: { audit: { payloadKind: "object", schemaRef: "schema:audit/v1", schema: { type: "object", required: ["step"] } } }, transform(input, args, context) { context.emit("audit", args.invalid ? { wrong: true } : { step: "publish" }); return input; } } });`;
  const valid = await runRuntime(
    `>>>>! include "./modules/audit.js"\n>>>> publish\nok\n<<<< publish`,
    [{ path: "modules/audit.js", content: moduleSource }],
    { strictChannels: true },
  );
  const invalid = await runRuntime(
    `>>>>! include "./modules/audit.js"\n>>>> publish invalid=true\nnot committed\n<<<< publish`,
    [{ path: "modules/audit.js", content: moduleSource }],
    { strictChannels: true },
  );

  assert.equal(valid.ok, true);
  assert.equal(valid.channelDescriptors.audit.declared, true);
  assert.equal(valid.channels.audit[0].payload.step, "publish");
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /obligatoriska fältet/);
  assert.equal(JSON.stringify(invalid.channels), "{}");
  assert.equal(invalid.resultEnvelope.render.data, "");
});

test("system.out row and line helpers normalize to the same portable envelope", async () => {
  const result = await runRuntime(
    `>>>>! include "./modules/editor.js"\n>>>> inspect\nAurora\n<<<< inspect`,
    [{
      path: "modules/editor.js",
      content: `define({ inspect: { transform(input, _args, context) { context.system.out.row("ship:aurora", { label: "ship" }, { row: 1, lineOffset: 0, kind: "annotation" }); context.system.out.line({ label: "line" }, { row: 1, rowId: "line:aurora", lineOffset: 0, kind: "annotation" }); return input; } } });`,
    }],
  );

  const [rowEvent, lineEvent] = result.channels["system.out"];
  assert.equal(rowEvent.schema, lineEvent.schema);
  assert.equal(rowEvent.kind, "annotation");
  assert.equal(lineEvent.kind, "annotation");
  assert.equal(rowEvent.target.mode, "row");
  assert.equal(lineEvent.target.mode, "line");
  assert.ok(rowEvent.target.anchorRef);
  assert.ok(lineEvent.target.anchorRef);
  assert.equal(result.sourceMaps.length, 2);
});
