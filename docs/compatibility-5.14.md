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

## Deferred increment: 5.14B

A trial parser-diagnostic translation changed the frozen `syntax-failure` IR identity from `sha256:1395a49402b093213102bf4a157fbd6271968d5af3ab78ebe175c418143c7b88` to `sha256:10c1abecbd093f145e5dd5b3c459d346b4e75f0e328656d0dc24bd3e7895d06c`, while the source, context, error code and failure outcome were unchanged. This is a real artifact compatibility change: diagnostic prose is part of the v1 artifact. The parser translation was not shipped and the golden was not changed.

The next increment must decide and document an explicit presentation-versus-artifact/version boundary before translating parser diagnostics. It must also review adapter/projection identities, lab-conformance prose and embedded module source/digests before translating them, and finish the parser guide. Retain the old profile corpus and make any new profile expectations independently reviewable rather than overwriting old evidence.

Sprint 5.14 remains active after 5.14A. Sprint 5.15 release preparation does not begin automatically; licensing, packaging and security-contact decisions remain open.
