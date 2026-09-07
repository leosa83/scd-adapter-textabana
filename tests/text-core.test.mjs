import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runTextCoreSuite, runPythonTextCore, textCoreSuiteUrl } from "../conformance/text-core-runner.mjs";

test("text core: both independent implementations pass the complete frozen profile", async () => {
  const report = await runTextCoreSuite();
  assert.equal(report.status, "passed");
  assert.equal(report.checks.length, 70);
  assert.equal(report.claim.independentImplementations, true);
  assert.equal(report.claim.canonicalRuntime, false);
  assert.equal(report.claim.semanticArtifactEquivalence, false);
  assert.equal(report.claim.fullProfileConformance, false);
  assert.ok(report.implementations["sdk/node/worker-bridge.mjs"]);
});

test("text core: copied Python runtime works outside the repository with no Node on PATH", async () => {
  const directory = await mkdtemp(join(tmpdir(), "text-core-isolated-"));
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  try {
    const runtime = join(directory, "reference.py"), document = join(directory, "input.md");
    await copyFile(new URL("../reference/text_core.py", import.meta.url), runtime);
    await writeFile(document, '>>>> wrap prefix="[" suffix="]" | asciiUpper\nHej 😀\n<<<< wrap');
    const options = { cwd: directory, env: { ...process.env, PATH: "", PYTHONPATH: "", PYTHONSTARTUP: "" } };
    const response = await promisify(execFile)(python, ["-I", runtime, "run", document], options);
    const result = JSON.parse(response.stdout);
    assert.deepEqual(result.result, { ok: true, output: "[HEJ 😀\n]", error: null, committed: true, committedStages: 2 });
    assert.match(result.sourceDigest, /^sha256:[a-f0-9]{64}$/);
    await writeFile(document, 'before\n>>>> fail\nx\n<<<< fail');
    await assert.rejects(promisify(execFile)(python, ["-I", runtime, "run", document], options), (error) => {
      assert.equal(error.code, 1);
      assert.deepEqual(JSON.parse(error.stdout).result, { ok: false, output: "", error: "stage", committed: false, committedStages: 0 });
      return true;
    });
    await writeFile(document, Buffer.from([0xc3, 0x28]));
    await assert.rejects(promisify(execFile)(python, ["-I", runtime, "run", document], options));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("text core: missing runtime and weakened suite cannot produce a profile claim", async () => {
  await assert.rejects(runPythonTextCore(["text"], { executable: "/nonexistent/text-core-python" }), /ENOENT/);
  const directory = await mkdtemp(join(tmpdir(), "text-core-tamper-"));
  try {
    const suite = JSON.parse(await readFile(textCoreSuiteUrl, "utf8"));
    suite.cases.pop();
    const path = join(directory, "weakened.json"); await writeFile(path, JSON.stringify(suite));
    await assert.rejects(runTextCoreSuite({ suiteUrl: pathToFileURL(path) }), /manifest mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
