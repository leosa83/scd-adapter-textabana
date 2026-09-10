import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { admitScopedText } from "./scoped-admission.mjs";
import { CHANNEL_CORE_INCLUDE, runChannelWorker, projectChannelResponse } from "./channel-core-runner.mjs";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";

export const SOURCE_MAP_CORE_PROFILE = "textabana.source-map-core/v1";
export const sourceMapCoreSuiteUrl = new URL("./profiles/source-map-core-v1.json", import.meta.url);
export const sourceMapCoreManifestUrl = new URL("./profiles/source-map-core-v1.manifest.json", import.meta.url);
const pythonUrl = new URL("../reference/source_map_core.py", import.meta.url);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rejected = (error) => ({ ok: false, output: "", error, committed: false, committedStages: 0, stages: [], events: [], snapshots: {}, anchors: [], sourceMaps: [] });

export function projectSourceMapResponse(response, source) {
  const base = projectChannelResponse(response);
  if (!base.ok) return { ...base, anchors: [], sourceMaps: [] };
  const envelope = response.resultEnvelope;
  assert.deepEqual(response.anchors, envelope.anchors);
  assert.deepEqual(response.sourceMaps, envelope.sourceMaps);
  const authoredLines = source.split("\n"), sourcePoints = Array.from(source);
  const lineCount = authoredLines.length, prefixLines = CHANNEL_CORE_INCLUDE.split("\n").length - 1, prefixPoints = Array.from(CHANNEL_CORE_INCLUDE).length;
  const line = (value) => {
    assert.ok(Number.isInteger(value) && value > prefixLines && value <= lineCount + prefixLines, "Source line outside authored document");
    return value - prefixLines;
  };
  const range = (value) => {
    assert.equal(value.path, "fixture.md");
    const startLine = line(value.startLine), endLine = line(value.endLine);
    assert.ok(startLine <= endLine); return { startLine, endLine };
  };
  const invocations = response.executionTrace.filter((step) => step.status === "succeeded" && step.functionInvoked);
  const invocationIndex = new Map(invocations.map((step, index) => [step.invocationId, index + 1]));
  const anchorIndex = new Map(envelope.anchors.map((anchor, index) => [anchor.anchorId, index + 1]));
  assert.equal(anchorIndex.size, envelope.anchors.length, "Anchor IDs must be unique");
  const rawEvents = Object.values(response.channels).flat().sort((a, b) => a.sequence - b.sequence);
  const firstUse = [...new Set(rawEvents.map((event) => event.target.anchorRef))];
  assert.deepEqual(firstUse, [...anchorIndex.keys()], "Anchor order must follow first creation");
  const eventIndex = new Map(rawEvents.map((event) => [event.eventId, event.sequence]));
  const activityIndex = new Map(invocations.map((step, index) => [step.activityId, index + 1]));
  const stages = base.stages.map((stage, index) => ({ ...stage, declarationLine: line(invocations[index].line), source: range(invocations[index].source) }));
  const events = base.events.map((event, index) => {
    const raw = rawEvents[index];
    assert.equal(raw.line, raw.target.line); assert.equal(raw.source.mapping, "derived");
    assert.equal(raw.origin.stageLine, invocations[event.stage - 1].line);
    assert.deepEqual(range(raw.source), stages[event.stage - 1].source);
    assert.equal(raw.target.line, raw.source.startLine);
    return { ...event, source: { ...range(raw.source), mapping: raw.source.mapping }, target: { ...event.target, line: line(raw.target.line), anchor: anchorIndex.get(raw.target.anchorRef) } };
  });
  const anchors = envelope.anchors.map((anchor, index) => {
    assert.equal(anchor.target.resourceId, "channel-core-fixture"); assert.equal(anchor.target.view, "source"); assert.equal(anchor.target.cellId, null);
    assert.equal(anchor.selectors.length, 2);
    const [position, quote] = anchor.selectors;
    assert.equal(position.type, "TextPositionSelector"); assert.equal(position.unit, "unicode-code-point");
    assert.equal(quote.type, "TextQuoteSelector");
    for (const value of [quote.exact, quote.prefix, quote.suffix]) assert.ok(typeof value === "string" && value.isWellFormed(), "Anchor quotes must preserve Unicode scalar values");
    const start = position.start - prefixPoints, end = position.end - prefixPoints;
    assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= sourcePoints.length, "Anchor range outside authored document");
    const lastEvent = rawEvents.findLast((event) => event.target.anchorRef === anchor.anchorId);
    assert.equal(anchor.origin.invocationId, lastEvent.origin.invocationId, "Anchor must retain its last emitter");
    assert.deepEqual(anchor.projections, { row: lastEvent.target.row, rowId: lastEvent.target.rowId, line: lastEvent.target.line });
    const targetLine = line(anchor.projections.line);
    const startOfLine = Array.from(authoredLines.slice(0, targetLine - 1).join("\n") + (targetLine > 1 ? "\n" : "")).length;
    assert.equal(start, startOfLine); assert.equal(end, startOfLine + Array.from(authoredLines[targetLine - 1]).length);
    assert.equal(quote.exact, sourcePoints.slice(start, end).join(""));
    assert.equal(quote.prefix, targetLine > 1 ? Array.from(authoredLines[targetLine - 2]).slice(-48).join("") : "");
    assert.equal(quote.suffix, targetLine < lineCount ? Array.from(authoredLines[targetLine]).slice(0, 48).join("") : "");
    const stage = invocationIndex.get(anchor.origin.invocationId); assert.notEqual(stage, undefined);
    assert.equal(anchor.origin.stageId, invocations[stage - 1].stageId); assert.equal(anchor.origin.function, stages[stage - 1].function); assert.equal(anchor.origin.module, "channel-core.js");
    return { anchor: index + 1, position: { start, end, unit: position.unit }, quote: { exact: quote.exact, prefix: quote.prefix, suffix: quote.suffix }, row: anchor.projections.row, rowId: anchor.projections.rowId, line: targetLine, stage, function: anchor.origin.function };
  });
  const sourceMaps = envelope.sourceMaps.map((mapping) => {
    const event = eventIndex.get(mapping.outputRef), stage = activityIndex.get(mapping.generatingActivity), anchor = anchorIndex.get(mapping.inputAnchorRefs[0]);
    assert.notEqual(event, undefined); assert.notEqual(stage, undefined); assert.notEqual(anchor, undefined);
    assert.equal(mapping.mappingId, `mapping:${mapping.outputRef}`);
    return { event, anchor, mapping: mapping.mapping, stage };
  });
  return { ...base, stages, events, anchors, sourceMaps };
}

export async function runJavaScriptSourceMapCore(source) {
  const admission = admitScopedText(source);
  if (admission) return rejected(admission);
  return projectSourceMapResponse(await runChannelWorker(source), source);
}

export async function runSourceMapCoreSuite({ suiteUrl = sourceMapCoreSuiteUrl } = {}) {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8"));
  const manifest = parseStrictJson(await readFile(sourceMapCoreManifestUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite);
  const specificationDigest = digest(await readFile(new URL("../SOURCE_MAP_CORE_PROFILE.md", import.meta.url)));
  const baseSpecificationDigests = Object.fromEntries(await Promise.all(["TEXT_CORE_PROFILE.md", "SCOPED_TEXT_PROFILE.md", "CHANNEL_CORE_PROFILE.md"].map(async (file) => [file, digest(await readFile(new URL(`../${file}`, import.meta.url)))])));
  if (canonicalize(manifest.baseSpecificationDigests) !== canonicalize(baseSpecificationDigests)) throw new Error("Source map core base specification mismatch.");
  if (manifest.schema !== "textabana.source-map-core-manifest/v1" || manifest.profile !== SOURCE_MAP_CORE_PROFILE || manifest.version !== "1.0.0" || manifest.suiteDigest !== suiteDigest || manifest.specificationDigest !== specificationDigest || manifest.caseCount !== suite.cases?.length || suite.schema !== "textabana.source-map-core-suite/v1" || suite.profile !== SOURCE_MAP_CORE_PROFILE || suite.version !== "1.0.0" || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length) throw new Error("Source map core profile manifest mismatch.");
  const paths = ["reference/source_map_core.py", "conformance/source-map-core-runner.mjs", "runtime/execution-graph.js", "runtime/worker-entry.js", "reference/channel_core.py", "reference/scoped_text.py", "reference/text_core.py", "reference/text-core-module.js", "reference/channel-core-module.js", "conformance/channel-core-runner.mjs", "conformance/scoped-admission.mjs", "runtime/parser.js", "runtime/generated/textabana-parser.js", "runtime/canonical-json.js", "public/runtime-worker.js", "sdk/node/transport.mjs", "sdk/node/worker-bridge.mjs", "conformance/host-runner.mjs", "package-lock.json"];
  const sourceDigests = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, digest(await readFile(new URL(`../${path}`, import.meta.url)))])));
  const implementations = await sourceDigests(), python = await runPythonSourceMapCore(suite.cases.map((fixture) => fixture.source)), checks = [];
  for (const [index, fixture] of suite.cases.entries()) {
    const javascript = await runJavaScriptSourceMapCore(fixture.source);
    const matches = canonicalize(javascript) === canonicalize(fixture.expect) && canonicalize(python[index]) === canonicalize(fixture.expect);
    checks.push({ caseId: fixture.id, status: matches ? "passed" : "failed", sourceDigest: digest(Buffer.from(fixture.source)), expected: fixture.expect, javascript, python: python[index] });
  }
  if (canonicalize(implementations) !== canonicalize(await sourceDigests())) throw new Error("Implementation changed during source map core suite.");
  const passed = checks.every((check) => check.status === "passed");
  return { schema: "textabana.external-report/v1", profile: SOURCE_MAP_CORE_PROFILE, suiteVersion: suite.version, suiteDigest, specificationDigest, baseSpecificationDigests, manifestDigest: await canonicalDigest(manifest), implementations, runtimes: ["javascript-worker", "python-standalone"], checks, status: passed ? "passed" : "failed", claim: { scope: SOURCE_MAP_CORE_PROFILE, claimable: passed, independentImplementations: passed, canonicalRuntime: false, semanticArtifactEquivalence: false, fullProfileConformance: false } };
}

export async function runPythonSourceMapCore(sources, { executable = "python3", env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [fileURLToPath(pythonUrl), "batch"], { env, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    let stdout = "", stderr = "", settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error("Python reference timed out.")); }, 30000);
    child.on("error", (error) => finish(error)); child.stdin.on("error", (error) => finish(error));
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 16 * 1024 * 1024) { child.kill(); finish(new Error("Oversized Python response.")); } });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    child.on("close", (code) => {
      if (code !== 0) return finish(new Error(`Python reference exited ${code}: ${stderr}`));
      try {
        const response = parseStrictJson(stdout);
        if (response.profile !== SOURCE_MAP_CORE_PROFILE || !Array.isArray(response.results) || response.results.length !== sources.length) throw new Error("Invalid Python reference response.");
        finish(null, response.results);
      } catch (error) { finish(error); }
    });
    child.stdin.end(JSON.stringify({ sources }));
  });
}
