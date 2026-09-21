# Textabana Parser & typed IR — Wave 2

This document defines the executable parser subset introduced in Wave 2. Valid Language Core semantics remain at `language-core/0.4`. Public artifacts are `textabana.parser/lab-v1`, `textabana.cst/lab-v1`, `textabana.ast/lab-v1` and `textabana.ir/lab-v2`.

## One source snapshot, one grammar authority

```text
Source snapshot
  → Lezer CST
  → Textabana AST
  → typed IR + diagnostics
  → compile gate
  → module resolution + initialization
  → pre-transform ExecutionPlan + typed graph
  → bounded deterministic ready-set scheduling
  → stage resolution (fresh transform or verified cache materialization)
  → atomic Result
```

`parseDocument(source, identity)` always runs before module initialization. Include resolution, configuration, Language Lab and runtime use the same parse product. A blocking parser diagnostic still leaves CST, AST and partial IR available to the editor, but prevents module initialization, planning, stage resolution and durable commit.

The Wave 3 addendum builds `textabana.execution-plan/lab-v2` and `textabana.execution-graph/lab-v1` after include modules initialize but before the first transform. One operation tape produces both the inspectable graph and actual ready-set execution. Independent `pure + deterministic + effects=[]` stages with render-only output and snapshotable input may overlap asynchronously in the same Worker. Execution IDs are reserved; trace, cache journal and values commit in plan order after each started batch drains. `executionTrace` uses `textabana.execution-step/lab-v2` and links back through `planNodeRef`; `functionInvoked` distinguishes fresh transforms from cache materialization. An advisory `textabana.invalidation-preview/lab-v1` must never be presented as a hit. `textabana.execution-report/lab-v1` reports actual lookups, misses, hits, observations, scheduler waves, run budgets and atomically committed cache changes.

The cache subset applies within a running Editor Kernel session and can be transferred explicitly between sessions as a validated host checkpoint. An effects-free, deterministic pure candidate must be observed with exactly the same key witness and typed output in two distinct successful revisions before reuse is allowed. Parallel eligibility remains a separate contract field even where its criteria coincide in this subset. Unknown, stateful and effectful stages are global serial barriers. Lezer fragments are reused after revision-guarded ChangeSets; an exactly analyzed revision reuses its compiler snapshot. Post-commit metadata streaming uses host credit. Continuous stage-output streaming, cached channel replay and multicore execution are outside this subset.

## Two layers, one parser contract

The Lezer grammar in `runtime/textabana.grammar` is a lossless, line-anchored classifier. `runtime/parser.js` interprets stage/value syntax, maintains fence, block and interval state, and lowers the same CST to AST and IR. Both layers sit behind one public operation, `parseDocument`; no renderer or inspector reclassifies raw document text.

```ebnf
Document          ::= Item*
Item              ::= Fence | EscapedMarkerLine | Directive | LegacyInclude
                    | Block | IntervalOpen | IntervalClose | PropertyLine | TextLine

Fence             ::= FenceOpen FenceText* FenceClose?
FenceOpen          ::= Indent? (BacktickFence | TildeFence) FenceInfo?
FenceClose         ::= Indent? MatchingFence Whitespace*
EscapedMarkerLine ::= Indent? "\\" (">>>>" | "<<<<") TextTail

Block              ::= BlockHeader Item* BlockClose
BlockHeader        ::= ">>>>" Pipeline Continuation*
BlockClose         ::= "<<<<" Name
IntervalOpen       ::= ">>>>+" Stage
IntervalClose      ::= "<<<<+" ("@id=" Identifier | Name)
Directive          ::= ">>>>!" (Include | Config)
LegacyInclude      ::= ">>>>" Include
Include            ::= "include" Whitespace QuotedPath
Config             ::= "config" Whitespace "scope-order=" QuotedScopeOrder

Pipeline           ::= Stage ("|" Stage)*
Continuation       ::= Indent "|" Stage ("|" Stage)*
Stage              ::= Name Argument*
Argument           ::= ArgName ("=" Value)?
Value              ::= Boolean | Null | Number | Quoted | Array | Object | Bare
Array              ::= "[" (Value ("," Value)*)? "]"
Object             ::= JsonObject | Bare
PropertyLine       ::= "{" Property+ "}"
Property           ::= "." Identifier | "#" Identifier | ArgName "=" Value

Name               ::= "@"? Identifier ("." Identifier | "-" Identifier)*
ArgName            ::= "@"? Identifier ("-" Identifier)*
Identifier         ::= (Letter | "_") (Letter | Digit | "_" | "-")*
Boolean            ::= "true" | "false"
Null               ::= "null"
Number             ::= FiniteJsonNumber
Quoted             ::= JsonString | SingleQuotedString
Bare               ::= NonWhitespaceText
```

Lexical precedence is fence/literal, escaped marker, directive, interval, block, property, then ordinary text. Control syntax is recognized only at logical line starts. A pipeline `|` does not split quotes, lists, objects or parentheses. An indented continuation is valid only immediately after a block header or previous continuation; an unindented `| ... |` remains ordinary Markdown table text. Intervals accept exactly one stage per opening marker; interval piping uses multiple open intervals.

`>>>>! include "path"` is the primary lab syntax. The exact legacy line `>>>> include "path"` takes precedence over a block named `include`. Include aliases using `as` are defined for a future broader language profile but are not executable in `parser/lab-v1`.

## Literal and property semantics

- Inside Markdown fences with at least three backticks or tildes, all Textabana markers are literal text.
- `\>>>>` and `\<<<<` at a logical line start produce literal marker text; exactly the escape backslash is removed from rendering.
- A valid standalone property line becomes a typed `Property` node and leaves a blank line in source rendering.
- A valid trailing property list, such as `Text {.claim priority=10}`, attaches to the text node and is removed from source rendering.
- Function output is never reparsed as Textabana source. The text `{.generated}` returned by a function must therefore be preserved.

## CST, AST, IR and Plan

| Layer | Contract |
|---|---|
| CST | Lossless Lezer projection of every lexeme and line ending. Internal Lezer offsets use UTF-16 and are not exposed. |
| AST | Normalized block tree with typed stages, literal nodes, properties, directives and recovery. Intervals are sequential open/close events, not artificial AST nesting. |
| IR | Host-neutral, portable JSON semantics with blocks, scopes, segments, directives, source lines, validity and a flat discriminated node union. `undefined`, functions and non-finite numbers are forbidden. |
| Plan | In the Wave 3 addendum: a complete pre-transform DAG with source, stage, merge and render nodes. Observed resolutions are separate in ExecutionTrace and carry `syntaxStageRef`/`syntaxSpan` back to IR. |

| Type | Required semantics |
|---|---|
| `Text`, `Blank` | Authored text, render text, line endings, scope/block membership and span. |
| `Literal` | Fence- or escape-classified text that never executes as control syntax. |
| `Property` | Typed attributes, standalone/owner relation and authored span; produces no stage. |
| `IncludeDirective` | Original specifier, document-relative normalized path and legacy flag. |
| `ConfigDirective` | Typed configuration values and syntax stage. The last valid declaration wins in source order. |
| `IntervalOpen`, `IntervalClose` | Shared `scopeId`, authored stage/target and separate opening/closing spans. `@id` is a unique active identifier string and `@order` a finite number. |
| `Block` | Block ID, parent, pipeline, inheritance/cross policy, children and complete/executable flags. |
| `Recovery` | Stable recovery kind, actual/expected values, diagnostic relation and always `executable=false`. |
| `FunctionStage` | Function name, typed arguments, engine controls, stage ID and span. |
| `IntervalInjectionStage` | Only `@intervals` in a block pipeline; `only` and `except` are mutually exclusive lists of scope names/@id references; `order` is `asc` or `desc`. |

`Property` and directives normally have `executable=false` because they are not domain calls; this does not invalidate the snapshot. Parser recovery or an invalid stage instead sets `validity.executable=false` for the whole snapshot and closes the compile gate. Owning blocks/intervals and their stages are also marked non-executable in partial IR.

Every public syntax/IR node has a `sourceSpan`. `start` and `end` are zero-based, half-open Unicode code-point offsets. `startLine`/`endLine` are one-based; columns are zero-based code-point columns. Synthetic missing-token nodes have a zero-width span with `synthetic=true`. A source-backed `Blank` node may also have zero width but is never synthetic; its line ending belongs losslessly to the separate `Newline` terminal in the CST.

## Local, non-executable recovery

| Construct | Recovery kind | Stable code |
|---|---|---|
| Empty or trailing pipeline stage | `MissingStage` | `TBA-PARSE-MISSING-STAGE-LAB` |
| Invalid/misplaced stage or virtual stage | `InvalidStage`, `UnknownVirtualStage` | `TBA-PARSE-INVALID-STAGE-LAB`, `TBA-PARSE-VIRTUAL-STAGE-LAB` |
| Invalid or duplicate argument | `InvalidArgument`, `DuplicateArgument` | `TBA-PARSE-INVALID-ARGUMENT-LAB`, `TBA-PARSE-DUPLICATE-ARGUMENT-LAB` |
| Non-portable numeric value | `NonFiniteNumber` | `TBA-PARSE-NUMBER-RANGE-LAB` |
| Unterminated quote or unbalanced container | `UnterminatedString`, `UnbalancedDelimiter` | `TBA-PARSE-UNTERMINATED-STRING-LAB`, `TBA-PARSE-UNBALANCED-DELIMITER-LAB` |
| Unknown/invalid engine control or cross policy | `UnknownEngineControl`, control recovery | `TBA-PARSE-UNKNOWN-CONTROL-LAB`, `TBA-PARSE-INVALID-CONTROL-LAB`, `TBA-PARSE-UNSUPPORTED-CROSS-LAB` |
| Invalid `@intervals` or multiple stages in an interval opening | Interval recovery | `TBA-PARSE-INTERVALS-STAGE-LAB`, `TBA-PARSE-INTERVAL-PIPELINE-LAB` |
| Unknown/invalid directive or configuration value | Directive/configuration recovery | `TBA-PARSE-DIRECTIVE-LAB`, `TBA-PARSE-UNKNOWN-CONFIG-LAB`, `TBA-PARSE-INVALID-CONFIG-LAB` |
| Mismatched or malformed block closing | `MismatchedBlockClose`, `MalformedBlockClose` | `TBA-PARSE-BLOCK-MISMATCH-LAB`, `TBA-PARSE-BLOCK-CLOSE-LAB` |
| Block open at EOF or closing without a block | `MissingBlockClose`, `OrphanBlockClose` | `TBA-PARSE-BLOCK-UNCLOSED-LAB`, `TBA-PARSE-BLOCK-ORPHAN-CLOSE-LAB` |
| Unknown scope closing or scope open at boundary/EOF | `UnresolvedScopeClose`, `MissingScopeClose` | `TBA-PARSE-SCOPE-UNRESOLVED-LAB`, `TBA-PARSE-SCOPE-UNCLOSED-LAB` |
| Invalid or duplicate active scope ID | `InvalidScopeId`, `DuplicateScopeId` | `TBA-PARSE-SCOPE-ID-LAB` |
| Scope crossing a block with `cross=error` | `CrossingScopeClose` | `TBA-PARSE-SCOPE-CROSSING-LAB` |
| Orphan indented pipe | `OrphanPipelineContinuation` | `TBA-PARSE-ORPHAN-PIPE-LAB` |
| Incomplete/invalid marker | `MalformedMarker` | `TBA-PARSE-MARKER-LAB` |

A recovery node always has `executable=false`. `diagnosticKey` combines the error code, recovery kind, actual/expected values and a deterministic occurrence within the snapshot. Keys are therefore unique and persist when unrelated lines move the same error. `diagnosticId` and `sourceSpan` belong to a specific source snapshot.

### Diagnostic language and artifact identity

The English language of this guide does not change parser output. In `textabana.semantic-artifacts/v1`, diagnostic `message` and `related` messages participate in canonical IR identity; only `diagnosticId` is omitted from each diagnostic. Rewording either message changes the digest even when code and source span stay the same. Consumers must use codes and structured recovery data for control flow, not match prose.

Existing v1 artifact bytes and frozen expectations remain unchanged. The Parser tab now uses a separate, non-mutating English view: it does not replace `message`, attach display fields to canonical diagnostics, or rehash modified artifacts. It selects wording from the current parser schema, code and recovery kind, preserves authored values and source locations, and falls back to original wording for unknown or mismatched input. Raw artifact inspection/export retains original wording, also available in an expandable original-diagnostic section. Changing canonical diagnostic content instead requires an explicit new profile and independently reviewed expectations alongside the old corpus. See the [5.14 compatibility record](docs/compatibility-5.14.md).

## Editor protocol: `analyze`

`textabana.editor-kernel/lab-v1` provides the read-only `analyze` command. It loads no modules and executes no stages.

| Surface | Fields |
|---|---|
| Request | `type="analyze"`, `requestId`, `documentId` and optional `documentRevision`/`revision`. An omitted revision means the current head; an explicitly stale revision is rejected. |
| Response | Correlated `requestId`, `command="analyze"`, status `valid` or `recovered`, explicit document snapshot and `analysis`. |
| Analysis | `textabana.editor-analysis/lab-v1`, exact revision/version, `executable`, partial `inspection` and parser diagnostics. |

This allows an editor to show structure and errors while the user types, even before `run` is meaningful.

## Architecture decision

Lezer was selected over Tree-sitter. Lezer runs as JavaScript, fits the existing CodeMirror stack and supports parser trees that remain available during syntax errors. Tree-sitter's web path would require separate runtime Wasm, grammar Wasm, asynchronous initialization and host asset location. The generated Lezer parser and runtime code are instead bundled into the same classic `/runtime-worker.js`, leaving UI, hosting and VM-test contracts unchanged.

`analyze` and `run` reuse an exactly compiled revision snapshot when available; after a revision-guarded ChangeSet, Lezer may reuse valid tree fragments. Every run still initializes modules and rebuilds the pre-transform graph from typed IR. Editor Kernel can reuse verified stage output, export/import the cache through the host and overlap independent safe asynchronous branches. A Worker provides no multicore CPU parallelism, synchronous loops cannot be preempted, and stage-output streaming and hard CPU/memory quotas remain future work.
