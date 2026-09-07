# Textabana scoped text — independent reference profile v1

Profile `textabana.scoped-text/v1`, version `1.0.0`, extends the bounded [text core profile](./TEXT_CORE_PROFILE.md) with interval semantics. It does not change `textabana.text-core/v1` or its frozen cases. The linked text-core specification remains normative for source encoding, text, block syntax, same-line pipelines, quoted string arguments, literal fences/escapes and the five fixed functions. Both specification files are pinned by the new manifest.

## Run and reproduce

```sh
python3 reference/scoped_text.py run examples/scoped-text.md
node cli/textabana.mjs conformance-scoped-text > scoped-text-report.json
```

The Python implementation requires Python 3.10+ and the two sibling files `reference/scoped_text.py` and `reference/text_core.py`. The first independently parses scope/block structure and lowers a bounded expression tree; the second supplies the existing pure text transforms. Neither calls Node, the Worker or the JavaScript parser. The two files run after copying them outside the repository with no Node on PATH. `run` returns JSON and exits nonzero on rejection. `batch` accepts `{sources: [...]}` on stdin and returns `{profile, results}`. A process failure, malformed response or timeout is a suite failure, never a passed negative fixture.

The JavaScript bridge independently admits the subset with the existing language parser, then executes the actual Worker using the fixed `reference/text-core-module.js`. It prepends one trusted include. Original source bytes are hashed separately; bridge-added line offsets and generated IR/Plan/Result identities are not compared.

## Interval and block contract

| Syntax or event | Meaning |
|---|---|
| `>>>>+ function arguments` | Open one interval in the current document/block container. Interval pipelines are syntax errors. |
| `@id="alias"` | Optional alias matching `[A-Za-z_][A-Za-z0-9_.-]*`. Without one, use `function-N`, where N is the global interval declaration count, including declarations inside blocks. Every active alias must be unique across all containers. A closed alias may be reused. |
| `@order=integer` | Optional integer in [-1,000,000, 1,000,000], written without decimal point or exponent. Default is the global interval declaration count. These values do not reach the function's domain arguments. |
| `<<<<+ target`, `<<<<+ @target`, `<<<<+ @id=target` | Close the last active interval whose **alias or function name** matches target. The `@id=` form does not force alias-only lookup. Valid intervals in the same container may close in non-LIFO order. |
| Buffer boundary | Open, close, block and config-directive nodes flush preceding text. Each active interval runs once on that concatenated text buffer. Control lines contribute no output bytes. A blank body line is a buffer; an interval with no body nodes produces no invocation. |
| Block | Render children with their own local intervals; run the block pipeline left to right; then apply the enclosing container's active intervals to the completed block output. Enclosing intervals do not also wrap each nested child separately. An empty block still runs its pipeline on `""`. |
| First block stage `@inherit="none"` | Suppress ambient intervals at this block boundary. Locally declared intervals inside the block still execute. Omitted or `@inherit="default"` applies ambient intervals. Controls on later pipeline stages are outside this profile. |
| Container boundary | An interval must close in the same container where it opened and before that container ends. Closing an outer interval inside a block, leaving a local interval open at block-close, or leaving any interval open at EOF is a syntax error. |
| Top-level `>>>>! config scope-order="declaration:asc"` or `"declaration:desc"` | Set the global numeric interval ordering direction. The last valid declaration applies to the whole document, including text before it. Equal numeric order retains declaration order in both directions. Config also creates a text-buffer boundary. Only this exact single-key form at document level is supported. |

The fixed transforms remain `identity`, ASCII-only `asciiUpper`, `wrap`, literal non-overlapping `replaceLiteral` with a nonempty needle, and intentional `fail`. Unknown function names fail only when invoked: an empty unused unknown interval succeeds with no invocation. Function output remains literal, never new source. Domain arguments must be JSON double-quoted scalar strings; reserved or duplicate keys are syntax errors. Scope IDs are case-sensitive; no Unicode normalization occurs.

## Limits and atomic results

The limits are 65,536 UTF-8 source bytes, 32 nested blocks, 32 simultaneously active intervals across all containers, 128 authored function stages, 128 expanded stage invocations and 262,144 UTF-8 bytes after each transform and for the final render. CR and U+FEFF remain outside this profile. The limit on authored stages includes interval declarations and block pipeline stages, but not config directives.

The complete expanded invocation count is checked **before any transform runs**. Thus an early `fail` in a plan requiring 129 invocations yields `limit`, even though it would have failed as a stage in a smaller plan. Inheritance can make expanded count exceed authored count: 64 empty identity blocks inside one identity interval require 128 invocations. Text replacement checks output size before allocating the replacement.

Successful projection: `{ok: true, output, error: null, committed: true, committedStages, stages}`. Each entry in the ordered committed ledger has `{function, args, modality, scopeId}`. `modality` is `block` or `interval`; `scopeId` is null for block stages and the authored/generated interval alias otherwise. Domain args exclude engine controls. The ledger checks observable invocation identity and order, in addition to exact render and count; it does not expose exact intermediate values or establish source-map/provenance equivalence.

Failed projection: `{ok: false, output: "", error, committed: false, committedStages: 0, stages: []}`. Error is `syntax`, `unsupported`, `stage` or `limit`. Zero committed stages does not mean zero attempted transformations. The JS bridge checks actual failed Worker envelopes for empty output, no commit, no channel snapshots and no anchors before mapping stage/budget errors. Parser/admission rejection runs no transforms. Multiple independent errors may differ in first-error precedence; exact negative claims cover the frozen fixtures, including the specified budget-before-stage case.

## Frozen suite and claim

The 80 fixtures in `conformance/profiles/scoped-text-v1.json` contain authored sources and explicit expected render, error and full committed ledger. Both runtimes must independently match the expectation, not just one another. The separate manifest pins all fixtures, count and both specifications. Reports bind original source hashes and the Python files, fixed module, runner, JS parser, generated Worker, host bridges and dependency lockfile; the runner verifies their bytes did not change during execution.

Only a fully passing suite claims `independentImplementations` for `textabana.scoped-text/v1`. The meaning is separately implemented parser/lowering/evaluation code, not independent authorship, third-party certification or publisher authentication. `canonicalRuntime`, `semanticArtifactEquivalence` and `fullProfileConformance` remain false. The report describes one source snapshot, not the currently edited Playground document or live CI status.

Outside this profile: caller-supplied modules, channels and their payload/provenance, properties, multiline pipelines, virtual `@intervals`, interval selection, inheritance modes beyond default/none, all explicit `@cross` controls and alternative crossing policies, configs inside blocks, general numeric/domain arguments, editor changes, caches and concurrent execution. Full production schemas/profiles, wider runtime interoperability, configured release signing and a published registry service remain separate work. The existing text-core, host, semantic-identity and artifact-contract suites retain their own scopes.
