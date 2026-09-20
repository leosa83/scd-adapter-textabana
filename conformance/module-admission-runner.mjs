import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { runModuleGateCase } from "./module-gate-runner.mjs";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";

export const MODULE_ADMISSION_PROFILE = "textabana.module-admission/lab-v1";
export const moduleAdmissionSuiteUrl = new URL("./profiles/module-admission-v1.json", import.meta.url);
const manifestUrl = new URL("./profiles/module-admission-v1.manifest.json", import.meta.url);
const pythonUrl = new URL("../reference/module_admission.py", import.meta.url);
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rejectionCodes = new Set(["LOCK", "MANIFEST", "IDENTITY", "DUPLICATE", "ENTRYPOINT", "DIGEST", "CAPABILITIES", "GRANT", "FUNCTION-CONTRACT"].map((code) => `TBA-MODULE-${code}-LAB`));

// Observations from the pinned trusted probes, never arbitrary module code.
export function projectModuleAdmission(observed) {
  assert.ok(observed.entrypoints === 0 || observed.entrypoints === 1, "Unexpected admission probe count");
  if (observed.entrypoints === 1) return { admitted: true, error: null };
  assert.equal(observed.ok, false, "A successful control must reach its entrypoint");
  assert.equal(observed.committed, false);
  assert.equal(observed.invocations, 0, "Rejected admission must not invoke transforms");
  assert.ok(rejectionCodes.has(observed.error), "Unrelated failure cannot prove package rejection");
  return { admitted: false, error: observed.error };
}

export async function runModuleAdmissionSuite({ suiteUrl = moduleAdmissionSuiteUrl } = {}) {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8")), manifest = parseStrictJson(await readFile(manifestUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite), specificationDigest = digest(await readFile(new URL("../MODULE_ADMISSION_PROFILE.md", import.meta.url)));
  if (manifest.schema !== "textabana.module-admission-manifest/lab-v1" || manifest.profile !== MODULE_ADMISSION_PROFILE || manifest.version !== "1.0.0" || manifest.suiteDigest !== suiteDigest || manifest.specificationDigest !== specificationDigest || manifest.caseCount !== suite.cases?.length || suite.schema !== "textabana.module-admission-suite/lab-v1" || suite.profile !== MODULE_ADMISSION_PROFILE || suite.version !== "1.0.0" || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length) throw new Error("Module admission profile manifest mismatch.");
  const paths = ["reference/module_admission.py", "conformance/module-admission-runner.mjs", "conformance/module-gate-runner.mjs", "runtime/worker-entry.js", "runtime/semantic-identity.js", "runtime/parser.js", "runtime/generated/textabana-parser.js", "runtime/execution-graph.js", "runtime/canonical-json.js", "public/runtime-worker.js", "package-lock.json"];
  const sourceDigests = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, digest(await readFile(new URL(`../${path}`, import.meta.url)))])));
  const implementations = await sourceDigests(), workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");
  const python = await runPythonModuleAdmission(suite.cases.map((fixture) => fixture.input)), checks = [];
  for (const [index, fixture] of suite.cases.entries()) {
    const observed = await runModuleGateCase(fixture.input, workerSource);
    const javascript = projectModuleAdmission(observed);
    const matches = canonicalize(javascript) === canonicalize(fixture.expect) && canonicalize(python[index]) === canonicalize(fixture.expect) && canonicalize(observed) === canonicalize(fixture.workerExpect);
    checks.push({ caseId: fixture.id, status: matches ? "passed" : "failed", inputDigest: await canonicalDigest(fixture.input), expected: fixture.expect, javascript, python: python[index], worker: { expected: fixture.workerExpect, observed } });
  }
  assert.equal(canonicalize(implementations), canonicalize(await sourceDigests()), "Implementation changed during module admission suite");
  const passed = checks.every((check) => check.status === "passed");
  return { schema: "textabana.external-report/v1", profile: MODULE_ADMISSION_PROFILE, suiteVersion: suite.version, suiteDigest, specificationDigest, manifestDigest: await canonicalDigest(manifest), implementations, runtimes: ["javascript-worker-vm", "python-standalone"], environment: { node: process.version }, checks, status: passed ? "passed" : "failed", claim: { scope: MODULE_ADMISSION_PROFILE, claimable: passed, independentImplementations: passed, independentModuleExecution: false, canonicalRuntime: false, semanticArtifactEquivalence: false, fullProfileConformance: false, javascriptSandbox: false } };
}

export async function runPythonModuleAdmission(inputs, { executable = "python3", env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["-I", fileURLToPath(pythonUrl), "batch"], { env, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    let stdout = "", stderr = "", settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error("Python package reference timed out.")); }, 30000);
    child.on("error", (error) => finish(error)); child.stdin.on("error", (error) => { child.kill(); finish(error); });
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 4 * 1024 * 1024) { child.kill(); finish(new Error("Oversized Python response.")); } });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    child.on("close", (code) => {
      if (code !== 0) return finish(new Error(`Python package reference exited ${code}: ${stderr}`));
      try {
        const response = parseStrictJson(stdout);
        if (response.profile !== MODULE_ADMISSION_PROFILE || !Array.isArray(response.results) || response.results.length !== inputs.length) throw new Error("Invalid Python package reference response.");
        finish(null, response.results);
      } catch (error) { finish(error); }
    });
    child.stdin.end(JSON.stringify({ inputs }));
  });
}
