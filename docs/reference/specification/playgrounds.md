# Playground Labs

Language & Scope, Editor Kernel, Editor Metadata, Channel & Result, Data & Lineage, Notebook Interop, Annotation & Review and Conformance use the same selected source and run. The Language view separates Parser, pre-transform Graph and observed Execution trace: partial CST/AST/IR can be displayed when the compile gate blocks execution, while a valid run shows the whole graph even if execution is subsequently interrupted.

**01 · Language & Scope Lab**

Lossless CST, AST, typed IR, recovery, source spans, scope segments, pre-transform DAG, advisory invalidation, scheduler waves/run budget, actual execution report, a plan-ordered `planNodeRef`-bound execution trace and render.

Live · verified-stage-cache · bounded async branch subset

**02 · Editor Kernel Lab**

Open document, revision-guarded ChangeSet, captured run snapshot, subscription-filtered metadata delta and anchor continuity.

Live · editor-kernel-revisions · editor-kernel/1 subset

**03 · Editor Metadata Lab**

system.out, metadata gutter, row/line, Anchor and SourceMap in the current revision.

Live · editor-revision

**04 · Channel & Result Lab**

ChannelDescriptors, strict mode, global event timeline, snapshots and atomic Result JSON.

Live · channel-fanout + failed-run

**05 · Data & Lineage Lab**

JSON table, schema events, stable recordId, deterministic inner join, derived aggregation and cell/record lineage.

Live · data-join · data/1 playground-subset

**06 · Notebook Interop Lab**

Whole snapshot, stable cell ids, three MIME representations, explicit state and digest-based stale detection.

Live · notebook-snapshot · notebook/1 playground-subset

**07 · Annotation & AI Review Lab**

Immutable AI candidates, confidence method, append-only human review, revision chain, Anchor targets and W3C/Label Studio export.

Live · annotation-review · annotation/1 playground-subset

**08 · Conformance Lab**

Profile selection, capability response, stage gates, normalized golden snapshot, structural diff, exact negative cases and cooperative cancellation.

Live · conformance-golden · report/lab-v1

### Shared playground contract

<a id="PLAYGROUND-001"></a>

> **PLAYGROUND-001** All labs SHOULD use the same small document, module manifest, input data and expected result snapshot so that the relationship between views is verifiable.

<a id="PLAYGROUND-002"></a>

> **PLAYGROUND-002** Every lab MUST visually distinguish authored source, compiled semantics, runtime events and adapter projection.

<a id="PLAYGROUND-003"></a>

> **PLAYGROUND-003** A function that the UI does not yet implement MUST be shown as planned/unsupported and cannot be simulated as a conforming result.

<a id="PLAYGROUND-004"></a>

> **PLAYGROUND-004** Golden fixtures are to be exportable and runnable headlessly in the same conformance suite that the UI visualizes.
