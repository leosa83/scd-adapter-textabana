import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";
import { runHostSuite, loadSdk } from "../conformance/host-runner.mjs";
import { signReport, verifyReport } from "../conformance/report-signing.mjs";
import { verifyRegistry } from "../conformance/registry.mjs";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { spawnSync } from "node:child_process";
import { parseDocument } from "../runtime/parser.js";

test("JCS serializes RFC 8785 numbers, UTF-16 key order and Unicode without normalization", async () => {
  assert.equal(canonicalize({ numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 1e-27, -0], literals: [null, true, false] }), '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27,0]}');
  assert.equal(canonicalize({ "€": 1, "\r": 2, "דּ": 3, "1": 4, "😀": 5, "\u0080": 6, "ö": 7 }), '{"\\r":2,"1":4,"\u0080":6,"ö":7,"€":1,"😀":5,"דּ":3}');
  assert.notEqual(await canonicalDigest("é"), await canonicalDigest("e\u0301"));
  assert.equal(await canonicalDigest({ b: 2, a: 1 }), `sha256:${createHash("sha256").update('{"a":1,"b":2}').digest("hex")}`);
  assert.equal(canonicalize(parseStrictJson('{"__proto__":1,"a":2}')), '{"__proto__":1,"a":2}');
  class MaskedArray extends Array { map() { return ["0"]; } }
  assert.equal(canonicalize(MaskedArray.of(123)), "[123]");
});

test("canonicalization rejects ambiguous and lossy inputs before any digest", () => {
  for (const value of [undefined, NaN, Infinity, 1n, () => 1, new Date(), [ , 1], { a: undefined }, { get a() { throw new Error("getter invoked"); } }, "\ud800", { "\udc00": 1 }]) assert.throws(() => canonicalize(value));
  const cycle = {}; cycle.self = cycle; assert.throws(() => canonicalize(cycle));
  for (const source of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":1,}', '[1,]', '1e999', '"\\ud800"', '{"nested":{"x":1,"x":2}}', '01', 'true false']) assert.throws(() => parseStrictJson(source), source);
});

test("seeded property checks preserve JSON semantics and insertion-order-independent digests", async () => {
  let seed = 0x51c0ffee;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  function value(depth = 0) {
    const kind = Math.floor(random() * (depth > 3 ? 4 : 6));
    if (kind === 0) return null;
    if (kind === 1) return random() > .5;
    if (kind === 2) return (random() - .5) * 10 ** Math.floor(random() * 40 - 20);
    if (kind === 3) return ["é", "e\u0301", "😀", "\\\"\n", "", "\u0000"][Math.floor(random() * 6)];
    if (kind === 4) return Array.from({ length: Math.floor(random() * 4) }, () => value(depth + 1));
    return Object.fromEntries(Array.from({ length: Math.floor(random() * 4) }, (_, i) => [`${i}😀`, value(depth + 1)]));
  }
  const reverse = (input) => input && typeof input === "object" ? Array.isArray(input) ? input.map(reverse) : Object.fromEntries(Object.entries(input).reverse().map(([key, item]) => [key, reverse(item)])) : input;
  for (let i = 0; i < 250; i++) {
    const input = value(); const serialized = canonicalize(input);
    assert.deepEqual(JSON.parse(serialized), input);
    assert.equal(canonicalize(parseStrictJson(serialized)), serialized);
    assert.equal(await canonicalDigest(input), await canonicalDigest(reverse(input)));
  }
});

test("shared external fixtures pass through five real host paths", { timeout: 60000 }, async () => {
  const report = await runHostSuite();
  assert.equal(report.checks.length, 40);
  assert.equal(report.status, "passed", JSON.stringify(report.checks.filter((check) => check.status !== "passed")));
  assert.equal(report.claim.canonicalRuntime, false);
  assert.equal(report.claim.independentImplementations, false);
});

test("seeded incremental parser edits match fresh semantic IR and lossless source", () => {
  let source = '# Titel 😀\n\n>>>> upper\ntext\n<<<< upper\n';
  let parsed = parseDocument(source, { documentPath: "fuzz.md" });
  let seed = 0x5eed1234;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const semantic = (parsed) => {
    const ir = structuredClone(parsed.ir);
    delete ir.parser.parseMode; delete ir.parser.incrementalReuse; delete ir.parser.reusedFragmentCount;
    ir.unsupported = ir.unsupported.filter((item) => item !== "incremental-parser");
    return ir;
  };
  for (let iteration = 0; iteration < 160; iteration++) {
    const points = Array.from(source);
    const from = Math.floor(random() * (points.length + 1));
    const to = Math.min(points.length, from + Math.floor(random() * 4));
    const insert = ["😀", "e\u0301", "\n", "", "```\n", ">>>> upper\n", "<<<< upper\n", "text"][Math.floor(random() * 8)];
    const fromA = points.slice(0, from).join("").length;
    const toA = points.slice(0, to).join("").length;
    points.splice(from, to - from, ...Array.from(insert)); source = points.join("");
    const incremental = parseDocument(source, { documentPath: "fuzz.md", previousTree: parsed.tree, changes: [{ fromA, toA, fromB: fromA, toB: fromA + insert.length }] });
    const fresh = parseDocument(source, { documentPath: "fuzz.md" });
    assert.deepEqual(semantic(incremental), semantic(fresh), `seed 0x5eed1234, iteration ${iteration}`);
    assert.equal(incremental.cst.lossless, true);
    assert.equal(incremental.cst.nodes.map((node) => node.lexeme).join(""), source);
    assert.equal(incremental.ir.sourceSpan.end, Array.from(source).length);
    parsed = incremental;
  }
});

test("CodeMirror queues rapid edits and SDK rejects stale lifecycle requests", async () => {
  const { sdk, cleanup } = await loadSdk();
  const transport = new NodeKernelTransport(); const client = new sdk.TextabanaKernelClient(transport);
  try {
    await client.open("rapid", "rapid.md", "A😀B");
    let revision = 1;
    const binding = sdk.codeMirrorTextabanaBinding(client, "rapid", () => revision, (response) => { revision = response.document.documentRevision; });
    const update = (before, from, to, insert) => ({ docChanged: true, startState: { doc: { toString: () => before } }, changes: { iterChanges: (callback) => callback(from, to, from, from + insert.length, { toString: () => insert }) } });
    await Promise.all([binding(update("A😀B", 1, 3, "🌍é")), binding(update("A🌍éB", 4, 5, "C"))]);
    assert.equal(revision, 3);
    assert.equal((await client.run("rapid", revision, 31, [])).output, "A🌍éC");
    client.dispose();
    await assert.rejects(client.analyze("rapid", 3), /disposed/);
    const broken = new sdk.TextabanaKernelClient({ addEventListener() {}, removeEventListener() {}, postMessage() { throw new Error("broken transport"); } });
    await assert.rejects(broken.open("x", "x.md", ""), /broken transport/); assert.equal(broken.pending.size, 0); broken.dispose();
    const silent = new sdk.TextabanaKernelClient({ addEventListener() {}, removeEventListener() {}, postMessage() {} });
    const pending = silent.command("analyze", { requestId: "same" }).catch((error) => error);
    await assert.rejects(silent.command("analyze", { requestId: "same" }), /Duplicate/);
    silent.dispose(); assert.match((await pending).message, /disposed/);
  } finally { client.dispose(); await transport.close(); await cleanup(); }
});

test("Ed25519 report verification requires the caller's trusted key and exact report bytes", async () => {
  const keys = generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const report = { schema: "textabana.external-report/v1", status: "passed", claim: { canonicalRuntime: false }, checks: [] };
  const envelope = await signReport(report, privateKey);
  assert.equal((await verifyReport(envelope, publicKey)).authentic, true);
  await assert.rejects(verifyReport({ ...envelope, report: { ...report, claim: { canonicalRuntime: true } } }, publicKey), /mismatch/);
  const stranger = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  await assert.rejects(verifyReport(envelope, stranger), /mismatch/);
});

test("JSONL transport correlates a crashed worker to every pending request and exits unsuccessfully", () => {
  const input = [
    { type: "open", requestId: "open-crash", document: { documentId: "crash", path: "crash.md", source: '>>>>! include "./crash.js"\n>>>> crash\ntext\n<<<< crash' } },
    { type: "run", requestId: "run-crash", documentId: "crash", documentRevision: 1, runId: 77, modules: [{ path: "crash.js", content: 'define({ crash: { transform() { process.exit(17); } } });' }] },
  ].map((item) => JSON.stringify(item)).join("\n") + "\n";
  const processResult = spawnSync(process.execPath, ["cli/textabana.mjs", "serve"], { input, encoding: "utf8", timeout: 10000 });
  assert.equal(processResult.status, 1, processResult.stderr);
  const replies = processResult.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const failure = replies.find((item) => item.requestId === "run-crash");
  assert.equal(failure?.ok, false); assert.equal(failure?.type, "transport-error");
});

test("local registry verifies module and adapter bytes and rejects manifest drift", async () => {
  const result = await verifyRegistry(new URL("../PACKAGE_REGISTRY.json", import.meta.url));
  assert.equal(result.status, "passed"); assert.equal(result.packages.length, 2);
  const registry = JSON.parse(await readFile(new URL("../PACKAGE_REGISTRY.json", import.meta.url), "utf8"));
  registry.packages[0].manifest.entrypoint = "bad.txt";
  const directory = await mkdtemp(join(tmpdir(), "textabana-registry-"));
  try { const path = join(directory, "registry.json"); await writeFile(path, JSON.stringify(registry)); await assert.rejects(verifyRegistry(path), /Manifest mismatch/); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
