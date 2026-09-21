# IR, graph, plan and trace

The CST preserves source form, the AST normalizes syntax and typed IR describes the document's host-neutral semantics. ExecutionPlan and its graph then determine what the host intends to resolve. ExecutionTrace describes what actually received a fresh transform call or cache materialization; invalidation preview compares two plans without claiming a cache hit or reuse.

**CST → AST → TextabanaIR**

Lossless source, a normalized block tree and then a JSON-serializable discriminated node union with a separate interval graph.

**ExecutionPlan + Graph**

Stage instances, `syntaxStageRef`, typed edges, order keys, runtime policy and static cache recipes before transform.

**ExecutionTrace + preview**

Observed stage resolutions are bound through `planNodeRef`; `functionInvoked` distinguishes invocation from materialization. History-dependent invalidation is separate, advisory metadata.

**SourceMap**

Many-to-many relations between generated selectors and versioned input anchors.

### Minimal IR fragment

Normative schema fragment · json

```json
{
  "schema": "textabana.ir/lab-v2",
  "languageVersion": "0.4-playground-subset",
  "parser": { "schema": "textabana.parser/lab-v1", "engine": "lezer-lr", "parseMode": "full-document" },
  "sourceRef": { "documentId": "doc:claims", "version": "fnv1a:..." },
  "validity": { "status": "valid", "executable": true, "recoveryCount": 0 },
  "nodes": [{
    "nodeId": "claim-block",
    "kind": "Block",
    "sourceSpan": { "start": 128, "end": 304, "unit": "unicode-code-point", "startLine": 8, "startColumn": 0, "endLine": 15, "endColumn": 19 },
    "pipeline": [{ "stageId": "stage:syntax:004", "name": "claims.extract", "sourceSpan": { "start": 133, "end": 147 } }],
    "activeScopeIds": ["clean", "provenance"]
  }],
  "scopes": [],
  "directives": [],
  "diagnostics": [],
  "extensions": {}
}
```

### Pre-transform plan and typed graph · abbreviated

Executable plan + session-local cache subset · json

```json
{
  "schema": "textabana.execution-plan/lab-v2",
  "constructionPhase": "post-module-init-pre-transform",
  "graph": {
    "schema": "textabana.execution-graph/lab-v1",
    "nodes": [{ "nodeId": "plan:stage:…", "kind": "stage", "orderKey": [2, 0, 0], "cache": { "mode": "session-verified", "eligibility": "candidate" } }],
    "edges": [{ "kind": "pipeline", "from": { "nodeId": "plan:source:…", "port": "value" }, "to": { "nodeId": "plan:stage:…", "port": "input" } }],
    "terminalNodeId": "plan:render:…"
  },
  "runtimePolicy": { "scheduler": "bounded-deterministic-ready-set", "execution": "selective-concurrent-safe-branches", "cache": "session-verified-two-observations", "parallelMode": "single-worker-async-overlap", "commitOrder": "plan-order" }
}
```

<a id="IR-001"></a>

> **IR-001** Intervals MUST be represented as scopes and segment membership; they cannot be forced into an AST tree that loses crossings.

<a id="IR-002"></a>

> **IR-002** Authored ids MAY be stable across revisions. Generated node ids MUST be documented as revision-local.

<a id="IR-003"></a>

> **IR-003** Every IR node, stage and recovery MUST have a half-open Unicode code point span within the exact source snapshot. Synthetic missing tokens MUST be marked and have a zero-width span. A source-backed Blank node MAY be zero-width without being synthetic; the line ending then belongs to the CST's separate Newline terminal.

<a id="IR-004"></a>

> **IR-004** A `Recovery` node MUST have `executable=false` and can never be referenced as an executable stage in ExecutionPlan.

<a id="PLAN-001"></a>

> **PLAN-001** ExecutionPlan MUST carry each stage's exact function version, type contract, granted capabilities and deterministic order key.

<a id="PLAN-002"></a>

> **PLAN-002** ExecutionGraph MUST have unique node and edge ids, typed endpoints, acyclic topological order and exactly one render terminal. The edge types `pipeline`, `interval`, `interval-injection`, `inheritance`, `merge` and `render` MUST be explicit. The same operation tape MUST be authoritative for both planning and execution.

<a id="PLAN-003"></a>

> **PLAN-003** Static cache eligibility, cache candidate, cache lookup, cache hit and actual reuse are distinct states. An incomplete state, determinism or effect contract MUST make the function non-cacheable. A declared candidate is a trusted manifest assertion, not in itself a verified proof of purity.

<a id="PLAN-004"></a>

> **PLAN-004** Invalidation preview MUST be advisory and separate from the graph's and Result's semantic identity. It MUST state the basis, target and machine-readable reasons and can never be reported as a cache hit or reuse.

<a id="PLAN-005"></a>

> **PLAN-005** Parallel eligibility and cache eligibility MUST be separate fields even when their criteria coincide. Only independent `pure + deterministic + effects=[]` stages without channels or non-render output MAY overlap in the current subset. A pending unknown, stateful or effectful stage MUST fence ready branches that occur later in the plan until the barrier has completed; merge/render are serial. Outputs from actually concurrent fresh invocations MUST be snapshotted and cloned losslessly within the portable TextabanaValue domain at settlement; other types are rejected atomically before publication in plan order. Execution IDs, trace, values and cache journal MUST be published in plan order.

**Playground Wave 3 addendum**

Language & Scope Lab shows actual `textabana.cst/lab-v1`, `textabana.ast/lab-v1`, `textabana.ir/lab-v2`, a complete pre-transform graph, advisory invalidation, an actual execution report with waves/run budget and a separate plan-ordered execution trace from the same Worker. The plan is built after module initialization but before the first transform. Editor Kernel reuses an exact compiler snapshot or valid Lezer fragments when the revision chain permits it. The scheduler may overlap only trusted effects-free branches asynchronously; it provides no multicore CPU parallelism and cannot preempt synchronous loops. Cache checkpoints and credit-bound metadata streaming are host-mediated lab subsets, not transparent distributed caching or continuous stage streaming.
