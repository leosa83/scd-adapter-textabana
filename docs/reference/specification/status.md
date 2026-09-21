# Status and norms

This document distinguishes the language's target contract from the implemented lab subset. Semantics cannot be inferred from a single UI implementation. Open Evidence and scope beside a requirement to see its implementation boundary and sources. Normative means a rule for the stated contract, not that the entire rule is implemented or verified.

Interop draft 0.7, Language 0.4, the lab schemas and the implementation plan have separate version axes. The behavior described here was aligned with sprint 5.9; the subsequent documentation and translation work adds no runtime capabilities. See [contract sources and the requirement index](./documentation-sources.md).

### Two dimensions of document status

| Dimension | Values | Meaning |
| --- | --- | --- |
| Requirement status | Normative · Informative | Whether the text defines conforming behavior or describes an adapter or recommendation. |
| Implementation | Executable language 0.4 subset · Interactive subset · Defined in draft 0.7 · Contract-only | What the web playground actually executes, what it only partially visualizes and what remains a contract for a future implementation. |

**MUST**

An absolute requirement for the profile claiming conformance.

**SHOULD**

A recommended requirement that may be departed from only for a documented reason.

**MAY**

A permitted choice that must not alter other normative semantics.

<a id="STATUS-001"></a>

> **STATUS-001** An implementation MUST state the exact language version, IR version, result schema version and every adapter profile it supports.

<a id="STATUS-002"></a>

> **STATUS-002** Support for arbitrary JSON or a similar function is insufficient to claim support for a named conformance profile.

<a id="STATUS-003"></a>

> **STATUS-003** The current Playground implements eight bounded views: Language & Scope with separate Parser, Graph and Execution trace tabs, Editor Kernel, Editor Metadata, Channel & Result, Data & Lineage, Notebook Interop, Annotation & Review and Conformance. The graph view shows a pre-transform `textabana.execution-plan/lab-v2`, a typed `textabana.execution-graph/lab-v1`, advisory invalidation and an actual `textabana.execution-report/lab-v1` with scheduler and resource reports. Editor sessions can reuse verified pure/deterministic/effects-free stage output after two equal observations in distinct committed revisions. Independent, snapshotable stages with the same trusted contract can overlap asynchronously in a Worker; completion order never affects the plan-ordered trace, cache journal or merge. Result views read the same selected run; Editor Kernel also shows the surrounding revision chain. Conformance Lab produces a machine-readable, run-bound report with derived subset claims, a versioned golden snapshot, negative cases and cooperative cancellation. `editor-kernel/1` and `annotation/1` are playground subsets; actual model execution and `ml-lineage/1` remain contract-only. No interactive subset, passing negative fixture or contract registration constitutes full profile conformance.
