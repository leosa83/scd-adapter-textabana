# Textabana text core — independent reference profile v1

Profile: `textabana.text-core/v1`, version `1.0.0`. This is a bounded interoperability experiment within Language Core 0.4, not the complete language/runtime production profile.

## Implementations and execution

`reference/text_core.py` independently parses and evaluates source using only Python 3.10+ standard-library code. It never imports the JavaScript parser, calls Node, executes JavaScript modules, or reads expected results. The JavaScript bridge in `conformance/text-core-runner.mjs` admits the subset with the existing parser, then runs the actual Worker with a fixed pure-function module. Its single prepended include is bridge configuration, not authored source. Source hashes cover the original UTF-8 document; no cross-runtime IR/Plan/Result identity is claimed.

```sh
python3 reference/text_core.py run examples/text-core.md
node cli/textabana.mjs conformance-text-core > text-core-report.json
```

The standalone `run` command returns a JSON result and a nonzero exit status on rejected input. `batch` reads a JSON object with a `sources` array on stdin and returns one result per input, without external processes or packages. The Node suite requires Python on PATH; a missing/crashed/timed-out process fails the suite and can never count as an expected rejection.

## Source and syntax

UTF-8 Unicode scalar text, with LF as the only line delimiter. CR and U+FEFF are outside this version. No Unicode normalization occurs; U+2028/U+0085 remain text. Only ASCII space and tab indent control markers. Source is limited to 65,536 UTF-8 bytes, 32 nested blocks and 128 authored stages. Rendered strings after each stage and the final merge are limited to 262,144 UTF-8 bytes.

| Construct | Semantics |
|---|---|
| Text and blank lines | Exact characters and LF bytes are preserved. |
| `>>>> stage ...` / `<<<< name` | A named block. Close matches the **first** pipeline stage. Control lines contribute no render bytes, including their LF. |
| `stage \| stage` | Same-line pipeline, applied from left to right after all nested child blocks are rendered and concatenated in source order. Empty block input is the empty string. |
| Names | `[A-Za-z_][A-Za-z0-9_]*`; names are case-sensitive. |
| Arguments | `name="JSON string"`, separated by ASCII space/tab. Duplicate names and reserved names `__proto__`, `constructor`, `prototype` are syntax errors. Pipes inside strings are literal. Decoded strings must contain Unicode scalars. Unused string arguments are ignored by these functions. |
| Escapes | One backslash immediately before a line-start `>>>>` or `<<<<`, after optional space/tab, is removed; the remainder is literal, including braces. |
| Fences | At least three backticks or tildes after zero to three ASCII spaces. Opening line, body and closing line are literal. Close uses the same character with at least the opening length and an ECMAScript-whitespace-only tail. An unclosed fence remains literal to EOF. More deeply indented or tab-prefixed fence-like text is ordinary text. |

Fence-like lines containing U+2028 or U+2029 are ordinary text, matching the current language parser. Function output is never parsed again. Includes (including legacy includes), directives/config, intervals, engine controls, multiline pipeline continuations, non-string arguments, single quotes and dotted/hyphenated stage names are outside this profile. A `{` anywhere in ordinary unfenced, unescaped text is conservatively rejected to exclude property semantics. Braces inside quoted stage arguments and literal fences/escapes remain valid.

## Fixed stage semantics

| Stage | Result |
|---|---|
| `identity` | Input unchanged. |
| `asciiUpper` | Replace only ASCII `a`–`z` by `A`–`Z`; all other code points remain unchanged. |
| `wrap` | `prefix + input + suffix`; missing arguments default to empty strings. |
| `replaceLiteral` | Replace all non-overlapping occurrences of nonempty `old` with `new` (default empty). Empty/missing `old` fails. No regex or Unicode folding. |
| `fail` or unknown name | Failed stage, no committed render. |

Authored input cannot request side channels, state, caller-supplied module resolution or dynamic code evaluation in this profile. The fixed JavaScript module is trusted bridge code and its exact bytes are recorded.

## Comparison and claim gate

Both implementations independently return `{ok, output, error, committed, committedStages}`. Successful results compare exact output and the number of stages belonging to the committed result. Failures compare an empty output, no commit and zero committed stages. This count does not claim that no stage was attempted before a failure. Error classes are `syntax`, `unsupported`, `stage` and `limit`; diagnostic wording, parser recovery details and scheduling are not compared. Multiply-invalid programs may expose different first errors; the frozen suite defines the precise single-error and combined-error cases covered by v1.

`conformance/profiles/text-core-v1.json` freezes sources and explicit expected projections. Its separate manifest pins the complete suite, count and this specification's raw bytes. The runner checks both results against the expectation, not merely against each other. The report hashes original sources, the suite, manifest, specification, reference/bridge/runner code, JS parser, Worker and dependency lockfile, and checks that implementation bytes did not change during the suite. Changing a fixture or removing one without updating the manifest fails closed; evolving the profile requires a reviewed versioned change.

Only a fully passing suite sets `claimable` and `independentImplementations` for **this scope**. The report always keeps `canonicalRuntime`, `semanticArtifactEquivalence` and `fullProfileConformance` false. Independence refers to separate parser/evaluator code, not independent authorship or third-party certification. Artifact-contract checks, full language/domain profiles, channel/provenance equivalence, module ABI, editor protocol, caches, concurrent execution, release signing and a public registry remain separate work. An unsigned report proves neither publisher identity nor that an untrusted publisher actually ran its claimed code.
