import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runModuleAdmissionSuite, runPythonModuleAdmission, moduleAdmissionSuiteUrl, projectModuleAdmission } from "../conformance/module-admission-runner.mjs";

test("module admission: both implementations match all pinned preflight decisions", async () => {
  const report = await runModuleAdmissionSuite();
  assert.equal(report.status, "passed"); assert.equal(report.checks.length, 72);
  assert.equal(report.claim.independentImplementations, true);
  for (const key of ["independentModuleExecution", "canonicalRuntime", "semanticArtifactEquivalence", "fullProfileConformance", "javascriptSandbox"]) assert.equal(report.claim[key], false);
  for (const id of ["loaded-state-drift", "entrypoint-throws", "ecmascript-nel-name"]) {
    const check = report.checks.find((item) => item.caseId === id);
    assert.equal(check.javascript.admitted, true); assert.equal(check.worker.observed.ok, false);
  }
  const later = report.checks.find((item) => item.caseId === "later-invalid-before-first-throw");
  assert.equal(later.javascript.admitted, false); assert.equal(later.worker.observed.entrypoints, 0);
});

test("module admission: one copied Python file handles the entire corpus without Node or repo imports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "module-admission-isolated-"));
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  try {
    const file = join(directory, "module_admission.py");
    await copyFile(new URL("../reference/module_admission.py", import.meta.url), file);
    const suite = JSON.parse(await readFile(moduleAdmissionSuiteUrl, "utf8"));
    const stdout = execFileSync(python, ["-I", file, "batch"], { cwd: directory, env: { ...process.env, PATH: "", PYTHONPATH: "", PYTHONSTARTUP: "" }, encoding: "utf8", input: JSON.stringify({ inputs: suite.cases.map((item) => item.input) }) });
    assert.deepEqual(JSON.parse(stdout).results, suite.cases.map((item) => item.expect));
    // Out-of-profile legacy inputs must not be misreported as package decisions.
    assert.throws(() => execFileSync(python, ["-I", file, "batch"], { encoding: "utf8", input: JSON.stringify({ inputs: [{ modules: [], options: { moduleLock: null } }] }), stdio: ["pipe", "pipe", "pipe"] }), (error) => error.status === 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("module admission: missing Python, changed decision and changed probe expectation fail closed", async () => {
  await assert.rejects(runPythonModuleAdmission([], { executable: "/nonexistent/module-admission-python" }), /ENOENT/);
  const directory = await mkdtemp(join(tmpdir(), "module-admission-tamper-"));
  try {
    for (const field of ["expect", "workerExpect"]) {
      const suite = JSON.parse(await readFile(moduleAdmissionSuiteUrl, "utf8"));
      if (field === "expect") suite.cases[0].expect.admitted = false;
      else suite.cases[0].workerExpect.entrypoints = 0;
      const path = join(directory, `${field}.json`); await writeFile(path, JSON.stringify(suite));
      await assert.rejects(runModuleAdmissionSuite({ suiteUrl: pathToFileURL(path) }), /manifest mismatch/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("module admission: unrelated errors and transforms before rejection cannot masquerade as preflight", () => {
  const rejected = { ok: false, output: "", error: "TBA-MODULE-GRANT-LAB", committed: false, entrypoints: 0, invocations: 0 };
  assert.deepEqual(projectModuleAdmission(rejected), { admitted: false, error: rejected.error });
  for (const fields of [{ error: "TBA-RUN-LAB" }, { invocations: 1 }, { committed: true }, { ok: true }, { entrypoints: 2 }]) assert.throws(() => projectModuleAdmission({ ...rejected, ...fields }));
  assert.deepEqual(projectModuleAdmission({ ...rejected, entrypoints: 1, error: "TBA-MODULE-FUNCTION-CONTRACT-LAB" }), { admitted: true, error: null });
});
