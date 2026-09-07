import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";
import { verifySemanticBundle } from "../runtime/semantic-identity.js";
import { SEMANTIC_CONTRACT } from "../runtime/semantic-contract.js";

export const contractSuiteUrl = new URL("./profiles/semantic-contract-v1.json", import.meta.url);
export const contractBundlesUrl = new URL("./fixtures/semantic-bundles-v1.json", import.meta.url);
export const contractManifestUrl = new URL("./profiles/semantic-contract-v1.manifest.json", import.meta.url);
const schemaUrl = new URL("../public/contracts/semantic-bundle-v1.schema.json", import.meta.url);
const verifierSources = ["../runtime/semantic-identity.js", "../runtime/semantic-verification.js", "../runtime/semantic-contract.js", "../runtime/canonical-json.js", "../runtime/execution-graph.js", "../runtime/generated/semantic-bundle-validator.js", "./contract-runner.mjs"];
const digestBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export async function rehashBundle(bundle, mode = "chain") {
  for (const kind of ["source", "context", "ir", "plan", "result"]) {
    const entry = bundle[kind];
    if (!entry) continue;
    if (mode === "chain") {
      if (kind === "context" || kind === "ir" || kind === "result") entry.artifact.sourceId = bundle.source.id;
      if (kind === "plan" || kind === "result") { entry.artifact.contextId = bundle.context.id; entry.artifact.irId = bundle.ir.id; }
      if (kind === "result") entry.artifact.planId = bundle.plan.id;
    }
    entry.id = await canonicalDigest(entry.artifact);
  }
  return bundle;
}

export async function prepareContractCase(fixture, bundles) {
  if (Object.hasOwn(fixture, "json")) return parseStrictJson(fixture.json);
  if (!Object.hasOwn(bundles, fixture.base)) throw new Error(`Unknown baseline: ${fixture.base}`);
  const bundle = structuredClone(bundles[fixture.base]);
  const at = (path) => path.reduce((value, key) => {
    if (!value || !Object.hasOwn(value, key)) throw new Error(`Unknown fixture path: ${path.join("/")}`);
    return value[key];
  }, bundle);
  for (const mutation of fixture.mutations || []) {
    const key = mutation.path.at(-1); const parent = at(mutation.path.slice(0, -1));
    if (!["add", "replace", "remove"].includes(mutation.op) || (mutation.op !== "add" && !Object.hasOwn(parent, key))) throw new Error("Invalid contract fixture mutation.");
    if (mutation.op === "remove") delete parent[key];
    else Object.defineProperty(parent, key, { value: structuredClone(Object.hasOwn(mutation, "copyFrom") ? at(mutation.copyFrom) : mutation.value), enumerable: true, configurable: true, writable: true });
  }
  return fixture.rehash === false ? bundle : rehashBundle(bundle, fixture.rehash || "chain");
}

export async function runContractSuite({ suiteUrl = contractSuiteUrl, bundlesUrl = contractBundlesUrl } = {}) {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8"));
  const baselines = parseStrictJson(await readFile(bundlesUrl, "utf8"));
  const baselineDigest = await canonicalDigest(baselines);
  const manifest = parseStrictJson(await readFile(contractManifestUrl, "utf8"));
  const suiteDigest = await canonicalDigest(suite);
  const schemaDigest = await canonicalDigest(parseStrictJson(await readFile(schemaUrl, "utf8")));
  if (manifest.schema !== "textabana.contract-manifest/v1" || manifest.profile !== SEMANTIC_CONTRACT || manifest.version !== "1.0.0" || manifest.suiteDigest !== suiteDigest || manifest.schemaDigest !== schemaDigest || manifest.caseCount !== suite.cases?.length) throw new Error("Contract suite/schema manifest mismatch.");
  if (suite.schema !== "textabana.contract-suite/v1" || suite.profile !== SEMANTIC_CONTRACT || suite.version !== "1.0.0" || baselines.schema !== "textabana.contract-baselines/v1" || baselineDigest !== suite.baselineDigest || !suite.cases?.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length) throw new Error("Contract suite/baseline mismatch.");
  const sources = async () => Object.fromEntries(await Promise.all(verifierSources.map(async (path) => [path.startsWith("../") ? path.slice(3) : `conformance/${path.slice(2)}`, digestBytes(await readFile(new URL(path, import.meta.url)))])));
  const sourceDigests = await sources();
  const checks = [];
  for (const fixture of suite.cases) {
    if (typeof fixture.expect?.accepted !== "boolean" || (fixture.expect.accepted ? fixture.expect.phase !== null : !["json", "schema", "digest", "chain", "claims", "references"].includes(fixture.expect.phase))) throw new Error("Invalid contract case expectation.");
    let bundle;
    try { bundle = await prepareContractCase(fixture, baselines.bundles); }
    catch (error) {
      if (!Object.hasOwn(fixture, "json")) throw error; // Broken fixture setup is never a successful negative check.
      const actual = { accepted: false, phase: "json" };
      checks.push({ caseId: fixture.id, status: !fixture.expect.accepted && fixture.expect.phase === "json" ? "passed" : "failed", actual, expected: fixture.expect });
      continue;
    }
    let actual;
    try {
      const verification = await verifySemanticBundle(bundle);
      actual = { accepted: true, phase: null, bundleDigest: verification.bundleDigest, structure: verification.structure, references: verification.references, profileConformance: verification.profileConformance, fullRuntimeConformance: verification.fullRuntimeConformance };
    } catch (error) {
      if (error.code !== "TBA-IDENTITY-PROFILE") throw error;
      actual = { accepted: false, phase: error.validationPhase, message: error.message };
    }
    const passed = actual.accepted === fixture.expect.accepted && actual.phase === fixture.expect.phase
      && (!actual.accepted || (actual.structure === "valid" && actual.references === "verified" && actual.profileConformance === "not-evaluated" && actual.fullRuntimeConformance === false));
    checks.push({ caseId: fixture.id, status: passed ? "passed" : "failed", actual, expected: fixture.expect });
  }
  const verifierDigest = await canonicalDigest(sourceDigests);
  if (verifierDigest !== await canonicalDigest(await sources())) throw new Error("Verifier changed during contract suite.");
  const passed = checks.every((check) => check.status === "passed");
  return { schema: "textabana.external-report/v1", profile: SEMANTIC_CONTRACT, suiteVersion: suite.version, suiteDigest, baselineDigest, manifestDigest: await canonicalDigest(manifest),
    schemaDigest, verifierDigest, verifierSources: sourceDigests,
    checks, status: passed ? "passed" : "failed", claim: { scope: SEMANTIC_CONTRACT, claimable: passed, artifactContract: passed, canonicalRuntime: false, independentImplementations: false, fullProfileConformance: false } };
}
