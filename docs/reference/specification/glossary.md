# Glossary

### Domain terms

| Term | Definition |
| --- | --- |
| `SourceDocument` | Immutable, versioned text source with a logical identity and base URI. |
| `CST` | Lossless concrete syntax representation from Lezer; preserves lexemes and line endings without deciding domain execution. |
| `AST` | Normalized block tree with typed stages, literal nodes and recovery; interval events remain separately modeled. |
| `SourceSpan` | Zero-based, half-open Unicode code point range with one-based line and zero-based column projections. |
| `RecoveryNode` | Local representation of malformed or missing syntax. Always non-executable, but enables partial editor structure. |
| `Block` | Strictly nested function region whose complete pipeline runs before ambient inheritance. |
| Interval | Open, identifiable scope active over one or more text segments. |
| `Property` | Non-executable metadata on a Markdown AST unit. |
| `TextabanaIR` | Host-neutral semantic representation of the source snapshot. |
| `ExecutionPlan` | Executable, typed and capability-validated stage graph for a host. |
| `ExecutionGraph` | Pre-transform DAG with source, stage, merge and render nodes and explicit typed dependencies. |
| `Typed edge` | Directed value or control dependency with named ports, edge kind and deterministic order key. |
| `ExecutionTrace` | Observed sequence of stage resolutions in execution-step/lab-v2; functionInvoked distinguishes fresh invocation from cache materialization and every entry binds to the graph through planNodeRef. |
| `Invalidation preview` | Advisory, history-dependent comparison of a baseline graph and target graph; not a cache hit or execution. |
| `Cache eligibility / hit / reuse` | Distinct states for static safety assessment, an actual lookup hit and actually reused stage output. |
| `Scheduler wave` | Deterministic ready set of independent stages; settlement may overlap, but trace, cache journal and value commit always follow plan order. |
| `Resource report` | Run-bound account of requested/effective limits and actual stage, event, render, deadline and concurrency usage. |
| `TextabanaValue` | Portable typed value envelope in pipelines and the runtime protocol. |
| `DocumentSnapshot` | Immutable text content for a documentId at a monotonic documentRevision and content-bound documentVersion. |
| `ChangeSet` | Atomic, version-guarded set of sorted, non-overlapping text patches. |
| `Anchor` | Immutable, version-bound target record with selectors; cross-revision continuity is a separate, explicit resolution. |
| `MetadataDelta` | Post-commit comparison between two immutable metadata snapshots, filtered for an editor subscription. |
| `SourceMap` | Many-to-many relation between output selectors and input anchors. |
| `render` | Primary result value from the return pipeline; not an ordinary channel. |
| `Channel` | Named, typed append-only event stream within a run. |
| `system.out` | Reserved channel for editor and position-bound metadata. |
| `ArtifactRef` | Content-addressed reference to a large or binary payload. |
| `Run` | Versioned compilation/execution with an explicit profile and lifecycle. |
| `Adapter` | Versioned post-commit projection between an immutable TextabanaResult and an external host, standard or service. |
| `Candidate` | Immutable model or tool proposal at revision 0 without human decision state. |
| `Review revision` | Append-only human action and a new revision accepting, rejecting or replacing a candidate. |
| `Current view` | Derived list of currently accepted annotations; never deletes historical candidates or revisions. |
| `ConformanceReport` | Machine-readable, source-result-bound evidence for a versioned suite case; separate from canonical Result and CI status. |
| `Golden fixture` | Checked-in input and expected structural digest that are not computed from the same current run. |
| `Declared vs claimable` | Declared support describes the catalog; claimable requires every applicable requirement to pass. Contract-only is never claimable. |
| `Conformance gate` | Derived blocker list for failed requirements, stage failures and golden regressions in the current case. |

**Specification direction**

Textabana reuses established formats where they already solve the problem: Markdown for readable text, JSON Schema for contracts, Arrow/Parquet for data, MIME for notebook presentation, W3C models for annotation/provenance, and LSP/OTel/OpenLineage/MLflow as adapters. Its contribution is the coherent semantics connecting them.

This is the direction. The [standards matrix](./direction.md) shows what is implemented, bounded or planned and why channel JSON Schema validation is a priority deviation.
