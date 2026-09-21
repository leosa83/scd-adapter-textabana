# Parser, syntax and recovery

Modality is visible directly in the text. A versioned Lezer parser first produces a lossless CST; Textabana then lowers it to an AST and typed IR. The same parse product governs include resolution, inspection and execution.

### Marker families

| Marker | Role | Requirement |
| --- | --- | --- |
| `>>>>!` | Directive | Affects compilation; produces no value. |
| `>>>>` | Open block | MUST be closed structurally. |
| `<<<<` | Close block | MUST match the opening's first function name. |
| `>>>>+` | Activate interval | Adds an identifiable scope instance. |
| `<<<<+` | Deactivate interval | Closes the exact @id or the most recently opened active instance with the name. |
| `\|` | Pipeline | Runs stages from left to right. |
| `{ ... }` | Properties | Attaches metadata to a Markdown AST unit. |
| `\>>>>` | Escaped marker | Becomes literal text; exactly the escape backslash is removed. |
| ``````` / ~~~```` | Literal fence | Control markers inside a Markdown fence are never interpreted. |

### All syntactic surfaces

Normative syntax · textabana

```textabana
>>>>! include "./modules/core.js"
>>>>! config scope-order="declaration:asc"

>>>>+ normalize @id=clean @order=10

>>>> summarize sentences=2
  | tag class="abstract"

Text {.claim priority=10}
<<<< summarize

<<<<+ @id=clean
```

### Executable EBNF · simplified core fragment

Parser lab-v1 · ebnf

```ebnf
Document      ::= Item*
Item          ::= Fence | EscapedMarker | Directive | Block | IntervalOpen | IntervalClose | Property | Text
Block         ::= BlockHeader Item* BlockClose
BlockHeader   ::= '>>>>' Pipeline Continuation*
IntervalOpen  ::= '>>>>+' Stage
IntervalClose ::= '<<<<+' ('@id=' Identifier | Name)
Pipeline      ::= Stage ('|' Stage)*
Continuation  ::= Indent '|' Stage ('|' Stage)*
Stage         ::= Name Argument*
Argument      ::= ArgName ('=' Value)?
```

**Function arguments**

`sentences=2` and other ordinary arguments are typed by the parser and passed to the function. Validation against the function's full JSON Schema is defined but not yet executable in the lab.

**Engine controls**

`@id`, `@order`, `@inherit` and `@cross` control the engine and are not passed as function arguments. The parser requires an identifier string, a finite number or explicit policy strings, respectively, without JavaScript coercion.

**Literal syntax**

Markers are recognized only at a logical line start outside fenced code. U+005C before a marker makes the line literal; generated output is never parsed again.

**Comments**

The language defines no standalone `//` comment. Use prose or a future explicit directive.

**Recovery is editor structure, not tolerated execution**

Incomplete syntax produces local `Recovery` nodes with a stable code and exact span. Valid siblings remain in the CST/AST/IR, but any error-level recovery blocks module initialization, the Plan and domain execution for the entire snapshot.

**Why Lezer, and why no Worker migration**

Lezer is JavaScript-native, editor-oriented and designed for syntax trees during incomplete edits. Tree-sitter's web path would have required separate runtime Wasm, grammar Wasm and asynchronous asset loading. The parser is therefore generated offline and bundled into the same classic `/runtime-worker.js`; the Lezer tree remains an internal CST and never becomes the public IR schema.

<a id="SYNTAX-001"></a>

> **SYNTAX-001** Control lines, closing lines and standalone property lines MUST be removed from the primary render.

<a id="SYNTAX-002"></a>

> **SYNTAX-002** Unknown engine controls MUST produce compilation diagnostics; they cannot be silently passed to the function.

<a id="PARSE-001"></a>

> **PARSE-001** The same source snapshot and grammar version MUST deterministically produce the same CST, diagnostic codes and recovery kinds.

<a id="PARSE-002"></a>

> **PARSE-002** Recovery MUST retain the exact authored span or an explicit zero-width missing-token position. It can never fabricate an executable opener, close or stage.

<a id="PARSE-003"></a>

> **PARSE-003** Every error-level recovery MUST block module initialization and domain execution, but partial CST, AST, IR and diagnostics MUST still be deliverable to the editor.
