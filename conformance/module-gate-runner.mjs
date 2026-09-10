import { readFile } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import vm from "node:vm";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";

export const MODULE_GATE_PROFILE = "textabana.module-gate/lab-v1";
export const moduleGateSuiteUrl = new URL("./profiles/module-gate-v1.json", import.meta.url);
const manifestUrl = new URL("./profiles/module-gate-v1.manifest.json", import.meta.url);
const workerUrl = new URL("../public/runtime-worker.js", import.meta.url);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function projectModuleGateResult(response, entrypoints) {
  assert.ok(Number.isInteger(entrypoints) && entrypoints >= 0);
  const envelope = response.resultEnvelope;
  assert.equal(envelope.render.data, response.output);
  assert.equal(envelope.run.committed, response.ok);
  if (!response.ok) {
    assert.equal(response.output, "", "Nonatomic module failure: output");
    for (const value of [response.channels, response.channelDescriptors, envelope.channelSnapshots]) assert.equal(Object.keys(value).length, 0, "Nonatomic module failure: channels");
    for (const value of [response.anchors, response.sourceMaps, envelope.anchors, envelope.sourceMaps, envelope.provenance.activities]) assert.equal(value.length, 0, "Nonatomic module failure: references");
  }
  const error = response.diagnostics.find((item) => item.severity === "error");
  if (!response.ok) assert.ok(error?.code, "Failure must have an explicit diagnostic");
  else assert.equal(error, undefined);
  return { ok: response.ok, output: response.output, error: error?.code ?? null, committed: envelope.run.committed, entrypoints,
    invocations: response.executionTrace.filter((step) => step.functionInvoked).length };
}

// Only the manifest-pinned, trusted fixtures are executed by the CLI. A VM is not a sandbox.
export async function runModuleGateCase(input, workerSource = undefined) {
  const messages = [];
  const context = vm.createContext({ console, crypto: webcrypto, performance, TextEncoder, TextDecoder, structuredClone, Uint8Array,
    btoa, atob, setTimeout, clearTimeout, __moduleGateEntries: 0,
    self: { postMessage(message) { messages.push(message); } },
  });
  vm.runInContext(workerSource ?? await readFile(workerUrl, "utf8"), context, { timeout: 5000 });
  await context.self.onmessage({ data: { ...structuredClone(input), runId: 1 } });
  assert.equal(messages.length, 1, "Expected one terminal run response");
  return projectModuleGateResult(JSON.parse(JSON.stringify(messages[0])), context.__moduleGateEntries);
}

export async function runModuleGateSuite({ suiteUrl = moduleGateSuiteUrl } = {}) {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8")), manifest = parseStrictJson(await readFile(manifestUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite), specificationDigest = digest(await readFile(new URL("../MODULE_GATE_PROFILE.md", import.meta.url)));
  if (manifest.schema !== "textabana.module-gate-manifest/lab-v1" || manifest.profile !== MODULE_GATE_PROFILE || manifest.version !== "1.0.0" || manifest.suiteDigest !== suiteDigest || manifest.specificationDigest !== specificationDigest || manifest.caseCount !== suite.cases?.length || suite.schema !== "textabana.module-gate-suite/lab-v1" || suite.profile !== MODULE_GATE_PROFILE || suite.version !== "1.0.0" || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length) throw new Error("Module gate profile manifest mismatch.");
  const paths = ["conformance/module-gate-runner.mjs", "runtime/worker-entry.js", "runtime/parser.js", "runtime/generated/textabana-parser.js", "runtime/execution-graph.js", "runtime/canonical-json.js", "public/runtime-worker.js", "package-lock.json"];
  const sourceDigests = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, digest(await readFile(new URL(`../${path}`, import.meta.url)))])));
  const implementations = await sourceDigests(), workerSource = await readFile(workerUrl, "utf8"), checks = [];
  for (const fixture of suite.cases) {
    const actual = await runModuleGateCase(fixture.input, workerSource);
    checks.push({ caseId: fixture.id, inputDigest: await canonicalDigest(fixture.input), expected: fixture.expect, actual,
      status: canonicalize(actual) === canonicalize(fixture.expect) ? "passed" : "failed" });
  }
  assert.equal(canonicalize(implementations), canonicalize(await sourceDigests()), "Implementation changed during module gate suite");
  const passed = checks.every((check) => check.status === "passed");
  return { schema: "textabana.external-report/v1", profile: MODULE_GATE_PROFILE, suiteVersion: suite.version, suiteDigest, specificationDigest,
    manifestDigest: await canonicalDigest(manifest), implementations, runtimes: ["javascript-worker-vm"], environment: { node: process.version }, checks, status: passed ? "passed" : "failed",
    claim: { scope: MODULE_GATE_PROFILE, claimable: passed, independentImplementations: false, canonicalRuntime: false, semanticArtifactEquivalence: false, fullProfileConformance: false, javascriptSandbox: false } };
}
