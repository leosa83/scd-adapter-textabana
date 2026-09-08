#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { canonicalize, canonicalDigest, parseStrictJson } from "../runtime/canonical-json.js";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient, runHostSuite } from "../conformance/host-runner.mjs";
import { signReport, verifyReport } from "../conformance/report-signing.mjs";
import { verifyRegistry } from "../conformance/registry.mjs";
import { verifySemanticBundle } from "../runtime/semantic-identity.js";
import { runSemanticSuite } from "../conformance/semantic-runner.mjs";
import { runContractSuite } from "../conformance/contract-runner.mjs";
import { runTextCoreSuite } from "../conformance/text-core-runner.mjs";
import { runChannelCoreSuite } from "../conformance/channel-core-runner.mjs";
import { runScopedTextSuite } from "../conformance/scoped-text-runner.mjs";

const [command, filename, keyfile] = process.argv.slice(2);
const output = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const json = async (path) => parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(path)));

async function serve() {
  const transport = new NodeKernelTransport();
  const pending = new Set();
  let ended = false;
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  transport.addEventListener("message", ({ data }) => {
    if (data.type === "transport-error" && !data.requestId) {
      for (const requestId of pending) output({ ...data, requestId });
      pending.clear(); process.exitCode = 1; lines.close(); process.stdin.destroy();
      void transport.close();
      return;
    }
    output(data);
    if (data.requestId) pending.delete(data.requestId);
    if (ended && !pending.size) void transport.close();
  });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = parseStrictJson(line);
        if (!message || typeof message !== "object" || typeof message.requestId !== "string" || !message.requestId || pending.has(message.requestId)) throw new Error("A unique requestId is required.");
        if (!["open", "change", "analyze", "subscribe", "credit", "cache-export", "cache-import", "run", "cancel"].includes(message.type)) throw new Error("Unknown kernel command.");
        pending.add(message.requestId);
        try { transport.postMessage(message); }
        catch (error) { pending.delete(message.requestId); throw error; }
      } catch (error) { output({ type: "transport-error", ok: false, requestId: message?.requestId ?? null, error: { message: error.message } }); }
    }
  } finally { ended = true; if (!pending.size) await transport.close(); }
}

async function main() {
  if (command === "serve") return serve();
  if (command === "canonical") return process.stdout.write(`${canonicalize(await json(filename))}\n`);
  if (command === "digest") return output({ algorithm: "SHA-256", serialization: "RFC8785", digest: await canonicalDigest(await json(filename)), canonicalRuntime: false });
  if (command === "conformance") {
    const report = await runHostSuite(); output(report); if (report.status !== "passed") process.exitCode = 1; return;
  }
  if (command === "conformance-semantic") {
    const report = await runSemanticSuite(); output(report); if (report.status !== "passed") process.exitCode = 1; return;
  }
  if (command === "conformance-contract") {
    const report = await runContractSuite(); output(report); if (report.status !== "passed") process.exitCode = 1; return;
  }
  if (command === "conformance-text-core") {
    const report = await runTextCoreSuite(); output(report); if (report.status !== "passed") process.exitCode = 1; return;
  }
  if (command === "conformance-scoped-text") {
    const report = await runScopedTextSuite(); output(report); if (report.status !== "passed") process.exitCode = 1; return;
  }
  if (command === "conformance-channel-core") {
    const report = await runChannelCoreSuite(); output(report); if (report.status !== "passed") process.exitCode = 1; return;
  }
  if (command === "verify-identity") return output(await verifySemanticBundle(await json(filename)));
  if (command === "sign") return output(await signReport(await json(filename), await readFile(keyfile, "utf8")));
  if (command === "verify") return output(await verifyReport(await json(filename), await readFile(keyfile, "utf8")));
  if (command === "registry-check") return output(await verifyRegistry(filename));
  if (command === "run" || command === "analyze" || command === "identify") {
    const transport = new NodeKernelTransport(); const client = rawClient(transport);
    try {
      const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(filename));
      await client.command("open", { document: { documentId: "cli", path: filename, source, documentRevision: 1 } });
      const configuration = keyfile ? await json(keyfile) : {};
      const response = await client.command(command === "identify" ? "run" : command, { ...configuration, documentId: "cli", documentRevision: 1, runId: 1,
        ...(command === "identify" ? { options: { ...configuration.options, semanticIdentity: true } } : {}) });
      output(command === "identify" ? response.semanticIdentity ?? { error: response.error, diagnostics: response.diagnostics } : response); if (!response.ok || response.analysis?.executable === false) process.exitCode = 1;
    } finally { client.dispose(); await transport.close(); }
    return;
  }
  if (command && command !== "help" && command !== "--help") throw new Error(`Unknown command: ${command}`);
  process.stdout.write("Textabana CLI\n  run <document.md> [modules-and-options.json]\n  analyze <document.md>\n  identify <document.md> [modules-and-options.json]\n  verify-identity <bundle.json>\n  serve  (JSONL kernel transport)\n  canonical <input.json>\n  digest <input.json>\n  conformance\n  conformance-semantic\n  conformance-contract\n  conformance-text-core\n  conformance-scoped-text\n  conformance-channel-core\n  sign <report.json> <ed25519-private.pem>\n  verify <signed-report.json> <trusted-public.pem>\n  registry-check <registry.json>\n");
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
