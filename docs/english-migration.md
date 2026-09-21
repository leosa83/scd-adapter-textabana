# English migration register

English is the primary language of Textabana's application, documentation and codebase. This is an incremental migration, not a claim that every current string is already English.

| Surface | Completed through sprint 5.14A | Remaining work |
|---|---|---|
| README, contributor/development guides, architecture and active consolidation plan | English primary entry points. | Keep new changes in English. |
| Application shell and lab panels | English navigation, controls, metadata, fixture summaries, all eight lab panels, empty states and accessibility labels. Selected kernel diagnostics now arrive in English. | Parser/adapter/conformance messages and embedded module explanations remain sprint 5.14B work. User-authored values remain in their original language. |
| Specification | All 34 Markdown sections, 144 requirements and requirement evidence notes in English. A reviewed glossary and per-requirement translation ledger preserve the Swedish source. | Review future contract edits against the ledger and declared compatibility scope. |
| Integration and standards guides | English guidance for current behavior and known limits. | Keep aligned with implementation changes. |
| SDK | English API reference and source comments; all nine command responses, failures and metadata chunks are typed independently of the app. | Maintain comments and types as APIs evolve. |
| Runtime and versioned conformance profiles | English diagnostics in channels, editor lifecycle, module admission/loading, scheduler/planning, run policy and cache values. The parser guide is English as of 5.14B.1, with unchanged EBNF. The six independent profile documents and semantic identity/contract guides were already English and retain their bound bytes. | Implement separate English parser-diagnostic presentation without altering v1 artifacts. Review adapter/conformance copy and embedded modules against their digests. See the compatibility record for remaining 5.14B work. |
| Examples and tests | All 43 specification examples and the frozen pre-migration baseline remain byte-identical. Multilingual inputs are intentional. | Translate remaining explanatory comments and descriptions; retain Unicode/locale regression data. |
| Historical plans and third-party material | Preserve history and original notices; add new completion records in English. | English summaries of history where useful; never rewrite legal text as a translation cleanup. |

## Translation evidence

The [glossary](translation-glossary.md) defines terminology and modal force. The [translation ledger](translation-ledger.json) records each requirement's Swedish source, English target, digests and author review. Checks compare it with the independent frozen sprint 5.10 baseline, preserve requirement/section IDs and inline protocol tokens, and reject changed modal force. They also preserve every fenced example byte for byte.

Author review covers the translated prose. Automated checks do not prove semantic equivalence of arbitrary language, independent acceptance or standards conformance. Sprint 5.12 changed documentation and authored UI copy; runtime diagnostics, module source, profile contracts and expected results retained their existing bytes. Sprint 5.13 separated the engine and added static host types without translating diagnostic strings or changing profile expectations. Sprint 5.14A translates selected kernel messages and deliberately tightens channel validation. The [compatibility record](compatibility-5.14.md) distinguishes changed display wording and lab failure IDs from the unchanged frozen canonical artifact corpus.

## Translation rules

Keep requirement IDs, schema names, command names, diagnostic codes and public identifiers stable unless a separate compatibility change is accepted. Translate normative Swedish `MÅSTE`, `BÖR` and `FÅR` as `MUST`, `SHOULD` and `MAY`, with their original force. Distinguish implemented, partially implemented, target-only and independently verified behavior.

Document, source, revision, version, run, result, channel, anchor, source map, artifact and projection have distinct meanings. Preserve those distinctions. A source example containing Swedish text is not automatically untranslated product copy; source content may be deliberately multilingual.

For each translated contract, review its meaning against the previous version, run relevant examples and tests, and update the evidence links. Do not alter a golden value merely because its surrounding prose has changed.
