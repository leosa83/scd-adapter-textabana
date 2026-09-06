import { build } from "esbuild";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { canonicalDigest, canonicalize, parseStrictJson } from "../runtime/canonical-json.js";

export const suiteUrl = new URL("./profiles/host-protocol-v1.json", import.meta.url);
export const projectionFields = ["ok", "revision", "characters", "executable", "output", "committed", "errorCode", "accepted"];
export function project(message) {
  const result = { ok: message.ok };
  if (message.document) { result.revision = message.document.documentRevision; result.characters = message.document.characters; }
  if (message.analysis) result.executable = message.analysis.executable;
  if (message.type === "run-result") {
    result.output = message.output;
    result.committed = message.resultEnvelope?.run?.committed === true;
  }
  const code = message.error?.code || message.diagnostics?.find((item) => item.level === "error" || item.severity === "error")?.code;
  if (code) result.errorCode = code;
  if (typeof message.accepted === "boolean") result.accepted = message.accepted;
  return result;
}

export function rawClient(transport) {
  let sequence = 0;
  const pending = new Map();
  const listener = ({ data }) => {
    if (data.type === "transport-error" && !data.requestId) { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(data.error.message)); } pending.clear(); }
    const item = pending.get(data.requestId);
    if (item) { pending.delete(data.requestId); clearTimeout(item.timer); item.resolve(data); }
  };
  transport.addEventListener("message", listener);
  return {
    command(command, payload = {}) {
      const requestId = `node:${++sequence}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Kernel command timed out: ${command}`)); }, 15000);
        pending.set(requestId, { resolve, reject, timer });
        try { transport.postMessage({ ...payload, type: command, requestId }); }
        catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
      });
    },
    dispose() { transport.removeEventListener("message", listener); for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Client closed.")); } pending.clear(); },
  };
}

export async function loadSdk() {
  const directory = await mkdtemp(join(tmpdir(), "textabana-sdk-"));
  const outfile = join(directory, "sdk.mjs");
  try {
    await build({ entryPoints: [fileURLToPath(new URL("../sdk/typescript/index.ts", import.meta.url))], outfile, platform: "node", format: "esm", bundle: true, logLevel: "silent" });
    return { sdk: await import(pathToFileURL(outfile)), cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

async function pythonHost() {
  const child = spawn("python3", [fileURLToPath(new URL("./python_host.py", import.meta.url))], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (text) => { stdout += text; if (stdout.length > 8 * 1024 * 1024) child.kill(); }); child.stderr.on("data", (text) => { stderr = (stderr + text).slice(-65536); });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => { child.kill(); reject(new Error("Python conformance host timed out.")); }, 30000);
      child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || "Python host failed.")));
    });
    return parseStrictJson(stdout);
  } finally { clearTimeout(timer); }
}

export async function runHostSuite() {
  const suite = parseStrictJson(await readFile(suiteUrl, "utf8"));
  if (suite.schema !== "textabana.external-suite/v1" || !Array.isArray(suite.cases) || !suite.cases.length || new Set(suite.cases.map((item) => item.id)).size !== suite.cases.length || suite.cases.some((item) => !item.id || !item.expect || !Object.keys(item.expect).length || Object.keys(item.expect).some((key) => !projectionFields.includes(key)))) throw new Error("Invalid or empty external suite.");
  const kernelHash = async () => `sha256:${createHash("sha256").update(await readFile(new URL("../public/runtime-worker.js", import.meta.url))).digest("hex")}`;
  const kernelDigest = await kernelHash();
  const { sdk, cleanup } = await loadSdk();
  const transcripts = {};
  try {
    for (const host of ["worker", "typescript", "codemirror", "monaco"]) {
      const transport = new NodeKernelTransport();
      const client = host === "worker" ? rawClient(transport) : new sdk.TextabanaKernelClient(transport);
      const timers = new Set();
      const originalCommand = client.command.bind(client);
      client.command = (command, payload) => {
        let timer;
        return Promise.race([originalCommand(command, payload), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Host ${host} timed out: ${command}`)), 15000); timers.add(timer);
        })]).finally(() => { clearTimeout(timer); timers.delete(timer); });
      };
      const transcript = [];
      try {
        for (const fixture of suite.cases) {
          let response;
          try {
            if (typeof fixture.before === "string" && host === "codemirror") {
              const { EditorState } = await import("@codemirror/state");
              const state = EditorState.create({ doc: fixture.before });
              const changes = fixture.payload.changes.map(({ range, insert }) => ({ from: Array.from(fixture.before).slice(0, range.from).join("").length, to: Array.from(fixture.before).slice(0, range.to).join("").length, insert }));
              const transaction = state.update({ changes });
              await sdk.codeMirrorTextabanaBinding(client, "fixture", () => fixture.payload.baseRevision, (value) => { response = value; })({ docChanged: transaction.docChanged, startState: state, changes: transaction.changes });
            } else if (typeof fixture.before === "string" && host === "monaco") {
              response = await sdk.applyMonacoChanges(client, "fixture", fixture.payload.baseRevision, { getValue: () => fixture.before }, fixture.payload.changes.map(({ range, insert }) => {
                const start = Array.from(fixture.before).slice(0, range.from).join("").length;
                return { rangeOffset: start, rangeLength: Array.from(fixture.before).slice(range.from, range.to).join("").length, text: insert };
              }));
            } else response = await client.command(fixture.command, fixture.payload);
          } catch (error) { if (!error.response) throw error; response = error.response; }
          transcript.push({ id: fixture.id, actual: project(response) });
        }
      } finally { for (const timer of timers) clearTimeout(timer); client.dispose(); await transport.close(); }
      transcripts[host] = transcript;
    }
    transcripts.python = (await pythonHost()).map(({ id, response }) => ({ id, actual: project(response) }));
  } finally { await cleanup(); }
  const checks = Object.entries(transcripts).flatMap(([host, transcript]) => suite.cases.map((fixture, index) => {
    const actual = transcript[index]?.actual || {};
    const passed = transcript.length === suite.cases.length && transcript[index]?.id === fixture.id && Object.entries(fixture.expect).every(([key, value]) => Object.hasOwn(actual, key) && canonicalize(actual[key]) === canonicalize(value)) && canonicalize(actual) === canonicalize(transcripts.worker[index].actual);
    return { host, caseId: fixture.id, status: passed ? "passed" : "failed", expected: fixture.expect, actual };
  }));
  if (kernelDigest !== await kernelHash()) throw new Error("Kernel bytes changed during conformance run.");
  return {
    schema: "textabana.external-report/v1", profile: suite.profile, suiteVersion: suite.version,
    suiteDigest: await canonicalDigest(suite), kernelDigest,
    serialization: "RFC8785", projection: projectionFields, hosts: Object.keys(transcripts), checks,
    status: checks.every((item) => item.status === "passed") ? "passed" : "failed",
    claim: { scope: "cross-host-js-kernel", canonicalRuntime: false, independentImplementations: false, fullProfileConformance: false },
  };
}
