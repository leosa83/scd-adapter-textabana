# Textabana semantic artifact contract — v1

Sprint 5.3 supplies an executable structural contract and internal consistency checks for `textabana.semantic-artifacts/v1`. The verifier profile is `textabana.semantic-contract/v1`. It preserves all previously frozen Source/Context/IR/Plan/Result identities; it tightens acceptance of supplied packages.

## Use and outputs

```bash
node cli/textabana.mjs identify examples/document.md > identity.json
node cli/textabana.mjs verify-identity identity.json
node cli/textabana.mjs conformance-contract > contract-report.json
```

In Playground, enable **SHA-256-identiteter**, run the document, and open **Conformance → Identiteter → Verifiera paket**. Download the same package, the portable schema and the published test report from that view. Verification status belongs to that specific result and is hidden when another result arrives.

Successful verification reports `structure: valid`, `references: verified`, the exact detached `bundleDigest`, artifact identities and contract ID. It always retains `profileConformance: not-evaluated` and `fullRuntimeConformance: false`. CLI failure returns exit code 1 without a success payload. JavaScript errors use `TBA-IDENTITY-PROFILE` with `validationPhase` identifying `json`, `schema`, `digest`, `chain`, `claims` or `references`.

## Validation boundary

| Layer | Required checks |
|---|---|
| JSON and snapshot | Lossless JSON, well-formed Unicode, finite numbers, duplicate-key rejection in text input, nesting limit; synchronous detached copy before loading the verifier or awaiting cryptography. CLI rejects malformed UTF-8. |
| Schema | Required, typed envelope fields and versioned carriers; explicit nullable phase slots; supported policies and host ceilings; graph node variants, ports, committed durable events, anchors, selectors and mappings. Unknown fields in closed structures fail. |
| Digests and chain | Recompute each SHA-256 over JCS; Source → Context/IR → Plan → Result links must resolve. Plan needs IR; Result needs Plan. Input-only and failed-run partial packages are valid; missing phase slots differ from explicit null. |
| Context | Unique normalized module paths in canonical order, unique sorted grants and actual module digest links. Module bytes absent from a package cannot be independently recovered or authenticated. |
| IR/source | Reconstruct source from CST and check its SHA against Source; contiguous CST spans and code-point coordinates; complete IR/CST/AST source coverage; flat/tree node agreement, block hierarchy, interval references, syntax stages, source lines and validity counts. |
| Plan | Canonical node/edge ordinals, unique ports, resolved graph links, topological order, complete paths to one render terminal; source-value hashes, Context module/init bindings, IR stage/argument links and internally consistent eligibility flags. |
| Result | Only committed durable snapshots; canonical event/anchor/map references; matching descriptor/channel/source links; stage origin and provenance; unique global sequence and channel order; source-bound anchor positions/quotes; one map per durable event with known anchors and matching generating stage; bound render/event/stage limits. |

Source, Context and outer IR/Plan/Result structures are closed. Graph nodes, events and owned anchor/map structures are also closed to unsupported fields. Existing carrier detail records in IR nodes, blocks, scopes and diagnostics remain extensible where declared by the schema. Payload, `extensions`, authored arguments, projections, manifests, descriptor schemas and domain selectors remain JSON data. The verifier does not recursively treat strings or properties called `id`, `revision` or `runId` as internal references.

IR `activeScopeIds` and Plan `scopeId` contain authored interval aliases; `IntervalOpen.scopeId`, `IntervalClose.scopeId` and scope-table keys use structural scope IDs. Both are checked in their own namespace without rewriting authored aliases. An unresolved function can leave a Plan with `module: null` and no Result; a committed Result cannot use that unresolved Plan.

These checks do not prove complete parsing/lowering/execution semantics. For example, the verifier checks an embedded Plan source value against its digest but does not rebuild the operation tape; it checks an event's origin against its Plan stage but does not prove the module emitted the event. Arbitrary module behavior, external inputs, descriptor-schema semantics, domain record identities, quote context hints and every possible carrier extension are outside this contract. A changed render with consistent hashes may therefore pass. This explicit positive test protects the distinction between package consistency and execution evidence.

## Schema publication and build

- Authoritative definition: [contracts/semantic-bundle-v1.js](contracts/semantic-bundle-v1.js).
- Portable JSON Schema: [public/contracts/semantic-bundle-v1.schema.json](public/contracts/semantic-bundle-v1.schema.json), ID `urn:textabana:semantic-bundle:v1`.
- Generated validator: `runtime/generated/semantic-bundle-validator.js`.
- Reference checks: `runtime/semantic-contract.js`; detached verification: `runtime/semantic-verification.js`.

The runtime build generates portable JSON and a standalone browser validator from the same definition. It uses JSON Schema Draft 2020-12 and [Ajv's standalone compilation](https://ajv.js.org/standalone.html). Ajv is pinned as a direct build dependency. Validation does not compile schemas or execute dynamic code in the browser. Tests check the generated validator against fresh compilation and run it with dynamic code generation disabled. The main execution worker does not load the verifier.

## Frozen external verifier profile

The external runner consumes static baseline bundles and declarative mutations; no kernel executes during these 80 checks. Eleven baseline packages cover empty text, Unicode, successful stages, user payload, warnings, syntax/module/stage failures and intervals. Three further valid cases cover input-only packages, arbitrary user identity fields and a changed render. The 66 rejection cases cover JSON, shape, claims, digest, chain and reference failures.

Most negative cases recompute every artifact digest and downstream top-level chain reference. Stale-checksum detection alone cannot make these cases pass. Separate digest and chain cases deliberately preserve the targeted inconsistency. A fixture preparation failure is an infrastructure error, never successful rejection evidence.

The [versioned manifest](conformance/profiles/semantic-contract-v1.manifest.json) binds the complete suite (including expected outcomes), case count and portable schema by canonical SHA-256. The suite binds the exact static baseline corpus. Removing a case or changing its expectation blocks the claim. Changes to schema/suite require an explicit reviewed manifest update; there is no automatic golden-refresh CLI.

Reports bind suite, manifest, baseline, schema, verifier implementation and runner source digests. `claimable` and `artifactContract` become true only when every expected outcome passes. The claim is restricted to this fixed verifier profile. The manifest is an unsigned regression baseline; it is not a release signature or an independent authority. Published reports are snapshots of the checked source, not continuous CI status.

The separate execution profile still verifies 28 actual runtime outcomes against unchanged golden identities. All 15 existing Playground examples are also checked for acceptance by the stricter verifier. Full production language/domain profiles, independent-runtime comparison, release-signing identity and a hosted package registry remain later Wave 5 work.
