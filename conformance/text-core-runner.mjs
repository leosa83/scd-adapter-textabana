import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseDocument } from "../runtime/parser.js";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient } from "./host-runner.mjs";

export const TEXT_CORE_PROFILE = "textabana.text-core/v1";
export const textCoreSuiteUrl = new URL("./profiles/text-core-v1.json", import.meta.url);
export const textCoreManifestUrl = new URL("./profiles/text-core-v1.manifest.json", import.meta.url);
const moduleUrl = new URL("../reference/text-core-module.js", import.meta.url);
const pythonUrl = new URL("../reference/text_core.py", import.meta.url);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rejected = (error) => ({ ok: false, output: "", error, committed: false, committedStages: 0 });
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Admission uses the existing JS compiler, never the Python parser or its result.
function admit(source) {
  if (typeof source !== "string" || !source.isWellFormed() || /[\r\uFEFF]/.test(source)) return "unsupported";
  if (Buffer.byteLength(source) > 65536) return "limit";
  const parsed = parseDocument(source);
  if (parsed.ir.directives.length) return "unsupported";
  const points = Array.from(source);
  for (const line of parsed.ir.sourceLines) {
    if (line.kind.startsWith("fence-") || line.detail?.literal) continue;
    if (/^[ \t]*\\(?:>>>>|<<<<)/.test(line.text)) continue;
    if (/^[ \t]*(?:>>>>[!+]|<<<<\+)/.test(line.text) || /^[ \t]+\|/.test(line.text)) return "unsupported";
    if (/^[ \t]*>>>>/.test(line.text) && /[^\x20-\x7e\t]/.test(line.text.replace(/"(?:[^"\\]|\\[\s\S])*"/g, '""'))) return "unsupported";
    if (!/^[ \t]*>>>>/.test(line.text) && line.text.includes("{")) return "unsupported";
    if (/^[ \t]*<<<<[ \t]*[A-Za-z_][\w.-]*[ \t]*$/.test(line.text) && /[.-]/.test(line.text)) return "unsupported";
    if (/^[ \t]*<<<</.test(line.text) && !/^[ \t]*<<<<[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*$/.test(line.text)) return "syntax";
  }
  let count = 0;
  for (const block of parsed.ir.blocks) {
    let depth = 1, parent = block.parentBlockId;
    while (parent) { depth++; parent = parsed.ir.blocks.find((item) => item.blockId === parent)?.parentBlockId; }
    count += block.pipeline.length;
    if (depth > 32 || count > 128) return "limit";
    for (const stage of block.pipeline) {
      if (!namePattern.test(stage.name)) return "unsupported";
      for (const argument of stage.arguments) {
        const raw = points.slice(argument.sourceSpan.start, argument.sourceSpan.end).join("");
        if (!namePattern.test(argument.name) || !new RegExp(`^${argument.name}="`).test(raw)) return "unsupported";
        try {
          const value = JSON.parse(raw.slice(argument.name.length + 1));
          if (typeof value !== "string" || !value.isWellFormed()) return "unsupported";
        }
        catch { return "syntax"; }
      }
    }
  }
  return parsed.executable ? null : "syntax";
}

export async function runJavaScriptTextCore(source) {
  const admission = admit(source);
  if (admission) return rejected(admission);
  const transport = new NodeKernelTransport(); const client = rawClient(transport);
  try {
    const response = await client.command(undefined, {
      documentId: "text-core-fixture", documentPath: "fixture.md", runId: 1,
      documentSource: `>>>>! include "./text-core.js"\n${source}`,
      modules: [{ path: "text-core.js", content: await readFile(moduleUrl, "utf8") }],
      options: { runtimeLimits: { maxParallelism: 1, maxStageResolutions: 128, maxRenderBytes: 262144 } },
    });
    if (!response.ok) {
      const diagnostic = response.diagnostics.find((item) => item.severity === "error");
      if (!diagnostic) throw new Error("Kernel failure without a diagnostic.");
      if (response.resultEnvelope.run.committed || response.output !== "" || Object.keys(response.resultEnvelope.channelSnapshots).length || response.resultEnvelope.anchors.length) throw new Error("Nonatomic kernel failure.");
      // A stage's thrown code is wrapped by this kernel; the fixed adapter message is also checked.
      if (/LIMIT|BUDGET/.test(diagnostic.code) || diagnostic.message.includes("text-core render limit")) return rejected("limit");
      if (diagnostic.code !== "TBA-RUN-LAB") throw new Error(`Unexpected kernel failure: ${diagnostic.code}`);
      return rejected("stage");
    }
    return { ok: true, output: response.output, error: null, committed: response.resultEnvelope.run.committed,
      committedStages: response.executionTrace.filter((step) => step.status === "succeeded" && step.functionInvoked).length };
  } finally { client.dispose(); await transport.close(); }
}

export async function runPythonTextCore(sources, { executable = "python3", env = process.env } = {}) {
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
        if (response.profile !== TEXT_CORE_PROFILE || !Array.isArray(response.results) || response.results.length !== sources.length) throw new Error("Invalid Python reference response.");
        finish(null, response.results);
      } catch (error) { finish(error); }
    });
    child.stdin.end(JSON.stringify({ sources }));
  });
}

export async function runTextCoreSuite({ suiteUrl = textCoreSuiteUrl } = {}) {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8"));
  const manifest = parseStrictJson(await readFile(textCoreManifestUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite);
  const specificationDigest = digest(await readFile(new URL("../TEXT_CORE_PROFILE.md", import.meta.url)));
  if (manifest.schema !== "textabana.text-core-manifest/v1" || manifest.profile !== TEXT_CORE_PROFILE || manifest.version !== "1.0.0" || manifest.suiteDigest !== suiteDigest || manifest.specificationDigest !== specificationDigest || manifest.caseCount !== suite.cases?.length || suite.schema !== "textabana.text-core-suite/v1" || suite.profile !== TEXT_CORE_PROFILE || suite.version !== "1.0.0" || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length) throw new Error("Text core profile manifest mismatch.");
  const paths = ["reference/text_core.py", "reference/text-core-module.js", "conformance/text-core-runner.mjs", "runtime/parser.js", "runtime/generated/textabana-parser.js", "runtime/canonical-json.js", "public/runtime-worker.js", "sdk/node/transport.mjs", "sdk/node/worker-bridge.mjs", "conformance/host-runner.mjs", "package-lock.json"];
  const sourceDigests = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, digest(await readFile(new URL(`../${path}`, import.meta.url)))])));
  const implementations = await sourceDigests();
  const python = await runPythonTextCore(suite.cases.map((fixture) => fixture.source));
  const checks = [];
  for (const [index, fixture] of suite.cases.entries()) {
    const javascript = await runJavaScriptTextCore(fixture.source);
    const matches = canonicalize(javascript) === canonicalize(fixture.expect) && canonicalize(python[index]) === canonicalize(fixture.expect);
    checks.push({ caseId: fixture.id, status: matches ? "passed" : "failed", sourceDigest: digest(Buffer.from(fixture.source)), expected: fixture.expect, javascript, python: python[index] });
  }
  if (canonicalize(implementations) !== canonicalize(await sourceDigests())) throw new Error("Implementation changed during text core suite.");
  const passed = checks.every((check) => check.status === "passed");
  return { schema: "textabana.external-report/v1", profile: TEXT_CORE_PROFILE, suiteVersion: suite.version, suiteDigest, specificationDigest, manifestDigest: await canonicalDigest(manifest),
    implementations, runtimes: ["javascript-worker", "python-standalone"], checks, status: passed ? "passed" : "failed",
    claim: { scope: TEXT_CORE_PROFILE, claimable: passed, independentImplementations: passed, canonicalRuntime: false, semanticArtifactEquivalence: false, fullProfileConformance: false } };
}
