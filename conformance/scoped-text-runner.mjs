import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { admitScopedText } from "./scoped-admission.mjs";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient } from "./host-runner.mjs";

export const SCOPED_TEXT_PROFILE = "textabana.scoped-text/v1";
export const scopedTextSuiteUrl = new URL("./profiles/scoped-text-v1.json", import.meta.url);
export const scopedTextManifestUrl = new URL("./profiles/scoped-text-v1.manifest.json", import.meta.url);
const moduleUrl = new URL("../reference/text-core-module.js", import.meta.url);
const pythonUrl = new URL("../reference/scoped_text.py", import.meta.url);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rejected = (error) => ({ ok: false, output: "", error, committed: false, committedStages: 0, stages: [] });
export async function runJavaScriptScopedText(source) {
  const admission = admitScopedText(source);
  if (admission) return rejected(admission);
  const transport = new NodeKernelTransport(); const client = rawClient(transport);
  try {
    const response = await client.command(undefined, {
      documentId: "scoped-text-fixture", documentPath: "fixture.md", runId: 1,
      documentSource: `>>>>! include "./text-core.js"\n${source}`,
      modules: [{ path: "text-core.js", content: await readFile(moduleUrl, "utf8") }],
      options: { runtimeLimits: { maxParallelism: 1, maxStageResolutions: 128, maxRenderBytes: 262144 } },
    });
    if (!response.ok) {
      const diagnostic = response.diagnostics.find((item) => item.severity === "error");
      if (!diagnostic) throw new Error("Kernel failure without a diagnostic.");
      if (response.resultEnvelope.run.committed || response.output !== "" || Object.keys(response.resultEnvelope.channelSnapshots).length || response.resultEnvelope.anchors.length) throw new Error("Nonatomic kernel failure.");
      if (/LIMIT|BUDGET/.test(diagnostic.code) || diagnostic.message.includes("text-core render limit")) return rejected("limit");
      if (diagnostic.code !== "TBA-RUN-LAB") throw new Error(`Unexpected kernel failure: ${diagnostic.code}`);
      return rejected("stage");
    }
    const stages = response.executionTrace.filter((step) => step.status === "succeeded" && step.functionInvoked)
      .map((step) => ({ function: step.function, args: step.args, modality: step.modality, scopeId: step.scopeId }));
    return { ok: true, output: response.output, error: null, committed: response.resultEnvelope.run.committed, committedStages: stages.length, stages };
  } finally { client.dispose(); await transport.close(); }
}

export async function runScopedTextSuite({ suiteUrl = scopedTextSuiteUrl } = {}) {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8"));
  const manifest = parseStrictJson(await readFile(scopedTextManifestUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite);
  const specificationDigest = digest(await readFile(new URL("../SCOPED_TEXT_PROFILE.md", import.meta.url)));
  const baseSpecificationDigest = digest(await readFile(new URL("../TEXT_CORE_PROFILE.md", import.meta.url)));
  if (manifest.baseSpecificationDigest !== baseSpecificationDigest) throw new Error("Scoped text base specification mismatch.");
  if (manifest.schema !== "textabana.scoped-text-manifest/v1" || manifest.profile !== SCOPED_TEXT_PROFILE || manifest.version !== "1.0.0" || manifest.suiteDigest !== suiteDigest || manifest.specificationDigest !== specificationDigest || manifest.caseCount !== suite.cases?.length || suite.schema !== "textabana.scoped-text-suite/v1" || suite.profile !== SCOPED_TEXT_PROFILE || suite.version !== "1.0.0" || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length) throw new Error("Scoped text profile manifest mismatch.");
  const paths = ["reference/scoped_text.py", "reference/text_core.py", "reference/text-core-module.js", "conformance/scoped-text-runner.mjs", "conformance/scoped-admission.mjs", "runtime/parser.js", "runtime/generated/textabana-parser.js", "runtime/canonical-json.js", "public/runtime-worker.js", "sdk/node/transport.mjs", "sdk/node/worker-bridge.mjs", "conformance/host-runner.mjs", "package-lock.json"];
  const sourceDigests = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, digest(await readFile(new URL(`../${path}`, import.meta.url)))])));
  const implementations = await sourceDigests();
  const python = await runPythonScopedText(suite.cases.map((fixture) => fixture.source));
  const checks = [];
  for (const [index, fixture] of suite.cases.entries()) {
    const javascript = await runJavaScriptScopedText(fixture.source);
    const matches = canonicalize(javascript) === canonicalize(fixture.expect) && canonicalize(python[index]) === canonicalize(fixture.expect);
    checks.push({ caseId: fixture.id, status: matches ? "passed" : "failed", sourceDigest: digest(Buffer.from(fixture.source)), expected: fixture.expect, javascript, python: python[index] });
  }
  if (canonicalize(implementations) !== canonicalize(await sourceDigests())) throw new Error("Implementation changed during scoped text suite.");
  const passed = checks.every((check) => check.status === "passed");
  return { schema: "textabana.external-report/v1", profile: SCOPED_TEXT_PROFILE, suiteVersion: suite.version, suiteDigest, specificationDigest, baseSpecificationDigest, manifestDigest: await canonicalDigest(manifest),
    implementations, runtimes: ["javascript-worker", "python-standalone"], checks, status: passed ? "passed" : "failed",
    claim: { scope: SCOPED_TEXT_PROFILE, claimable: passed, independentImplementations: passed, canonicalRuntime: false, semanticArtifactEquivalence: false, fullProfileConformance: false } };
}

export async function runPythonScopedText(sources, { executable = "python3", env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [fileURLToPath(pythonUrl), "batch"], { env, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    let stdout = "", stderr = "", settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error("Python reference timed out.")); }, 30000);
    child.on("error", (error) => finish(error));
    child.stdin.on("error", (error) => finish(error));
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 16 * 1024 * 1024) { child.kill(); finish(new Error("Oversized Python response.")); } });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    child.on("close", (code) => {
      if (code !== 0) return finish(new Error(`Python reference exited ${code}: ${stderr}`));
      try {
        const response = parseStrictJson(stdout);
        if (response.profile !== SCOPED_TEXT_PROFILE || !Array.isArray(response.results) || response.results.length !== sources.length) throw new Error("Invalid Python reference response.");
        finish(null, response.results);
      } catch (error) { finish(error); }
    });
    child.stdin.end(JSON.stringify({ sources }));
  });
}
