# Sprint 5.14 compatibility record

## Delivered increment: 5.14A

The [channel schema policy](reference/channel-schemas.md) replaces shallow handwritten checks with Ajv2020 and an explicitly rejected unsupported-feature boundary. This is a deliberate behavior change, not a documentation-only translation. The accepted policy is visible in capabilities. Valid existing fixed-profile payloads and all frozen expected outcomes are retained.

Authored diagnostics and fallback descriptions in channel handling, document/session operations, module admission/loading, run policy, cache values and execution scheduling/planning are now English. Parser, adapter and lab-conformance messages and embedded example-module text are not part of this increment.

| Contract | Compatibility decision |
|---|---|
| Protocol commands, field names, diagnostic codes and source coordinates | Preserve existing identifiers and behavior. Invalid schema admission adds `TBA-CHANNEL-SCHEMA-LAB`; existing payload errors retain `TBA-TYPE-CHANNEL-LAB`. |
| Missing/circular modules, unknown functions and channel API errors | Assign existing diagnostic families explicitly rather than depending on translated prose. Unknown-function line positions remain unchanged. Reserved/render writes and invalid input-anchor references retain the legacy `TBA-RUN-LAB` family. A user-supplied channel name can no longer accidentally select another family by containing a word matched by the old prose regex. The legacy fallback for untyped module exceptions remains in place. |
| Human-readable diagnostic text | English wording is observable. Consumers matching prose must migrate to stable codes. No promise of identical old/new message bytes is made. |
| Lab failure identity | `lab:` result IDs include diagnostics, so a translated failure can have a different lab ID. This is not a canonical cross-version identity promise. |
| Canonical semantic artifacts v1 | Keep frozen SHA-256 expectations, source/profile versions and parser bytes unchanged. Successful and failed existing semantic fixtures must still pass. |
| Version-bound profile documents | All six independent runtime profile documents and the semantic identity/contract guides were already English on inspection. They and their binding manifests remain byte-identical; no version bump is manufactured for unchanged prose. |
| User/example values | Preserve source, module fixtures, multilingual data and the 43 specification examples. Do not translate identifiers or values merely because they are Swedish. |
| Tests and reports | Update only ordinary assertions that explicitly test translated display wording. Do not regenerate frozen outcomes or golden identities. Rerun reports from the final source and record changed evidence separately. |

## Increment 5.14B.1: parser guide and compatibility boundary

A trial parser-diagnostic translation changed the frozen `syntax-failure` IR identity from `sha256:1395a49402b093213102bf4a157fbd6271968d5af3ab78ebe175c418143c7b88` to `sha256:10c1abecbd093f145e5dd5b3c459d346b4e75f0e328656d0dc24bd3e7895d06c`, while the source, context, error code and failure outcome were unchanged. This is a real artifact compatibility change: diagnostic prose is part of the v1 artifact. The parser translation was not shipped and the golden was not changed.

The parser guide is now English; its EBNF is unchanged. This increment adopts a non-mutating presentation boundary, not a new canonical profile. Existing v1 parser diagnostics retain their original bytes. English presentation must be built outside canonical artifacts, using diagnostic codes and structured recovery information, without replacing raw messages or adding display fields to hashed diagnostics. Raw inspection/export must retain the original artifact. A future change to canonical diagnostic content requires an explicitly versioned profile and independently reviewed expectations alongside the old corpus. No presentation formatter or new profile is shipped in 5.14B.1.

The regression in `tests/semantic-identity.test.mjs` pins the existing syntax-failure identity and proves that changing either primary or related diagnostic prose, or adding a display field, changes the digest and fails verification against the original identity. This prevents a misleading fix that merely adds an English field inside a v1 artifact.

### Remaining identity-sensitive surfaces

| Surface | Observed binding | Required migration |
|---|---|---|
| Parser diagnostics | `identifyIR` omits only `diagnosticId` from diagnostics; primary and related prose remain hashed. | Separate English presentation from raw v1 artifacts. Cover recovery kinds, source details and related locations before wiring it into the UI. |
| Adapter manifests and projections | `adapterManifest` hashes manifest content; projection seeds include manifest digest, adapter version and output. | Review text field by field; version changed manifests/projections explicitly rather than claim unchanged identities. |
| Lab conformance | Structural evidence includes module source digests, adapter manifest digests and result/projection data; golden baselines are versioned. | Preserve the existing baseline and distinguish report presentation from bound evidence before translating. |
| Embedded example modules | Module content participates in source digests and semantic context; explanatory strings inside source are still bytes. | Retain historical fixtures and publish separately versioned English examples if their source changes. Do not translate user values. |

The adapter/conformance/module review here identifies the binding points; it is not a completed field-by-field migration. Their runtime sources, the parser source, frozen profiles and goldens remain untouched.

## Increment 5.14B.2: separate English parser presentation

`app/parser-diagnostic-presentation.ts` now supplies an English view for the Parser tab. It recognizes all 36 current recovery kinds using the parser schema, phase, diagnostic code and matching recovery node, never the original prose. It preserves authored actual/expected values and copies related source spans without mutating the input. Primary coordinates, codes and diagnostic keys remain visible. Related-location labels distinguish interval/block openings and synthetic inner-block recovery from its authored outer-block closing marker.

Unrecognized kinds, schemas, phases, codes or missing/mismatched recovery nodes retain the original message. Original diagnostic JSON remains available in an expandable section; raw IR, exports and kernel responses are unchanged. This is a UI presentation policy, not a canonical artifact projection or a new wire/profile version. Original artifact data may therefore still contain Swedish text.

The application tests exercise the recovery inventory, actual parser failures with Unicode, immutable inputs, related spans, fallbacks and rendered English/raw separation. Existing semantic-profile tests continue to protect the frozen identities. Adapter/conformance/example migration remains the next increment.

## Increment 5.14B.3: separate English conformance presentation

`app/conformance-presentation.ts` returns display strings for report schema `textabana.conformance-report/lab-v1` and suite `textabana.playground/interop-0.7@1.4.0-lab.1`. Requirement identity and status select wording for all 24 current requirement identities. Stage wording distinguishes passed, failed and not-run outcomes. Negative fixture wording also checks fixture/case identity, expected outcome and diagnostic code; cancellation wording checks its declared cooperative boundary. Unknown versions, identifiers or unsupported outcomes preserve original prose.

Only the reading views change. No translated report is created under an old report ID. Report JSON, structural-diff inputs, source/result references, gates, claimability, golden baselines and all runtime files retain their bytes. In particular, a failed plan or projection check receives failure wording rather than the success-sounding message present in the legacy report. This does not change the check result or perform new verification. Contract-only support remains non-claimable; this view does not know CI status or assert full conformance.

The conformance tabs and empty-blocker label are English. Tests exercise the current requirement/outcome inventory, frozen real reports, failed and skipped stages, unknown contracts and rendered reading views. Adapter manifests/projections and embedded example modules remain deferred; their source/digest migration is not claimed here.

Sprint 5.14 remains active. Sprint 5.15 release preparation does not begin automatically; licensing, packaging and security-contact decisions remain open.
