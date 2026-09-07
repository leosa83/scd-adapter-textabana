import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import Ajv2020 from "ajv/dist/2020.js";
import { build } from "esbuild";
import { semanticBundleSchema } from "../contracts/semantic-bundle-v1.js";
import validateGenerated from "../runtime/generated/semantic-bundle-validator.js";
import { canonicalDigest, canonicalize, parseStrictJson } from "../runtime/canonical-json.js";
import { verifySemanticBundle } from "../runtime/semantic-identity.js";
import { contractSuiteUrl, contractBundlesUrl, prepareContractCase, runContractSuite } from "../conformance/contract-runner.mjs";
import { executeSemanticCase } from "../conformance/semantic-runner.mjs";

const suite = parseStrictJson(await readFile(contractSuiteUrl, "utf8"));
const baseline = parseStrictJson(await readFile(contractBundlesUrl, "utf8"));

test("frozen contract profile accepts 14 supported bundles and rejects 66 malformed or rehashed invalid bundles", async () => {
  const report = await runContractSuite();
  assert.equal(report.status, "passed", JSON.stringify(report.checks.filter((item) => item.status !== "passed")));
  assert.equal(report.checks.length, 80);
  assert.equal(report.checks.filter((item) => item.actual.accepted).length, 14);
  assert.equal(report.claim.artifactContract, true);
  assert.equal(report.claim.canonicalRuntime, false);
  assert.equal(report.claim.independentImplementations, false);
  assert.equal(report.claim.fullProfileConformance, false);
});

test("published schema and generated validator agree with fresh schema compilation on the frozen corpus", async () => {
  assert.deepEqual(JSON.parse(await readFile(new URL("../public/contracts/semantic-bundle-v1.schema.json", import.meta.url))), semanticBundleSchema);
  const validate = new Ajv2020({ strict: true, ownProperties: true }).compile(semanticBundleSchema);
  for (const fixture of suite.cases.filter((item) => !Object.hasOwn(item, "json"))) {
    const bundle = await prepareContractCase(fixture, baseline.bundles);
    const expectedStructure = !["schema", "claims"].includes(fixture.expect.phase);
    assert.equal(validate(bundle), expectedStructure, `${fixture.id}: ${JSON.stringify(validate.errors)}`);
    assert.equal(validateGenerated(bundle), expectedStructure, fixture.id);
  }
});

test("standalone browser validator runs with dynamic code generation disabled", async () => {
  const compiled = await build({ stdin: { contents: 'import validate from "./runtime/generated/semantic-bundle-validator.js"; globalThis.validate = validate;', resolveDir: new URL("..", import.meta.url).pathname }, format: "iife", bundle: true, platform: "browser", write: false });
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(compiled.outputFiles[0].text, context);
  const fixture = vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(baseline.bundles["payload-fields"]))})`, context);
  assert.equal(context.validate(fixture), true);
  delete fixture.result.artifact.render;
  assert.equal(context.validate(fixture), false);
});

test("verification snapshots before yielding and identifies exactly the verified bundle", async () => {
  const bundle = structuredClone(baseline.bundles["payload-fields"]);
  const expectedDigest = await canonicalDigest(bundle);
  const pending = verifySemanticBundle(bundle);
  bundle.source.artifact.path = "changed during verification";
  bundle.result.artifact.channelSnapshots["system.out"].events[0].target.anchorRef = "missing";
  bundle.claims.fullRuntimeConformance = true;
  const verified = await pending;
  assert.equal(verified.bundleDigest, expectedDigest);
  assert.equal(verified.structure, "valid"); assert.equal(verified.references, "verified");
  assert.equal(verified.profileConformance, "not-evaluated"); assert.equal(verified.fullRuntimeConformance, false);
  await assert.rejects(verifySemanticBundle(bundle), /promote/);
});

test("strict verification retains the frozen semantic artifact identities", async () => {
  const golden = parseStrictJson(await readFile(new URL("../conformance/profiles/semantic-artifacts-v1.golden.json", import.meta.url), "utf8"));
  for (const [id, identities] of Object.entries(golden.cases)) {
    const verification = await verifySemanticBundle(baseline.bundles[id]);
    assert.equal(canonicalize(verification.identities), canonicalize(identities), id);
  }
});

test("all existing Playground examples produce verifiable full or partial identity bundles", { timeout: 60000 }, async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const templates = Object.fromEntries([...page.matchAll(/^const (\w+(?:Module|Document)) = `([\s\S]*?)`;/gm)].map((match) => [match[1], vm.runInNewContext(`\`${match[2]}\``)]));
  const modules = Object.entries(templates).filter(([name]) => name.endsWith("Module")).map(([name, content]) => ({ path: `modules/${name.slice(0, -6)}.js`, content }));
  const documents = Object.entries(templates).filter(([name]) => name.endsWith("Document"));
  assert.equal(documents.length, 15);
  for (const [name, source] of documents) {
    const response = await executeSemanticCase({ source, modules, options: { strictChannels: true } }, "direct");
    const verified = await verifySemanticBundle(response.semanticIdentity);
    assert.equal(verified.structure, "valid", name);
    assert.equal(!!response.semanticIdentity.result, response.ok, name);
  }
});

test("invalid fixture bindings stop the contract suite and CLI rejects an invalid rehashed bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "textabana-contract-"));
  try {
    const changed = structuredClone(suite); changed.baselineDigest = `sha256:${"0".repeat(64)}`;
    const path = join(directory, "suite.json"); await writeFile(path, JSON.stringify(changed));
    await assert.rejects(runContractSuite({ suiteUrl: path }), /mismatch/);
    const reduced = structuredClone(suite); reduced.cases.pop();
    await writeFile(path, JSON.stringify(reduced));
    await assert.rejects(runContractSuite({ suiteUrl: path }), /manifest mismatch/);
    const reworded = structuredClone(suite); reworded.cases[0].expect.accepted = false;
    await writeFile(path, JSON.stringify(reworded));
    await assert.rejects(runContractSuite({ suiteUrl: path }), /manifest mismatch/);
    const invalid = await prepareContractCase(suite.cases.find((item) => item.id === "dangling-anchor"), baseline.bundles);
    const bundlePath = join(directory, "bundle.json"); await writeFile(bundlePath, JSON.stringify(invalid));
    const cli = spawnSync(process.execPath, [new URL("../cli/textabana.mjs", import.meta.url).pathname, "verify-identity", bundlePath], { encoding: "utf8" });
    assert.equal(cli.status, 1); assert.match(cli.stderr, /anchor reference/); assert.equal(cli.stdout, "");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
