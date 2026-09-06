import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalDigest, canonicalize, parseStrictJson } from "../runtime/canonical-json.js";
import { SEMANTIC_PROFILE, verifySemanticBundle } from "../runtime/semantic-identity.js";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient } from "./host-runner.mjs";

export const semanticSuiteUrl = new URL("./profiles/semantic-artifacts-v1.json", import.meta.url);
export const semanticGoldenUrl = new URL("./profiles/semantic-artifacts-v1.golden.json", import.meta.url);

export async function executeSemanticCase(fixture, host, sequence = 1) {
  const transport = new NodeKernelTransport(); const client = rawClient(transport);
  const options = { ...fixture.options, semanticIdentity: true };
  const base = { documentId: "semantic-fixture", documentPath: "fixture.md", documentSource: fixture.source, modules: fixture.modules, options, runId: sequence };
  try {
    if (host === "direct") return await client.command(undefined, base);
    await client.command("open", { document: { documentId: base.documentId, path: base.documentPath, source: host === "edited" ? `prefix\n${fixture.source}` : fixture.source, documentRevision: 1 } });
    let revision = 1;
    if (host === "cached") {
      const run = (runId) => client.command("run", { ...base, documentRevision: revision, runId });
      await run(sequence + 1000);
      const end = Array.from(fixture.source).length;
      await client.command("change", { documentId: base.documentId, baseRevision: revision++, changes: [{ from: end, to: end, insert: "\ntail" }] });
      await run(sequence + 2000);
      await client.command("change", { documentId: base.documentId, baseRevision: revision++, changes: [{ from: end, to: end + 5, insert: "" }] });
    }
    if (host === "edited") {
      await client.command("analyze", { documentId: base.documentId, documentRevision: revision });
      await client.command("change", { documentId: base.documentId, baseRevision: revision++, changes: [{ from: 0, to: 7, insert: "" }] });
    }
    return await client.command("run", { ...base, documentRevision: revision });
  } finally { client.dispose(); await transport.close(); }
}

export async function runSemanticSuite() {
  const suite = parseStrictJson(await readFile(semanticSuiteUrl, "utf8"));
  const golden = parseStrictJson(await readFile(semanticGoldenUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite);
  if (suite.schema !== "textabana.semantic-suite/v1" || suite.profile !== SEMANTIC_PROFILE || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length || golden.schema !== "textabana.semantic-golden/v1" || golden.suiteDigest !== suiteDigest || Object.keys(golden.cases).length !== suite.cases.length) throw new Error("Semantic suite/golden mismatch.");
  const kernelDigest = async () => `sha256:${createHash("sha256").update(await readFile(new URL("../public/runtime-worker.js", import.meta.url))).digest("hex")}`;
  const kernelBefore = await kernelDigest();
  const checks = [];
  for (const host of ["direct", "editor", "edited", "cached"]) {
    for (const [index, fixture] of suite.cases.entries()) {
      if (host === "cached" && fixture.id !== "pure-stage") continue;
      try {
        const response = await executeSemanticCase(fixture, host, index + (host === "direct" ? 1 : 101));
        const verification = await verifySemanticBundle(response.semanticIdentity);
        const code = response.diagnostics.find((item) => item.severity === "error" || item.level === "error")?.code ?? null;
        const actual = { ok: response.ok, output: response.output, code, identities: verification.identities,
          ...(host === "cached" ? { cacheReused: response.executionStats.reused } : {}) };
        const passed = response.ok === fixture.expect.ok && response.output === fixture.expect.output && code === (fixture.expect.code ?? null)
          && canonicalize(actual.identities) === canonicalize(golden.cases[fixture.id])
          && (host !== "cached" || actual.cacheReused > 0)
          && (fixture.expect.ok ? !!response.semanticIdentity.result && response.resultEnvelope.run.committed : response.semanticIdentity.result === null && !response.resultEnvelope.run.committed && !Object.keys(response.resultEnvelope.channelSnapshots).length && !response.resultEnvelope.anchors.length);
        checks.push({ host, caseId: fixture.id, status: passed ? "passed" : "failed", actual, expected: { ...fixture.expect, identities: golden.cases[fixture.id] } });
      } catch (error) { checks.push({ host, caseId: fixture.id, status: "failed", error: error.message }); }
    }
  }
  if (kernelBefore !== await kernelDigest()) throw new Error("Kernel changed during semantic suite.");
  const passed = checks.length === suite.cases.length * 3 + 1 && checks.every((item) => item.status === "passed");
  return { schema: "textabana.external-report/v1", profile: SEMANTIC_PROFILE, suiteVersion: suite.version, suiteDigest, goldenDigest: await canonicalDigest(golden), kernelDigest: kernelBefore,
    hosts: ["direct", "editor", "edited", "cached"], checks, status: passed ? "passed" : "failed",
    claim: { scope: SEMANTIC_PROFILE, claimable: passed, canonicalArtifactIdentity: passed, canonicalRuntime: false, independentImplementations: false, fullProfileConformance: false } };
}
