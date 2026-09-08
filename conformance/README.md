# External conformance tools

Run from the repository root with Node >=22.13 and Python 3.10+:

```bash
npm ci
npm run conformance:external > report.log
node cli/textabana.mjs conformance > report.json
node cli/textabana.mjs conformance-semantic > semantic-report.json
node cli/textabana.mjs conformance-contract > contract-report.json
node cli/textabana.mjs conformance-text-core > text-core-report.json
python3 reference/text_core.py run examples/text-core.md
node cli/textabana.mjs conformance-scoped-text > scoped-text-report.json
python3 reference/scoped_text.py run examples/scoped-text.md
node cli/textabana.mjs conformance-channel-core > channel-core-report.json
python3 reference/channel_core.py run examples/channel-core.md
node cli/textabana.mjs analyze examples/document.md
node cli/textabana.mjs run examples/document.md
node cli/textabana.mjs registry-check PACKAGE_REGISTRY.json
```

The first command builds the browser worker; its npm/build output is not JSON. The direct CLI command writes only the report JSON to stdout. `run` accepts an optional JSON file with `modules` and `options`; module JavaScript is trusted code and executes in a Node Worker, with the user's process permissions. `serve` exposes the same stateful kernel protocol as JSONL over stdin/stdout; each command requires a unique in-flight `requestId`. It accepts cancel while a run is active. Logs go to stderr.

## Exact scope

`textabana.host-protocol/lab-v1` has eight versioned cases, each executed through five real host paths: direct Worker messages, TypeScript SDK, CodeMirror transactions, Monaco-compatible content events and Python SDK over a Node JSONL process. The Python path also checks committed Jupyter MIME projection. All paths use the same JavaScript kernel. This is not evidence for a separate Python language implementation, a browser UI integration test, or full Jupyter Messaging.

The report checks expected Unicode character counts, two document changes, analysis validity, stale edit/run rejection, committed output and cancellation acknowledgment. It compares only the named `projection` fields, records every expected/actual outcome, and binds the suite and exact generated kernel bytes with SHA-256. Any failed case returns exit code 1. Module grants, cache, channels, anchors and scheduler semantics have separate repository tests and are not claims of this narrow external profile.

`npm test` additionally checks 250 seeded canonical JSON values, 160 successive incremental-versus-fresh parser edits, queued editor changes, SDK lifecycle failures, registry integrity and signature tampering. Seeds are fixed in `tests/external-conformance.test.mjs` for reproduction.

## Canonical bytes and claims

`canonical <json>` implements [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785): recursive UTF-16 key sorting, ECMAScript finite-number encoding, unchanged Unicode, and no insignificant whitespace. The trailing CLI newline is a record separator and is excluded from the digest. The strict JSON reader rejects duplicate keys (including escaped aliases), lone surrogates, nonfinite numbers and nesting beyond 128 levels. The value API rejects unsupported, sparse, decorated or cyclic values instead of losing data.

`digest <json>` hashes UTF-8 canonical bytes with SHA-256. It does not identify Textabana execution. Sprint 5.2 adds separate [semantic artifact identities](../SEMANTIC_IDENTITY.md) through `identify`, `verify-identity` and `conformance-semantic`. Legacy IR/Plan/Result carrier IDs remain available; no conversion command upgrades them. These artifact reports explicitly keep `canonicalRuntime`, `independentImplementations` and `fullProfileConformance` false.

## Executable artifact contract

Sprint 5.3 adds [JSON Schema and internal-reference verification](../SEMANTIC_CONTRACT.md) to `verify-identity`. `conformance-contract` runs 80 frozen cases over static bundles: 14 acceptances and 66 expected rejections. Negative cases normally rehash their artifacts and downstream chain, so they exercise structure and references rather than only stale digests. A separate manifest pins the full suite, expected outcomes and schema; the suite pins its baseline corpus. Removed cases or changed expectations cannot retain the same profile claim.

The report binds the schema, manifest, suite, baseline and verifier/runner source bytes. It can claim the fixed `textabana.semantic-contract/v1` verifier profile only. These checks do not run modules or certify rendering correctness. The 28-case semantic execution suite remains separate and retains all prior golden identities. Downloadable reports describe the checked source snapshot, not ongoing CI status.

## Independent text runtime

Sprint 5.4 adds [textabana.text-core/v1](../TEXT_CORE_PROFILE.md): an independently written Python parser/evaluator and a bridge to the actual JavaScript Worker. The Python file runs by itself with only the standard library; it is separate from the earlier Python host SDK that calls Node. Both implementations evaluate 70 frozen cases against explicit expected text, error class and commit projection (140 runtime outcomes). Cases include nested blocks, same-line pipelines, JSON string arguments, literal fences/escapes, Unicode, syntax/stage failures, unsupported features and bounded resource failures. Replacement output size is checked before allocation.

The separate manifest pins the full suite and specification. The report fingerprints both implementations and bridge dependencies. Only the passing fixed text profile claims independent implementations; full language/runtime and semantic artifact equivalence remain false. The test suite copies the Python file outside the repository and runs it with an empty PATH, and checks that missing Python or a weakened fixture suite cannot produce a claim. The downloadable report is a source-snapshot result, not a live verification of the current Playground document.

## Independent interval semantics

Sprint 5.5 adds [textabana.scoped-text/v1](../SCOPED_TEXT_PROFILE.md), preserving the original text-core suite. Eighty new fixtures (160 runtime outcomes) cover open/overlapping intervals, latest alias-or-name close matching, numeric ordering and stable ties, root-level ascending/descending config, default block inheritance and `@inherit="none"`. Comparisons include each committed invocation's function, domain arguments, modality and scope alias in order, as well as exact render and commit status.

The Python reference builds a bounded expression tree before evaluating. Both implementations reject more than 128 expanded invocations before any transform, including an early failing stage; authored stage count is a separate bound. Cross-container closure, duplicate active IDs and unclosed scopes fail without a committed result. A separate manifest binds all expected outcomes and both normative specifications. The report fingerprints the two Python files, trusted JS module and actual bridge/kernel code. Neither profile claims channels, arbitrary module execution, semantic artifact equivalence or full production conformance.

## Independent channel results

Sprint 5.6 adds [textabana.channel-core/v1](../CHANNEL_CORE_PROFILE.md): 80 frozen cases and 160 runtime outcomes compare exact payloads, global event sequence, targets, invocation order and durable snapshots. Transient events consume sequence numbers but are excluded from durable snapshots. Required empty channels, deep copying at emission, repeated row IDs, strict schema/channel rejection and whole-run rollback are covered, including 64/65-event and exact payload-byte boundaries. Three standalone Python files run without Node. The bridge checks actual host render, snapshot contents and event-to-invocation/anchor/map references before projection; source positions and full provenance equivalence are not compared between implementations. The manifest pins all three normative specifications and every expected outcome.

## Signing and verification

```bash
node cli/textabana.mjs sign report.json /secure/path/private.pem > signed-report.json
node cli/textabana.mjs verify signed-report.json /trusted/path/public.pem
```

Keys must be Ed25519 PEM keys supplied by the caller. The CLI does not generate, publish or store signing keys. Verification requires a separately trusted public key; an embedded key cannot establish trust. The signature binds the exact report, checks and claim flags. Verification authenticates the signer's report and returns its claimed status; it does not rerun tests, certify that the signer is honest, or promote a lab profile. Run the conformance command locally to reproduce the actual outcome. The downloadable release report is unsigned because this project has no configured release-signing identity.

## Local package catalog

`PACKAGE_REGISTRY.json` contains one example text module and the Python host adapter. It locks every listed file, canonical manifest and whole package with SHA-256. `registry-check` rejects duplicate identities, path traversal, escaping symlinks, manifest drift and changed file bytes without executing or installing packages. A catalog hash establishes integrity against a trusted catalog; this local file is not a remote registry service or a publisher-authentication mechanism. Module execution still requires a runtime module manifest, lock and explicit host grants.

## Remaining Wave 5 work

Sprints 5.1–5.6 provide reproducible verification tooling, source-bound semantic identities, an executable artifact contract and independent text/interval/channel runtime comparisons. Full production language/runtime profiles, broader independent runtime coverage (arbitrary modules, broader channel policies, exact provenance, caches and additional scope policies), configured release signer and published registry service remain open. Wave 5 stays active.
