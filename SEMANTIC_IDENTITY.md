# Textabana semantic artifact identity — v1

Profile: `textabana.semantic-artifacts/v1`. Implemented in sprint 5.2 as a source-bound identity profile over the existing language 0.4 / Interop 0.7 carrier schemas.

## Use

Enable **SHA-256-identiteter** in Playground and open **Conformance → Identiteter**, or run:

```bash
node cli/textabana.mjs identify examples/document.md > identity.json
node cli/textabana.mjs verify-identity identity.json
node cli/textabana.mjs conformance-semantic > semantic-report.json
node cli/textabana.mjs conformance-contract > contract-report.json
```

`identify` accepts an optional JSON configuration file with `modules` and `options`, like `run`. Modules execute as trusted JavaScript. Content identity does not prove that a module is pure or that undeclared external inputs have been captured. SDK clients enable the same behavior with `options.semanticIdentity: true`. Legacy requests continue to work without cryptographic identification. SHA-256 requires Web Crypto.

## Identity contract

Each entry is `{id, artifact}`. The `id` is `sha256:` plus the lowercase hexadecimal SHA-256 digest of the UTF-8 RFC 8785 canonical serialization of `artifact`. Every artifact contains its own versioned `schema`, which separates identity domains. The returned bundle contains the exact artifact data needed to recompute each identity.

| Artifact | Bound content | Deliberately excluded |
|---|---|---|
| Source | Document resource ID, path and SHA-256 of exact well-formed Unicode source encoded as UTF-8 | Request/run/session IDs and editor revision |
| Context | Source identity, normalized module paths, actual module byte digests, full manifests, module lock, sorted unique grants, execution profile, strict-channel mode, effective resource limits and language/runtime semantics versions | Fixture ID, selected adapters and actual timings |
| IR | Source identity; full IR body, configuration, spans, CST/AST, nodes, scopes, blocks, directives, source lines and diagnostics | Legacy sourceRef, parser reuse counters/mode, unsupported capability list, generated diagnosticId |
| Plan | IR/context identities; ordered typed graph, ports, contracts, authored arguments, source spans, entry/terminal links and semantic scheduling policy | Graph digest, stage cache recipes, host cache mode and unsupported capability list |
| Result | Source/context/IR/Plan identities; committed render, complete durable channel descriptors/events, anchors, source maps, artifacts and diagnostics | Legacy result/hash fields, measured durations, operational run IDs, cache execution evidence and adapter output |

Module entries are sorted by normalized path after rejecting duplicate paths. Grants are set-like; all other arrays retain their order. Effective default limits and explicitly equivalent limits produce the same context identity. Changing a meaningful execution limit changes context, Plan and Result even if the rendered text happens to match.

Graph node IDs are replaced by ordinal IDs and only the graph's owned edge, entry and terminal reference fields are remapped. Source nodes contain the exact lowered text that the executable operation tape supplies, together with its SHA-256 digest; a source span alone is insufficient because authored properties and directives can be removed during lowering. The actual module initialization order and corresponding source digests are also bound. The full source identity remains bound through IR even when source spans contain no visible text.

Result events, anchors and source maps use deterministic ordinal references. Maps for explicitly known transient events are validated and excluded; anchors used only by those transient events are excluded too. Durable dependencies and standalone anchors are retained. Warning diagnostics remain identified. Unknown event, anchor or activity references always fail. Event provenance and source-map activities resolve to canonical Plan nodes. Only explicitly owned runtime fields are removed or replaced. Event `payload` and `extensions`, descriptor schemas, selectors, authored row/cell/record IDs and authored review revisions are preserved completely. User fields named `id`, `runId`, `revision`, `duration`, or strings resembling internal IDs are never recursively rewritten. Deterministic legacy labels still present in the carrier body are bound alongside their complete source/content; FNV is never the sole content proof.

This is source-bound identity, not equivalence of arbitrary programs: changing source whitespace, path or document resource ID can change the identity even if visible output is unchanged. JCS does not normalize Unicode; composed and decomposed strings remain distinct. JSON object key order is immaterial; array order is meaningful. Numbers follow JCS's finite IEEE-754 rules, including serialization of negative zero as zero. Authored argument order remains represented in the IR argument sequence and exact source binding.

## Atomicity and failure

Every artifact is detached from live runtime data before the first asynchronous digest operation. Opt-in execution also takes a detached committed result snapshot and uses it for identity, adapters and the published envelope. A module retaining an emitted event cannot change the already identified snapshot during hashing.

IR is identified after parsing; Plan is identified before the first transform; Result is identified before the final cancellation/deadline check and editor commit. A failure after identification starts can return the available Source/Context/IR/Plan entries, but `result` is always null for failed/cancelled runs. Rejection before admission, invalid runtime options, unavailable crypto or cancellation at the initial checkpoint can return no bundle. No failed run receives a committed Result identity, and cached execution evidence remains separately visible.

The profile accepts lossless JSON values and source anchors in the current carrier schemas. Invalid Unicode, unsupported object values, unresolved references, duplicate graph/event/anchor identities and JSON nesting beyond 128 levels fail closed. The CLI rejects malformed UTF-8 instead of silently replacing source bytes. Existing execution deadlines also cover identity computation; this is not a hard CPU sandbox.

## Verification and claims

`verify-identity` validates the [executable artifact contract](SEMANTIC_CONTRACT.md), artifact digests, the identity chain, available source bytes and internal references. The Playground **Verifiera paket** button uses the same verifier; **Ladda ner paket** exports its input. Verification takes a detached snapshot before any asynchronous work and returns its `bundleDigest`. A caller changing its original object during verification cannot change the verified snapshot.

The verifier does not possess original module files, rerun the document or authenticate a publisher. It checks consistency of the supplied bundle; the source text present in CST can be checked against Source. Its response includes `contract`, `structure: valid`, `references: verified` and always says `profileConformance: not-evaluated` and `fullRuntimeConformance: false`. Rehashing an arbitrary changed render can still produce a structurally valid package; this does not establish runtime correctness. Malformed or internally inconsistent rehashed packages are rejected.

`conformance-semantic` executes nine fixed source/module cases in direct, editor and genuinely incremental parser paths, plus a proven stage-cache reuse run: 28 outcomes. It checks expected output/error/commit behavior, recomputes bundle integrity and compares all identities with checked-in golden identities bound to the canonical suite digest. The golden is a reviewed regression baseline generated with this implementation, not evidence of an independently implemented language runtime. Missing/changed fixtures, changed golden bindings, unexpected content or failed integrity checks prevent the profile claim and produce exit code 1. Reports bind the generated kernel, suite and golden with SHA-256.

Additional regression tests cover changed module bytes with unchanged render, effective option normalization, exact payload preservation, source-map changes, mixed artifact chains, mutation during hashing, cancellation and cache/fresh equality.

Only the external runner can report a passed claim for this narrow artifact profile. Identity computation and integrity verification never promote lab Result IDs or generic JSON to full runtime conformance. Full language/runtime profile schemas and fixtures, independent implementations, release-signing identity and a hosted registry remain later Wave 5 work.

Sprint 5.3 adds a separate `textabana.semantic-contract/v1` verifier profile with 80 frozen contract cases, without changing the earlier artifact identities or the 28-case execution profile. See [SEMANTIC_CONTRACT.md](SEMANTIC_CONTRACT.md) for the exact validation boundary and frozen suite manifest.
