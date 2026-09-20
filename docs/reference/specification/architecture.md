# Architecture

Textabana placerar integrationsgränsen efter en tydlig, portabel resultatmodell. Värdar får presentera och transportera semantiken, men inte skriva om den.

**Source** — .tba · .md · notebook · API

**Parser + compiler** — CST · AST · IR · Plan/DAG

**Runtime** — block · intervall · pipeline

**Result** — render · channels · provenance

**Adapters** — Jupyter · Arrow · LSP · MLflow

### Abstrakt maskin

Normativ modell · contract

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

> **ARCH-001** En host-adapter FÅR projicera ett resultat till sin egen UI- eller transportmodell men FÅR INTE ändra eventets mening, identitet, anchor eller proveniens.

<a id="ARCH-002"></a>

> **ARCH-002** Kompilering och exekvering MÅSTE kunna beskrivas utan beroende till JavaScript, Python, Jupyter eller en specifik editor.
