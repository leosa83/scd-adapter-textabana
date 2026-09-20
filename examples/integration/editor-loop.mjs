import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { NodeKernelTransport } from "../../sdk/node/transport.mjs";
import { integrationPackage } from "./package.mjs";
import { verifySemanticBundle } from "../../runtime/semantic-identity.js";

// Compile the shipped TypeScript client; this is not a substitute client.
const temporary = await mkdtemp(join(tmpdir(), "textabana-docs-"));
const transport = new NodeKernelTransport();
let client;
const deadline = setTimeout(() => {
  process.stderr.write("Integration example exceeded 30 seconds.\n");
  client?.dispose();
  void transport.close();
  process.exitCode = 1;
}, 30000);
try {
  const outfile = join(temporary, "client.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../../sdk/typescript/index.ts", import.meta.url))], outfile, platform: "node", format: "esm", bundle: true, logLevel: "silent" });
  const { TextabanaKernelClient } = await import(pathToFileURL(outfile));
  client = new TextabanaKernelClient(transport);
  const source = await readFile(new URL("./document.md", import.meta.url), "utf8");
  const pkg = await integrationPackage();
  const opened = await client.open("docs-demo", "examples/integration/document.md", source);
  let revision = opened.document.documentRevision;
  const analysis = await client.analyze("docs-demo", revision);
  assert.equal(analysis.analysis.executable, true);

  const chunks = [];
  const unlisten = client.onChunk("docs-stream", (chunk) => chunks.push(chunk));
  await client.subscribe("docs-demo", "docs-stream", ["docs.metrics"], 0);
  const first = await client.run("docs-demo", revision, 1, pkg.modules, { ...pkg.options, semanticIdentity: true });
  assert.equal(first.resultEnvelope.run.committed, true);
  assert.match(first.output, /HEJ 🌊/u);
  assert.equal(chunks.length, 0, "No metadata delivered without credit");
  await client.credit("docs-stream", 1);
  assert.equal(chunks.length, 1);

  const from = Array.from(source.slice(0, source.indexOf("Hej"))).length;
  const changed = await client.change("docs-demo", revision, [{ range: { from, to: from + 3 }, insert: "Hallå" }]);
  revision = changed.document.documentRevision;
  const second = await client.run("docs-demo", revision, 2, pkg.modules, pkg.options);
  assert.match(second.output, /HALLÅ 🌊/u);
  await assert.rejects(client.change("docs-demo", revision - 1, [{ range: { from: 0, to: 0 }, insert: "stale" }]), (error) => error.response?.ok === false);
  await assert.rejects(client.run("docs-demo", revision, 3, pkg.modules, { ...pkg.options, capabilityGrants: [] }), (error) => error.response?.diagnostics?.some((item) => item.code === "TBA-MODULE-GRANT-LAB"));
  const verification = await verifySemanticBundle(first.semanticIdentity);
  assert.equal(verification.integrity, "verified", JSON.stringify(verification));
  unlisten();
  process.stdout.write(`${JSON.stringify({ status: "passed", revision, render: second.output, metadataChunks: chunks.length, artifactVerified: verification.integrity === "verified", staleRevisionRejected: true, missingGrantRejected: true })}\n`);
} finally {
  clearTimeout(deadline);
  client?.dispose();
  await transport.close();
  await rm(temporary, { recursive: true, force: true });
}
