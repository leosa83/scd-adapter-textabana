# Kernel implementation boundaries

These modules implement the existing lab protocol. Internal exports are source-level boundaries, not separately published packages. The [architecture map](../docs/architecture.md), [SDK reference](../docs/reference/sdk.md) and [versioned profile contracts](../conformance/README.md) describe their different responsibilities and authority.

## State and operations

| Boundary | Inputs, outputs and ownership |
|---|---|
| `createEditorKernel({ postMessage, isRunBusy })` | Creates isolated document, parser-cache and subscription maps. The transport callback receives committed metadata chunks. The busy callback reads the dispatcher's active/queued state. No global Worker or application dependency. |
| `openEditorDocument`, `applyEditorChange`, `analyzeEditorDocument` | Consume existing protocol payloads and return response bodies. Changes validate against one base snapshot before mutation. Analysis is read-only and may reuse the instance's parser cache. |
| `captureEditorRun` | Validates the requested revision and captures source, revision, cache baseline and subscription IDs before queueing execution. Later edits do not alter this captured source. |
| `completeEditorRun` | Receives the captured snapshot, terminal result and cache transaction. Advances document/delta baselines only when the run committed and the session/head still match. Cache acceptance also requires the existing post-commit gate. |
| `subscribeEditorDocument`, `creditEditorSubscription` | Own subscription filters, cursor, credit and chunk queues in the editor instance. Stream delivery happens after commit. |
| `exportEditorCache`, `importEditorCache` | Produce or validate host-carried checkpoints. Import rejects while any run is active or queued. The host owns storage; this is not persistent document recovery. |
| `verifyModulePackages(modules, options)` | Asynchronously checks every transported secure package before any startup code. Returns the admitted modules or throws the existing diagnostic-bearing error. No module loading or document mutation. |
| `verifyLoadedModuleContracts(modules, registry)` | Compares actual loaded exports with manifest function declarations before transformation. Admission and export validation remain distinct gates. |
| `createModuleLoader()` | Owns one trusted JavaScript compilation cache. `loadModule` resolves includes into caller-owned registry/loaded/loading collections. `clear` is called at the start of every execution, preserving fresh module closure state. |
| `createChannelBus(options)` | Owns a run's declarations, validators, events, sequence, anchors and source mappings. Inline schemas compile at first declaration; Ajv payload validation, serialization, cancellation and resource checks execute before publication. |
| `compileChannelSchema`, `validateChannelPayload` | Enforce the [versioned channel policy](../docs/reference/channel-schemas.md). Each descriptor has an isolated Ajv2020 registry. Admission rejects unsupported keywords; validation returns a detached JSON value without coercion or mutation. |
| `buildResultEnvelope(options)` | Builds a committed or rolled-back result from supplied run data. Failed/cancelled results expose no durable domain output. It does not mutate editor history. |
| `runAdapters(result, requestedIds, capabilities)` | Projects a supplied committed result, records unsupported/failed adapters and checks result immutability. Does not execute user modules. |
| `buildCapabilities`, `buildConformanceReport` | Build bounded lab disclosures and fixture-bound evidence. They do not read GitHub CI, certify standards support or replace independent profile runners. |

The dispatcher in `worker-entry.js` owns the active/cancelled/queued run sets, queue promise and run-instance sequence. It catches document protocol errors into `kernel-response` failures, captures accepted run inputs and coordinates parsing, admission, module loading, graph execution, result construction, adapters, conformance and editor completion. Cooperative cancellation and the existing synchronous-work limitations are unchanged.

## Dependency and identity rules

Runtime modules do not import the app or Worker dispatcher. Editor and loader state is created explicitly; a second instance cannot see the first instance's documents, subscriptions or module closures. Per-run channel state stays inside its bus. Shared value, reference and error helpers hold no mutable session state.

`lab-values.js` preserves the existing FNV lab hashes and normalization. It is not RFC 8785 canonicalization; `canonical-json.js` and the SHA-256 semantic artifact modules remain separate. `result-references.js` normalizes operational references for result/adapter identity without importing adapter implementations.

Package checks still precede all entrypoints, export checks precede transforms, and channel append order follows the existing execution plan. Result construction precedes adapters and editor publication. A source move must not change any of those ordering relationships. The loader executes trusted JavaScript; moving it into a module does not create a sandbox.

## Verification and change policy

`tests/kernel-boundaries.test.mjs` checks state isolation, parser reuse, subscription separation, the busy import guard and loader reset. Existing editor, channel, scheduler, cache, adapter and independent profile tests cover observable protocol and result behavior. Refresh source-bound reports after rebuilding `public/runtime-worker.js`; preserve frozen expected outcomes and profile claims.

Sprint 5.14A tightens channel validation and translates selected kernel diagnostics under an explicit [compatibility record](../docs/compatibility-5.14.md). Parser diagnostics and frozen profile bytes remain unchanged because they participate in canonical artifact identity. Runtime JavaScript is behavior-tested; the TypeScript gate covers authored TypeScript/TSX, including shared SDK response types, rather than claiming complete static checking of this JavaScript engine.
