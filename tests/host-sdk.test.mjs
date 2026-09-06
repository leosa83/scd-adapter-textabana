import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/runtime-worker.js", import.meta.url), "utf8");

function harness() {
  const messages = [];
  const context = vm.createContext({
    console, crypto: webcrypto, performance, TextEncoder, TextDecoder, structuredClone, Uint8Array,
    btoa, atob, setTimeout, clearTimeout,
    self: { postMessage(message) { messages.push(message); } },
  });
  vm.runInContext(workerSource, context);
  return { context, messages, async send(data) { await context.self.onmessage({ data }); return messages.at(-1); } };
}

function securePackage() {
  const content = `define({ secure_upper: { state: "pure", determinism: "deterministic", effects: [], transform(input) { return String(input).toUpperCase(); } } });`;
  const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const manifest = {
    schema: "textabana.module-manifest/lab-v1",
    namespace: "org.textabana.secure-upper",
    version: "1.0.0",
    entrypoint: "modules/secure.js",
    digest,
    functions: [{ name: "secure_upper", state: "pure", determinism: "deterministic", effects: [] }],
    capabilities: { required: ["text:transform"], channels: [], resources: [] },
  };
  return {
    module: { path: "modules/secure.js", content, digest, manifest },
    lock: { schema: "textabana.module-lock/lab-v1", packages: [{ namespace: manifest.namespace, version: manifest.version, entrypoint: manifest.entrypoint, digest }] },
  };
}

test("a SHA-256 locked module runs only with explicit capability grants", async () => {
  const h = harness();
  const secured = securePackage();
  const source = `>>>>! include "./modules/secure.js"\n>>>> secure_upper\nHej\n<<<< secure_upper`;
  const denied = await h.send({ runId: 700, documentSource: source, modules: [secured.module], options: { moduleLock: secured.lock, capabilityGrants: [] } });
  assert.equal(denied.ok, false);
  assert.equal(denied.diagnostics[0].code, "TBA-MODULE-GRANT-LAB");
  const accepted = await h.send({ requestId: "sdk:run:701", runId: 701, documentSource: source, modules: [secured.module], options: { moduleLock: secured.lock, capabilityGrants: ["text:transform"] } });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(accepted.requestId, "sdk:run:701");
  assert.match(accepted.output, /HEJ/);
});

test("digest, lock and declared function contract are verified before execution", async () => {
  const h = harness();
  const secured = securePackage();
  const source = `>>>>! include "./modules/secure.js"\n>>>> secure_upper\nHej\n<<<< secure_upper`;
  const tampered = { ...secured.module, content: `${secured.module.content}\n// tampered` };
  const digestFailure = await h.send({ runId: 702, documentSource: source, modules: [tampered], options: { moduleLock: secured.lock, capabilityGrants: ["text:transform"] } });
  assert.equal(digestFailure.diagnostics[0].code, "TBA-MODULE-DIGEST-LAB");
  const contractFailure = await h.send({ runId: 703, documentSource: source, modules: [{ ...secured.module, manifest: { ...secured.module.manifest, functions: [{ ...secured.module.manifest.functions[0], state: "session" }] } }], options: { moduleLock: secured.lock, capabilityGrants: ["text:transform"] } });
  assert.equal(contractFailure.diagnostics[0].code, "TBA-MODULE-FUNCTION-CONTRACT-LAB");
});

test("TypeScript host SDK type-checks and Python/Jupyter client compiles", () => {
  const typescript = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--skipLibCheck", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "bundler", "sdk/typescript/index.ts"], { encoding: "utf8" });
  assert.equal(typescript.status, 0, typescript.stderr || typescript.stdout);
  const python = spawnSync("python3", ["-m", "py_compile", "sdk/python/textabana_client.py", "sdk/python/__init__.py"], { encoding: "utf8" });
  assert.equal(python.status, 0, python.stderr || python.stdout);
});

test("an explicit module lock cannot be bypassed by stripping manifests or duplicate entries", async () => {
  const h = harness(); const secured = securePackage();
  const source = `>>>>! include "./modules/secure.js"\n>>>> secure_upper\nHej\n<<<< secure_upper`;
  const options = { moduleLock: secured.lock, capabilityGrants: ["text:transform"] };
  const stripped = await h.send({ runId: 710, documentSource: source, modules: [{ path: secured.module.path, content: secured.module.content }], options });
  assert.equal(stripped.ok, false); assert.equal(stripped.diagnostics[0].code, "TBA-MODULE-MANIFEST-LAB");
  const duplicate = await h.send({ runId: 711, documentSource: source, modules: [secured.module], options: { ...options, moduleLock: { ...secured.lock, packages: [...secured.lock.packages, ...secured.lock.packages] } } });
  assert.equal(duplicate.ok, false); assert.equal(duplicate.diagnostics[0].code, "TBA-MODULE-LOCK-LAB");
});

test("editor bindings preserve Unicode code-point coordinates", async () => {
  const codeMirror = await readFile(new URL("../sdk/typescript/codemirror.ts", import.meta.url), "utf8");
  const monaco = await readFile(new URL("../sdk/typescript/monaco.ts", import.meta.url), "utf8");
  assert.match(codeMirror, /codeUnitsToCodePoints/);
  assert.match(monaco, /codeUnitsToCodePoints/);
  assert.match(codeMirror, /client\.change/);
  assert.match(monaco, /client\.change/);
});
