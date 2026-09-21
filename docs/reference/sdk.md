# Host SDK and transport reference

This reference describes the source APIs through sprint 5.13. The [integration guide](../INTEGRATION_GUIDE.md) provides the complete editor loop and runnable examples. These sources are consumed from the repository; separate npm and PyPI distributions are planned.

The clients use the same JavaScript kernel and `textabana.editor-kernel/lab-v1` protocol. The Python client is a host binding; the independent Python conformance evaluators implement narrower profiles. This reference documents current behavior. The [runtime protocol](specification/runtime-protocol.md), [Editor Kernel requirements](specification/editor-kernel.md) and versioned profiles define their respective contracts.

## Ownership and response boundaries

| Owner | Responsibility |
|---|---|
| Host | Editor/model, transport, accepted revision, request scheduling, error presentation and persistent storage |
| Client | Request correlation and local metadata listeners |
| Kernel | Document snapshots, revision validation, execution, atomic result publication and metadata baselines |

Text changes use half-open `[from, to)` ranges in Unicode code points of the declared base revision. Supply sorted, non-overlapping changes. Advance the host's revision from the successful response, never from the act of sending a request. Editor bindings convert UTF-16 offsets using the pre-edit source.

An accepted change acknowledges the document update. A successful run publishes a result for its captured revision. Check `resultEnvelope.run.committed` before treating output as current. Cancellation is cooperative; a cancellation acknowledgement does not establish that the run was cancelled.

## TypeScript client

Import from [`sdk/typescript/index.ts`](../../sdk/typescript/index.ts). The implementations are [`client.ts`](../../sdk/typescript/client.ts) and [`protocol.ts`](../../sdk/typescript/protocol.ts).

```ts
new TextabanaKernelClient(transport: KernelTransport)
```

`KernelTransport` provides `postMessage(message: unknown): void`, plus `addEventListener` and `removeEventListener` for `"message"` events carrying `MessageEvent.data`. A browser Worker satisfies this shape. The constructor installs one message listener; it does not create the transport.

| Method | Inputs and result |
|---|---|
| `command(command, payload = {})` | `command: KernelCommand`, `payload: Record<string, unknown>`. Infers `Promise<CommandResponses[C]>` from the command. The explicit `command<T>` overload remains an unchecked caller assertion. |
| `open(documentId, path, source)` | Three strings; requests `documentRevision: 1`. Returns `Promise<OpenResponse>`. |
| `change(documentId, baseRevision, changes)` | String, number, `TextChange[]`; sends `coordinateUnit: "unicode-code-point"`. Returns `Promise<ChangeResponse>`. |
| `analyze(documentId, documentRevision)` | String and number; read-only analysis without module execution. Returns `Promise<AnalyzeResponse>`. |
| `run(documentId, documentRevision, runId, modules, options = {})` | String, number, number, `ModulePackage[]` or record array, and options record with optional `moduleLock`/`capabilityGrants`. Returns `Promise<RunResponse>`. |
| `subscribe(documentId, subscriptionId, channels = ["*"], initialCredit = 0)` | Two strings, string array and number; selects `delivery: "stream"`. Returns `Promise<SubscribeResponse>`. |
| `credit(subscriptionId, credit)` | String and number; adds metadata delivery credit. Returns `Promise<CreditResponse>`. |
| `exportCache(documentId)` | String; requests a cache checkpoint. Returns `Promise<CacheExportResponse>`. The host owns storage. |
| `importCache(documentId, checkpoint)` | String and `unknown`; the kernel validates the checkpoint before reuse. Returns `Promise<CacheImportResponse>`. |
| `cancel(runId)` | Number; directly posts an uncorrelated cancellation request. Returns `void`. |
| `onChunk(subscriptionId, listener)` | String and `(chunk: MetadataChunk) => void`; returns a function that removes this local listener. It does not cancel the kernel subscription. |
| `dispose()` | Detaches the message listener, rejects pending commands and clears local listeners. Returns `void`; leaves the transport open. |

`KernelCommand` is the union `open`, `change`, `analyze`, `subscribe`, `credit`, `cache-export`, `cache-import`, `run`, `cancel`. The lower-level `command` method allows additional payload fields supported by the kernel, such as `replaceSession` for `open`, or correlated `cancel`. Each command gets a generated `sdk:<command>:<sequence>` request ID unless a truthy `payload.requestId` supplies one. Duplicate in-flight IDs are rejected. A caller-supplied `type` cannot override the command argument.

Register `onChunk` before requesting delivery. `subscribe` selects metadata after commit; it does not enable continuous stage-output streaming. A delivery credit unit is one metadata chunk. The kernel, rather than this client, validates credit and subscription fields.

### Response type ownership

[`responses.ts`](../../sdk/typescript/responses.ts) owns command-specific replies, failures, document/change/subscription/cache records and metadata chunks. [`runtime-types.ts`](../../sdk/typescript/runtime-types.ts) owns shared runtime, result-envelope, plan, channel and adapter data shapes. The app re-exports these types; the SDK never imports application code. Narrow `MetadataChunk.collection` to obtain the matching `value` shape. Narrow `KernelFailure.type` to distinguish a protocol error object from a failed run's error string.

Promise convenience methods resolve successful replies only. Use `command("cancel", { runId })` for a typed acknowledgement; `cancel(runId)` remains fire-and-forget. Type inference does not change transport messages, acceptance order or error behavior. The [standalone type consumer](../../tests/types/sdk-consumer.ts) checks all nine commands, editor bindings, narrowing and deliberately invalid property access without app or Cloudflare dependencies.

### Failures and shutdown

| Condition | Client behavior |
|---|---|
| Correlated response has `ok: false` | Rejects with `KernelCommandError`; its `response: KernelFailure` retains the original response and diagnostics. |
| Uncorrelated `transport-error` | Rejects all pending requests with `KernelCommandError`, then disposes the client. |
| `postMessage` throws | Removes the affected pending request and rejects with the thrown error. |
| Duplicate in-flight ID or command after disposal | Rejects with `Error`. |
| Explicit disposal | Rejects pending requests with `Error("Textabana client disposed.")`. |

The client provides no timeout or automatic retry. An `ok: false` response is a rejected promise, so inspect `KernelCommandError.response` in the catch path. Other correlated responses resolve as received; there is no full response-schema validator yet. The SDK now exports all nine successful command response types, discriminated protocol/run/transport failures, metadata chunks and shared runtime data types. Open extension values such as user channel payloads remain `unknown`; these declarations are not runtime validators.

Dispose the client before terminating the Worker or closing a Node transport. Stop calling helpers after disposal: `cancel` directly invokes the transport, and `onChunk` only changes local listeners; those helpers do not use the disposed guard in `command`.

### Module inputs

`TextChange` contains `range: { from: number; to: number }` and `insert: string`. `ModulePackage` contains `path`, exact `content`, a `sha256:` digest and `ModuleManifest`. The lab manifest identifies namespace, version, entrypoint, digest, function declarations and capabilities. `ModuleLock.packages` pins namespace/version/entrypoint/digest tuples. See the [module example](../INTEGRATION_GUIDE.md#module-manifest-and-lock) and [module admission profile](../../MODULE_ADMISSION_PROFILE.md) for validation order and supported version syntax. Manifests and capability grants do not provide JavaScript isolation.

## Editor bindings

The bindings accept minimal structural interfaces; they neither instantiate an editor nor own its document state.

| Binding | Contract |
|---|---|
| [`codeMirrorTextabanaBinding(client, documentId, revision, accepted)`](../../sdk/typescript/codemirror.ts) | Returns a listener for `CodeMirrorUpdateLike`. Reads `startState.doc` and change ranges before the edit, converts offsets to code points, and queues acknowledged changes. `revision: () => number` is evaluated when each queued request starts. `accepted: (response: ChangeResponse) => void` must update the host's revision before the next request. |
| [`applyMonacoChanges(client, documentId, revision, modelBefore, changes)`](../../sdk/typescript/monaco.ts) | Reads `modelBefore.getValue()`, converts each `rangeOffset`/`rangeLength` from UTF-16, sorts the patches and returns `Promise<ChangeResponse>` from `client.change`. Pass the pre-edit snapshot, not the already-updated live model. The host serializes calls and updates revisions. |

The CodeMirror listener returns `undefined` for updates without document changes; otherwise it returns `Promise<void>`. A rejected request or throwing `accepted` callback leaves its queue rejected. Resynchronize the document and create a new binding before submitting further edits. The Monaco helper has no internal queue or recovery state.

## Node transport and JSONL

[`NodeKernelTransport`](../../sdk/node/transport.mjs) creates a worker thread that loads the generated `public/runtime-worker.js` through [`worker-bridge.mjs`](../../sdk/node/worker-bridge.mjs). Run `npm run runtime:build` before using it. It implements the message transport shape and adds `close(): Promise<void>`.

Worker messages are forwarded as `{ data }` events. Worker errors and unexpected exits produce an uncorrelated `transport-error`. Module logging goes to the host's stderr. `postMessage` throws after closure. `close` intentionally terminates the worker and clears listeners; it does not acknowledge pending commands, so dispose attached clients first. This worker executes trusted module code and is not a security sandbox.

[`node cli/textabana.mjs serve`](../../cli/textabana.mjs) exposes the same kernel over JSONL:

- Send one JSON command per nonblank stdin line. Each command requires a nonempty string `requestId`, unique among pending commands, and one of the nine supported command types.
- Read one response or metadata message per stdout line. Correlate replies by `requestId` and metadata chunks by `subscriptionId`; do not assume that the next line is the reply to the latest command.
- Malformed JSON, invalid IDs and unsupported commands produce `transport-error` with `ok: false`. The available request ID is returned, or `null` when unavailable.
- On stdin EOF, the process waits for pending replies before closing the worker. On an uncorrelated transport failure, it emits an error per pending request, closes input/transport and sets exit status 1.

The host owns process lifetime, stderr handling and any timeout policy. See the [Python host example](../../examples/integration/python-host.py) for a complete subprocess loop.

## Python client and notebook projection

Import `TextabanaClient` and `jupyter_mime_bundle` from [`sdk.python`](../../sdk/python/__init__.py). The implementation is [`textabana_client.py`](../../sdk/python/textabana_client.py).

```python
client = TextabanaClient(send_message)
```

`send_message` receives a mapping and returns `None`. It must serialize or dispatch the message; the client opens no subprocess or socket. Feed decoded incoming mappings into `receive(message)`.

| Method | Result and behavior |
|---|---|
| `command(command, payload=None, callback=None)` | Returns a generated `python:<command>:<sequence>` ID synchronously. Copies the payload, overrides `type`/`requestId` and sends it. Stores the optional callback until a correlated response arrives. |
| `open(document_id, path, source, callback=None)` | Requests revision 1 and returns the request ID. |
| `change(document_id, base_revision, changes, callback=None)` | Materializes the iterable of change mappings, declares code-point coordinates and returns the request ID. |
| `run(document_id, revision, run_id, modules, options=None, callback=None)` | Materializes modules, copies options and returns the request ID. |
| `receive(message)` | Delivers metadata chunks to `streams[subscriptionId]` listeners, or a correlated reply to its pending callback. Returns `None`. |
| `dispose()` | Clears listeners and pending callbacks, invoking each pending callback with `ok: false` and error code `HOST-CLOSED`. Later commands raise `RuntimeError`. Returns `None`; leaves the host transport open. |

Use `command` for analysis, subscriptions, credit, cache operations and cancellation. To receive chunks, the host manages callback lists in `client.streams[subscription_id]`. Removing a local callback does not remove the kernel subscription.

Unlike the TypeScript promise API, failed replies are passed unchanged to Python callbacks. Check `ok` there. Synchronous send exceptions are re-raised after removing the pending callback. An uncorrelated transport error does not settle pending callbacks automatically: the host must handle transport death and call `dispose`.

`jupyter_mime_bundle(run_result)` requires a truthy `ok` and `resultEnvelope.run.committed`, otherwise it raises `ValueError`. It returns `text/plain`, `text/markdown` and `application/vnd.textabana.result+json` alternatives. Text values use the string form of `output`; the JSON alternative refers to the supplied result envelope. The helper sends no Jupyter messages and does not implement a Jupyter kernel or the full notebook format.

## Verification

[`host-sdk.test.mjs`](../../tests/host-sdk.test.mjs) checks SDK compilation and host/module behavior. [`documentation.test.mjs`](../../tests/documentation.test.mjs) executes the Node editor loop, Python host/MIME example and CLI artifact workflow. These are evidence for the exercised paths; the broader protocol and profile boundaries remain explicit in the linked contracts.
