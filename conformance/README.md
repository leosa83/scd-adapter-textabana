# External conformance tools

Run from the repository root with Node >=22.13 and Python 3.10+:

```bash
npm ci
npm run conformance:external > report.log
node cli/textabana.mjs conformance > report.json
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

`digest <json>` hashes UTF-8 canonical bytes with SHA-256. Canonical serialization is not canonical Textabana execution identity. Existing IR/Plan/Result identities remain lab FNV identifiers; no conversion command upgrades them. Reports explicitly set `canonicalRuntime`, `independentImplementations` and `fullProfileConformance` to false.

## Signing and verification

```bash
node cli/textabana.mjs sign report.json /secure/path/private.pem > signed-report.json
node cli/textabana.mjs verify signed-report.json /trusted/path/public.pem
```

Keys must be Ed25519 PEM keys supplied by the caller. The CLI does not generate, publish or store signing keys. Verification requires a separately trusted public key; an embedded key cannot establish trust. The signature binds the exact report, checks and claim flags. Verification authenticates the signer's report and returns its claimed status; it does not rerun tests, certify that the signer is honest, or promote a lab profile. Run the conformance command locally to reproduce the actual outcome. The downloadable release report is unsigned because this project has no configured release-signing identity.

## Local package catalog

`PACKAGE_REGISTRY.json` contains one example text module and the Python host adapter. It locks every listed file, canonical manifest and whole package with SHA-256. `registry-check` rejects duplicate identities, path traversal, escaping symlinks, manifest drift and changed file bytes without executing or installing packages. A catalog hash establishes integrity against a trusted catalog; this local file is not a remote registry service or a publisher-authentication mechanism. Module execution still requires a runtime module manifest, lock and explicit host grants.

## Remaining Wave 5 work

The production language/runtime profile fixtures, canonical semantic IR/Plan/Result identity, independently implemented runtime comparison, configured release signer and published registry service remain open. This release completes sprint 5.1, the reproducible verification tooling, while Wave 5 stays active.
