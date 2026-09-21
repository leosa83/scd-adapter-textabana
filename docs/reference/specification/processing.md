# Processing model

### Complete reference document

Planned golden fixture · textabana

```textabana
>>>>! include "pkg:textabana/core@1" as core
>>>>! include "pkg:textabana/claims@2" as claims

>>>>+ core.normalize @id=clean @order=10
>>>>+ claims.annotate @id=review @order=30

## Observation {.evidence source=PARES}

>>>> claims.extract @inherit=explicit
  | @intervals only=[clean]
  | claims.rank
  | @intervals only=[review]

Fartyget avgick från Göteborg den 4 maj.
<<<< claims.extract

<<<<+ @id=clean
<<<<+ @id=review
```

1. **Capture an immutable snapshot.** Bind documentId, revision, source version and exact source coordinates.
2. **Build a lossless CST.** Lezer preserves every lexeme and line ending; fenced code and escapes are classified before control syntax.
3. **Lower to an AST.** Build the block tree, typed stages, literal nodes, properties, directives and local recovery nodes.
4. **Compute the interval graph.** Keep open/close events separate from the block tree and derive maximal scope segments.
5. **Publish typed IR.** Give each node/stage a verifiable Unicode code point span and each error a stable code.
6. **Apply the compile gate.** Recovery remains visible to the editor, but error-level diagnostics stop all module initialization and execution.
7. **Resolve, initialize and bind modules.** Every securely transported package must pass metadata, digest, lock and grant checks. Includes and config are read from the same IR. After module startup, actual exports are compared with the manifest before the first transform.
8. **Compile the plan and graph.** Build a complete, typed DAG after module initialization but before the first `transform`. Source, stage, merge and render nodes receive deterministic order and explicit dependencies.
9. **Resolve deterministic ready sets.** Each stage receives either a fresh transform call or verified cache materialization. Independent effects-free candidates can overlap asynchronously; effectful/unknown stages are serial barriers. Started batches are drained and values, trace and cache journal are published in plan order.
10. **Commit atomically.** Publish immutable render, channel snapshots, provenance and diagnostics as one result.

This list describes the semantic stages. In the current Worker, package admission checks precede document parsing; both gates must pass before any module starts. A package error can therefore be reported before a syntax error. Legacy modules without a secure package signal use the older loader boundary. See [exact package checks and error order](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_ADMISSION_PROFILE.md).

<a id="PROCESS-001"></a>

> **PROCESS-001** Concurrent execution MAY be used only when dependencies, eligibility, deterministic merge and public event/trace order are fully defined. Completion timing cannot become semantic order.

<a id="PROCESS-002"></a>

> **PROCESS-002** A compilation error MUST stop all domain execution. A run error MUST prevent durable commit.

<a id="PROCESS-003"></a>

> **PROCESS-003** Module initialization is an effect and MUST NOT occur before the entire document has passed the parser's compile gate.

<a id="PROCESS-004"></a>

> **PROCESS-004** ExecutionPlan and ExecutionGraph MUST be complete before the first stage resolution. ExecutionTrace `textabana.execution-step/lab-v2` MUST be a separate observation in which each entry references a planned node and distinguishes fresh invocation from cache materialization. On failure, the entire graph is retained and every actually started, drained stage outcome is published in plan order; unscheduled nodes have no trace entry.
