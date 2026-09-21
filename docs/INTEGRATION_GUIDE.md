# Integrate Textabana from source

This guide covers `textabana.editor-kernel/lab-v1`, module packages `lab-v1` and the runtime delivered through sprint 5.9. SDK sources live in this repository; no separately published npm or PyPI package is assumed. Both host clients send messages to the same JavaScript kernel. The standalone Python reference evaluators implement separate, narrower conformance profiles.

## Run the complete examples

For exact method inputs, response boundaries, ownership and failure behavior, use the [host SDK and transport reference](reference/sdk.md).

From the repository root, after installing locked dependencies, with Node as specified in `package.json` and Python 3:

```sh
npm run runtime:build
node examples/integration/editor-loop.mjs
python3 examples/integration/python-host.py
```

The Node example bundles the actual TypeScript client using the existing esbuild dependency. It opens a document, analyzes it, subscribes, runs, grants credit, changes the source and runs again. It checks rejection of a stale revision and a missing grant, and closes the client and transport on success or failure. Expected final output is revision 2, `HALLÅ 🌊\n`, one delivered metadata chunk and a verified artifact bundle. The Swedish text is intentional Unicode example data.

The Python example uses the actual Python client over JSONL and produces three MIME alternatives for `HEJ 🌊\n`. It does not start a Jupyter kernel.

## Module, manifest and lock

The runnable sources are the [module](../examples/integration/module.js), [document](../examples/integration/document.md) and [package builder](../examples/integration/package.mjs). The builder hashes the exact transported UTF-8 bytes and creates a complete `modules` array and `options`.

```sh
mkdir -p outputs/docs
node examples/integration/package.mjs > outputs/docs/modules.json
node cli/textabana.mjs run examples/integration/document.md outputs/docs/modules.json > outputs/docs/run.json
node cli/textabana.mjs identify examples/integration/document.md outputs/docs/modules.json > outputs/docs/identity.json
node cli/textabana.mjs verify-identity outputs/docs/identity.json
```

`documented_upper` returns uppercase text and emits a `docs.metrics` payload containing the Unicode code-point count. One invocation creates both outputs. Its `channel:docs.metrics` effect means it is not a pure cache candidate.

| Part | Binding |
|---|---|
| Transport | `path`, exact `content`, `digest`, `manifest` |
| Manifest | `textabana.module-manifest/lab-v1`, namespace, version, entrypoint, digest, functions, capabilities |
| Lock | `options.moduleLock.schema = textabana.module-lock/lab-v1`; `packages` pins the same namespace/version, entrypoint and digest |
| Grant | `options.capabilityGrants` includes `channel:docs.metrics` |
| Function declaration | `state=run`, `determinism=deterministic`, `effects=["channel:docs.metrics"]` matches the actual export |

All transported secure packages are checked before any entrypoint executes, including unused packages and later entries. The syntax gate also runs before module startup. Actual exports are compared with their manifests after loading and before transformation. Admission success does not guarantee export validation or execution success, and does not provide a JavaScript sandbox. Legacy packages without a lock, manifest or digest use a separate older path. Exact rules and failure precedence are specified in [MODULE_ADMISSION_PROFILE.md](../MODULE_ADMISSION_PROFILE.md) and [MODULE_GATE_PROFILE.md](../MODULE_GATE_PROFILE.md). The lab's version grammar is not full SemVer.

Includes resolve relative to the document's protocol path. All examples therefore open `examples/integration/document.md` and transport the module as `examples/integration/module.js`. The authored `./module.js` include must resolve to the same path as the manifest and lock.

## TypeScript client in a browser host

[TextabanaKernelClient](../sdk/typescript/client.ts) accepts a transport with `postMessage`, `addEventListener` and `removeEventListener`. A browser Worker can be used directly when the host serves the built `public/runtime-worker.js`. In this illustrative JavaScript fragment, the host loads `source` and the package builder's `modules`/`options` before opening the document:

```js
import { TextabanaKernelClient } from "./sdk/typescript/client";
const worker = new Worker("/runtime-worker.js");
const client = new TextabanaKernelClient(worker);
// Load source and pkg before entering this fragment.
try {
  const opened = await client.open("my-doc", "examples/integration/document.md", source);
  let revision = opened.document.documentRevision;
  const analyzed = await client.analyze("my-doc", revision);
  // Run only when analyzed.analysis.executable is true.
  const result = await client.run("my-doc", revision, 1, pkg.modules, pkg.options);
  // Inspect result.resultEnvelope.run.committed and diagnostics.
  const changed = await client.change("my-doc", revision, [
    { range: { from: 0, to: 0 }, insert: "Heading\n" },
  ]);
  revision = changed.document.documentRevision;
} finally {
  client.dispose();
  worker.terminate();
}
```

The standalone Node example is the complete, automatically exercised integration. SDK convenience methods and literal `command` calls infer their successful response types. An explicit `command<T>` remains an unchecked assertion for compatibility. Validate untrusted responses at the host boundary; static types do not perform runtime validation. The SDK reference describes the typed failure and metadata unions.

## Methods, errors and revisions

| Method | Observable contract |
|---|---|
| `open(id, path, source)` | Await `response.document.documentRevision`. Identical opens can be idempotent. Reset through `command("open", {document: ..., replaceSession: true})`. |
| `change(id, baseRevision, changes)` | Ranges use one base snapshot, are sorted and non-overlapping, and count Unicode code points. Advance the local revision from the response. |
| `analyze(id, revision)` | Read-only parser products, partial IR and diagnostics for incomplete source. No stages execute. |
| `run(id, revision, runId, modules, options)` | Captures the exact revision. Inspect `resultEnvelope.run.committed` and diagnostics, not only the output text. |
| `subscribe(id, subscriptionId, channels, initialCredit)` | The SDK selects stream delivery. Zero credit means no chunks are delivered. Register `onChunk` before running. |
| `credit(subscriptionId, n)` | Adds 1–1024 delivery units. A unit is one metadata chunk, not one event or an entire revision. Inspect cursor/sequence/total/done. |
| `exportCache` / `importCache` | Explicit host checkpoint. The host stores it; imports require no active or queued runs. |
| `cancel(runId)` | The TypeScript helper sends without awaiting acknowledgement. Observe the active run's terminal outcome; cancellation is cooperative. |
| `dispose()` | Removes listeners and rejects pending client calls. Does not terminate the Worker or close kernel documents. The host closes the transport separately. |

`KernelCommandError.response` contains the correlated error response. Protocol errors may use `error.code`; execution failures use `diagnostics`. After a stale revision, resynchronize the document before further changes. The TypeScript client has no general built-in request timeout; the host owns timeout, transport failure and recovery policy.

Stream delivery occurs **after commit**. Credit controls delivery rate but does not itself bound the producer's queue. There is no general queue/memory limit, persistent cursor, unsubscribe command or close-document command. The function returned by `onChunk` removes a local listener; it does not remove the kernel subscription. Continuous stage streaming remains planned.

## CodeMirror and Monaco

[codeMirrorTextabanaBinding](../sdk/typescript/codemirror.ts) takes the client, document ID, a function returning the latest accepted revision and a callback for accepted responses. Connect it to the host's update listener, advance the revision in the callback and handle rejected promises. A rejected change stops its queue; resynchronize and create a new binding. It does not construct an editor for the host.

[applyMonacoChanges](../sdk/typescript/monaco.ts) requires the model **before** the change and each change's `rangeOffset`, `rangeLength` and `text`. Do not pass the already-updated model as the base. Serialize changes against accepted revisions. Both bindings translate UTF-16 offsets into code points; neither implements LSP or OT/CRDT.

## Python, MIME and verification

The [Python client](../sdk/python/textabana_client.py) uses callbacks: the host forwards incoming messages to `receive` and handles `ok=false` in callbacks. Use `command` for other protocol operations. The [complete Python example](../examples/integration/python-host.py) demonstrates a local JSONL subprocess and cleanup on POSIX. Other hosts can supply their own transport. This is not a separate Python-equivalent implementation of the full language.

`jupyter_mime_bundle` accepts only committed results. A real Jupyter host can send its output as `display_data`; the helper does not implement Messaging, kernels or nbformat.

`verify-identity` checks schema, references and bundle integrity. It does not rerun transformations. See the [artifact contract](../SEMANTIC_CONTRACT.md), [conformance commands](../conformance/README.md) and [standards assessment](STANDARDS_DIRECTION.md) before claiming full schema, notebook, data or provenance conformance.
