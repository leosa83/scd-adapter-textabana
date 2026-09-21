# Properties and includes

### Properties

Attribute lists attach to Markdown AST units, are stored in the IR and disappear from the rendering. They execute nothing by themselves.

### Lightweight semantics

Illustrative · markdown + textabana

```markdown + textabana
Den centrala slutsatsen.

{.claim .verified priority=10 confidence=0.94}

## Evidens {.evidence source="PARES"}
```

**Aliases are language semantics, not playground semantics**

Draft 0.7 defines `as alias`, but `textabana.parser/lab-v1` executes only `>>>>! include "path"`. The exact legacy line `>>>> include "path"` is supported without aliases and takes precedence over a block named `include`.

### Includes

Scripting is include-based. The compiler first resolves a module graph, then initializes each unique module according to the chosen run profile.

### Module import with an alias

0.4-defined · textabana

```textabana
>>>>! include "pkg:textabana/claims@2" as claims
>>>>! include "./modules/redaction.py" as privacy

>>>> claims.extract
Text
<<<< claims.extract
```

<a id="PROPERTY-001"></a>

> **PROPERTY-001** `@order` orders functions. A property such as `priority` affects ordering only if an explicit function reads it.

<a id="MODULE-001"></a>

> **MODULE-001** The compiler MUST normalize URIs, build a DAG, detect cycles and export collisions, and pin the resolved URI, version and SHA-256 before module code runs.

<a id="MODULE-002"></a>

> **MODULE-002** The same normalized URI and digest identify the same module instance. The module initializes once per fresh run, or once per named session in the session profile.

<a id="MODULE-003"></a>

> **MODULE-003** Cache MUST NOT change semantics. Reused session state, module replacement or nondeterministic replay MUST be recorded in provenance.
