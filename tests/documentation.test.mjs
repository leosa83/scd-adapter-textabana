import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { integrationPackage } from "../examples/integration/package.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", timeout: 45000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}

test("documentation register includes every current requirement and valid source references", () => {
  assert.match(run(process.execPath, ["scripts/build-specification-docs.mjs", "--check"]), /requirement bindings/);
});

test("published integration examples exercise the real TypeScript and Python clients", () => {
  const node = JSON.parse(run(process.execPath, ["examples/integration/editor-loop.mjs"]));
  assert.equal(node.status, "passed");
  assert.equal(node.render, "HALLÅ 🌊\n");
  assert.equal(node.revision, 2);
  assert.equal(node.metadataChunks, 1);
  assert.equal(node.artifactVerified, true);
  assert.equal(node.staleRevisionRejected, true);
  assert.equal(node.missingGrantRejected, true);
  const python = JSON.parse(run("python3", ["examples/integration/python-host.py"]));
  assert.equal(python.status, "passed");
  assert.equal(python.mimeTypes.length, 3);
});

test("documented CLI package, channel and identity workflow runs without placeholder input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "textabana-docs-cli-"));
  try {
    const config = join(directory, "modules.json");
    await writeFile(config, JSON.stringify(await integrationPackage()));
    const response = JSON.parse(run(process.execPath, ["cli/textabana.mjs", "run", "examples/integration/document.md", config]));
    assert.equal(response.ok, true);
    assert.equal(response.output, "HEJ 🌊\n");
    assert.ok(response.resultEnvelope.channelSnapshots["docs.metrics"].events.length > 0);
    const bundle = run(process.execPath, ["cli/textabana.mjs", "identify", "examples/integration/document.md", config]);
    const path = join(directory, "identity.json");
    await writeFile(path, bundle);
    const verification = JSON.parse(run(process.execPath, ["cli/textabana.mjs", "verify-identity", path]));
    assert.equal(verification.integrity, "verified");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
