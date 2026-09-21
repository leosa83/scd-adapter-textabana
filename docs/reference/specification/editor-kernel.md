# Editor Kernel

Editor Kernel is a host-neutral control plane around the parser, compiler and runtime. The executable Worker uses `textabana.editor-kernel/lab-v1`. An editor can analyze an incomplete revision without execution, select the exact valid revision to run and subscribe to committed metadata changes.

**Host** — CodeMirror · notebook · pipeline

**Editor Kernel** — open · change · analyze · subscribe · run · cancel

**Atomic delivery** — Result · metadata delta · anchor continuity

### Editor Kernel commands

| Command | Input gate | Observable outcome |
| --- | --- | --- |
| `open` | documentId, path and source | Immutable snapshot at documentRevision 1. |
| `change` | baseRevision and sorted ChangeSet ranges | New document head or atomic protocol error. |
| `analyze` | documentId and optional exact revision | CST, AST, partial typed IR and diagnostics; no modules or stages run. |
| `subscribe` | Exact channel names or * | Snapshot-then-delta cursor for the selected delivery mode. |
| `credit` | subscriptionId and positive credit | Resumes a bounded post-commit metadata stream. |
| `cache-export / cache-import` | Digest-bound host checkpoint | Explicit cache persistence and session transport. |
| `run` | Exact documentRevision | Immutable run snapshot and atomic Result. |
| `cancel` | runId | Cooperative cancellation at declared boundaries. |

An ordinary idempotent `open` may return the session's current revision when document id, path and source already match. An intentional reset uses the playground flag `replaceSession: true`, creates a new session at revision 1 and makes late responses from the older session obsolete.

### ChangeSet — playground envelope

Executable lab subset · json

```json
{
  "type": "change",
  "schema": "textabana.change-set/lab-v1",
  "requestId": "request:17",
  "documentId": "doc:claims",
  "changeSetId": "change:client:42",
  "baseRevision": 11,
  "coordinateUnit": "unicode-code-point",
  "changes": [{ "range": { "from": 128, "to": 131 }, "insert": "ny" }]
}
```

**Document version**

Content identity. Undo can reproduce the same version at a later monotonic documentRevision.

**Document revision**

Session-local edit generation. It does not affect semantic Result identity.

**Published revision**

The latest head revision with a successful atomic run; failed and cancelled runs do not advance it.

**Metadata cursor**

Monotonic delivery position per subscription, separate from event sequence within a run.

<a id="EDITOR-KERNEL-001"></a>

> **EDITOR-KERNEL-001** Editor Kernel MUST be a control plane around the language and runtime. It cannot be callable as a document function or introduce hidden pipeline order.

<a id="EDITOR-KERNEL-002"></a>

> **EDITOR-KERNEL-002** Every accepted run MUST capture an immutable snapshot with the exact `documentId`, `documentRevision` and `documentVersion`. Later changes cannot alter this snapshot.

<a id="EDITOR-KERNEL-003"></a>

> **EDITOR-KERNEL-003** `system.out` and other channels are semantic output that can be subscribed to. They cannot carry `open`, `change` or other document lifecycle semantics.

<a id="DOCUMENT-001"></a>

> **DOCUMENT-001** Snapshot and monotonic revision are separate concepts. A no-op ChangeSet may return `unchanged` without creating a revision.

<a id="DOCUMENT-002"></a>

> **DOCUMENT-002** A failed or cancelled run MUST leave the last committed metadata baseline untouched. A historical result may be shown as stale but never as current for a newer head.

<a id="DOCUMENT-003"></a>

> **DOCUMENT-003** A host MUST advance its protocol head from the kernel's correlated `open` or `change` response. An optimistically assumed revision/version cannot be used as the basis for the next change or run.

<a id="ANALYZE-001"></a>

> **ANALYZE-001** `analyze` MUST be read-only, revision-bound and free from module initialization and stage effects. It MAY return partial IR with recovery even when the same snapshot cannot run.

<a id="CHANGE-001"></a>

> **CHANGE-001** All ranges in a ChangeSet MUST refer to the same base snapshot, be zero-based, half-open, sorted and non-overlapping, and be applied atomically.

<a id="CHANGE-002"></a>

> **CHANGE-002** Canonical change offsets count Unicode code points. UTF-16, line/column or editor-native coordinates MUST be converted by a host adapter before the protocol boundary; a foreign declared `coordinateUnit` MUST be rejected before mutation.

<a id="CHANGE-003"></a>

> **CHANGE-003** A stale revision or version, invalid range or overlap MUST produce a structured protocol error without source mutation or a semantic run.

<a id="SUBSCRIPTION-001"></a>

> **SUBSCRIPTION-001** A channel filter limits delivery only. It can never change the core result's channels, execution or adapter fan-out.

<a id="SUBSCRIPTION-002"></a>

> **SUBSCRIPTION-002** Every delta MUST state its basis, target and cursor. A consumer with a different basis must resynchronize instead of applying the delta.

<a id="DELTA-001"></a>

> **DELTA-001** A metadata delta is a deterministic post-commit comparison between immutable snapshots; it never mutates the previous `TextabanaResult`.

<a id="DELTA-002"></a>

> **DELTA-002** Cross-run matching MUST use a declared channel key or explicit domain identity, never run-local `eventId` or `sequence`. Non-unique identity cannot produce a false `moved` or `changed`.

<a id="DELTA-003"></a>

> **DELTA-003** `changed` means the same stable identity with changed semantics or payload; `moved` means a semantically equivalent payload with a new physical target. Payload changes take precedence.

<a id="DELTA-004"></a>

> **DELTA-004** Only a succeeded commit may publish durable `added`, `removed`, `changed` or `moved`. Failed and cancelled runs publish an empty `not-committed` delta and retain the baseline.

<a id="REANCHOR-001"></a>

> **REANCHOR-001** Anchor records are immutable and version-bound. Cross-revision continuity MUST be published as a separate transition with its method and outcome; `ambiguous` and `orphaned` remain unresolved.

### Independent forms of incrementality

| Capability | Meaning | Playground |
| --- | --- | --- |
| Incremental input | The host sends ChangeSets instead of replacing the entire document. | Implemented |
| Invalidation preview | Two pre-transform graphs are compared into direct, transitive, unchanged, added and removed without reusing output. | Advisory lab subset |
| Incremental stage execution | The editor session can reuse verified pure-stage output and overlap independent safe async branches. | Bounded lab subset |
| Parser/compiler reuse | Valid Lezer fragments are reused after ChangeSets and an exactly analyzed revision reuses its compiler snapshot; the graph is still built per run. | Bounded lab subset |
| Incremental delivery | The host receives semantic deltas and can select credit-bound post-commit streaming. | Implemented |

**Exact boundary of the executable subset**

The Worker keeps an in-memory document session, applies version-guarded Unicode patches and offers read-only `analyze` with a formal parser and local recovery. An exactly analyzed revision reuses its compiler snapshot; the next ChangeSet can reuse valid Lezer fragments. A deterministic ready-set scheduler may overlap independent, snapshotable effects-free stages asynchronously in the same Worker. The cache can be moved explicitly as a digest-bound host checkpoint, and committed metadata deltas can stream under credit-based backpressure. Multicore execution, continuous stage streaming, OT/CRDT, general structural re-anchoring, complete editor integrations and an LSP adapter, synchronous preemption and hard CPU/memory sandboxing are not implemented.
