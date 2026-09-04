import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function runRuntime(documentSource, modules) {
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
  await context.self.onmessage({ data: { runId: 1, documentSource, modules } });
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
