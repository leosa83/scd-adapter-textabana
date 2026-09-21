# Architecture

Textabana places its integration boundary after an explicit, portable result model. Hosts may present and transport the semantics, but cannot rewrite them.

**Source** — .tba · .md · notebook · API

**Parser + compiler** — CST · AST · IR · Plan/DAG

**Runtime** — block · interval · pipeline

**Result** — render · channels · provenance

**Adapters** — Jupyter · Arrow · LSP · MLflow

### Abstract machine

Normative model · contract

```contract
Parse(SourceDocument)
  -> { CST, AST, TypedIR, Diagnostics }

Compile(TypedIR, ModuleLock, HostCapabilities)
  -> { SourceMap, ExecutionPlan, ExecutionGraph, Diagnostics }

Execute(ExecutionPlan, Inputs, RunProfile)
  -> { ExecutionTrace, TextabanaResult }

TextabanaResult
  = Render + ChannelSnapshots + Artifacts + Provenance + Diagnostics
```

<a id="ARCH-001"></a>

> **ARCH-001** A host adapter MAY project a result into its own UI or transport model but MUST NOT change the event's meaning, identity, anchor or provenance.

<a id="ARCH-002"></a>

> **ARCH-002** Compilation and execution MUST be describable without dependence on JavaScript, Python, Jupyter or a specific editor.
