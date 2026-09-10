import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runSourceMapCoreSuite, runPythonSourceMapCore, sourceMapCoreSuiteUrl, projectSourceMapResponse } from "../conformance/source-map-core-runner.mjs";
import { runChannelWorker } from "../conformance/channel-core-runner.mjs";

test("source map core: both implementations match frozen positions, quotes and alias relationships", async () => {
  const report = await runSourceMapCoreSuite();
  assert.equal(report.status, "passed"); assert.equal(report.checks.length, 70);
  assert.equal(report.claim.independentImplementations, true);
  for (const key of ["canonicalRuntime", "semanticArtifactEquivalence", "fullProfileConformance"]) assert.equal(report.claim[key], false);
  for (const file of ["reference/source_map_core.py", "reference/channel_core.py", "reference/scoped_text.py", "reference/text_core.py", "runtime/execution-graph.js", "runtime/worker-entry.js"]) assert.ok(report.implementations[file]);
  assert.equal(Object.keys(report.baseSpecificationDigests).length, 3);
});

test("source map core: four copied Python files preserve Unicode and shared anchors without Node", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-map-core-isolated-"));
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  const suite = JSON.parse(await readFile(sourceMapCoreSuiteUrl, "utf8"));
  try {
    for (const file of ["source_map_core.py", "channel_core.py", "scoped_text.py", "text_core.py"]) await copyFile(new URL(`../reference/${file}`, import.meta.url), join(directory, file));
    const runtime = join(directory, "source_map_core.py"), document = join(directory, "input.md");
    const options = { cwd: directory, env: { ...process.env, PATH: "", PYTHONPATH: "", PYTHONSTARTUP: "" } };
    for (const id of ["suffix-astral-47", "shared-row-moves", "local-survives-none"]) {
      const fixture = suite.cases.find((item) => item.id === id); await writeFile(document, fixture.source);
      const { stdout } = await promisify(execFile)(python, ["-E", "-s", runtime, "run", document], options);
      assert.deepEqual(JSON.parse(stdout).result, fixture.expect);
    }
    const fixture = suite.cases.find((item) => item.id === "row-hash-collision"); await writeFile(document, fixture.source);
    await assert.rejects(promisify(execFile)(python, ["-E", "-s", runtime, "run", document], options), (error) => {
      assert.equal(error.code, 1); assert.deepEqual(JSON.parse(error.stdout).result, fixture.expect); return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("source map core: changing only positions and missing Python fail closed", async () => {
  await assert.rejects(runPythonSourceMapCore([""], { executable: "/nonexistent/source-map-core-python" }), /ENOENT/);
  const directory = await mkdtemp(join(tmpdir(), "source-map-core-tamper-"));
  try {
    const suite = JSON.parse(await readFile(sourceMapCoreSuiteUrl, "utf8"));
    suite.cases.find((item) => item.id === "unicode-payload").expect.anchors[0].position.end++;
    const path = join(directory, "weakened.json"); await writeFile(path, JSON.stringify(suite));
    await assert.rejects(runSourceMapCoreSuite({ suiteUrl: pathToFileURL(path) }), /manifest mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("source map core: projection rejects split Unicode, stale anchors and corrupt source links", async () => {
  const suite = JSON.parse(await readFile(sourceMapCoreSuiteUrl, "utf8"));
  const fixture = suite.cases.find((item) => item.id === "shared-row-moves"), result = await runChannelWorker(fixture.source);
  assert.deepEqual(projectSourceMapResponse(result, fixture.source), fixture.expect);
  for (const corrupt of [
    (r) => { r.resultEnvelope.anchors[0].selectors[1].suffix = "\ud83d"; },
    (r) => { r.resultEnvelope.anchors[0].selectors[0].start++; },
    (r) => { r.resultEnvelope.anchors[0].origin = { ...r.resultEnvelope.anchors[0].origin, ...r.channels["system.out"][0].origin }; },
    (r) => { r.resultEnvelope.sourceMaps[0].generatingActivity = "unknown"; },
    (r) => { r.executionTrace[0].source.endLine = 0; },
  ]) {
    const changed = structuredClone(result); corrupt(changed);
    // Keep host aliases consistent so validation reaches the underlying defect.
    changed.anchors = structuredClone(changed.resultEnvelope.anchors); changed.sourceMaps = structuredClone(changed.resultEnvelope.sourceMaps);
    assert.throws(() => projectSourceMapResponse(changed, fixture.source));
  }
  const failedFixture = suite.cases.find((item) => item.id === "row-hash-collision"), failed = await runChannelWorker(failedFixture.source);
  assert.deepEqual(projectSourceMapResponse(failed, failedFixture.source), failedFixture.expect);
  failed.resultEnvelope.anchors = result.resultEnvelope.anchors;
  assert.throws(() => projectSourceMapResponse(failed, failedFixture.source), /Nonatomic kernel failure/);
});
