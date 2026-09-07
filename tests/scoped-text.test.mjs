import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runScopedTextSuite, runPythonScopedText, scopedTextSuiteUrl } from "../conformance/scoped-text-runner.mjs";

test("scoped text: both implementations match every frozen render and invocation ledger", async () => {
  const report = await runScopedTextSuite();
  assert.equal(report.status, "passed");
  assert.equal(report.checks.length, 80);
  assert.equal(report.claim.independentImplementations, true);
  assert.equal(report.claim.canonicalRuntime, false);
  assert.equal(report.claim.semanticArtifactEquivalence, false);
  assert.equal(report.claim.fullProfileConformance, false);
  assert.ok(report.implementations["reference/text_core.py"]);
  assert.ok(report.baseSpecificationDigest);
});

test("scoped text: copied Python files preserve inheritance without repository or Node", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scoped-text-isolated-"));
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  try {
    for (const file of ["scoped_text.py", "text_core.py"]) await copyFile(new URL(`../reference/${file}`, import.meta.url), join(directory, file));
    const runtime = join(directory, "scoped_text.py"), document = join(directory, "input.md");
    const source = '>>>>+ wrap @id="a" prefix="[" suffix="]"\n>>>> asciiUpper\nHej 😀\n<<<< asciiUpper\n<<<<+ a';
    await writeFile(document, source);
    const options = { cwd: directory, env: { ...process.env, PATH: "", PYTHONPATH: "", PYTHONSTARTUP: "" } };
    const { stdout } = await promisify(execFile)(python, ["-E", "-s", runtime, "run", document], options);
    assert.deepEqual(JSON.parse(stdout).result, { ok: true, output: "[HEJ 😀\n]", error: null, committed: true, committedStages: 2,
      stages: [{ function: "asciiUpper", args: {}, modality: "block", scopeId: null }, { function: "wrap", args: { prefix: "[", suffix: "]" }, modality: "interval", scopeId: "a" }] });
    await writeFile(document, '>>>>+ wrap @id="a"\n>>>> identity\nx\n<<<<+ a\n<<<< identity');
    await assert.rejects(promisify(execFile)(python, ["-E", "-s", runtime, "run", document], options), (error) => {
      assert.equal(error.code, 1);
      assert.deepEqual(JSON.parse(error.stdout).result, { ok: false, output: "", error: "syntax", committed: false, committedStages: 0, stages: [] });
      return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("scoped text: weakened ledger expectations and missing interpreter fail closed", async () => {
  await assert.rejects(runPythonScopedText([""], { executable: "/nonexistent/scoped-text-python" }), /ENOENT/);
  const directory = await mkdtemp(join(tmpdir(), "scoped-text-tamper-"));
  try {
    const suite = JSON.parse(await readFile(scopedTextSuiteUrl, "utf8"));
    const fixture = suite.cases.find((item) => item.id === "equal-order");
    fixture.expect.stages.reverse(); // Output and count remain unchanged; the expected order was weakened.
    const path = join(directory, "weakened.json"); await writeFile(path, JSON.stringify(suite));
    await assert.rejects(runScopedTextSuite({ suiteUrl: pathToFileURL(path) }), /manifest mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
