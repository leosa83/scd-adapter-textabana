# English migration register

English is the primary language of Textabana's application, documentation and codebase. This is an incremental migration, not a claim that every current string is already English.

| Surface | Completed through sprint 5.12 | Remaining work |
|---|---|---|
| README, contributor/development guides, architecture and active consolidation plan | English primary entry points. | Keep new changes in English. |
| Application shell and lab panels | English navigation, controls, metadata, fixture summaries, all eight lab panels, empty states and accessibility labels. | Translate version-bound runtime diagnostics and embedded module explanations in sprint 5.14. User-authored values remain in their original language. |
| Specification | All 34 Markdown sections, 144 requirements and requirement evidence notes in English. A reviewed glossary and per-requirement translation ledger preserve the Swedish source. | Review future contract edits against the ledger and declared compatibility scope. |
| Integration and standards guides | English guidance for current behavior and known limits. | Keep aligned with implementation changes. |
| SDK | English API reference, TypeScript/Node API comments and Python docstrings covering inputs, responses, errors, lifecycle and ownership. | Complete response types and hosting declarations in sprint 5.13. |
| Runtime and versioned conformance profiles | Preserve source bytes and observable behavior while translating reference material. | English diagnostics/comments and profile prose in sprint 5.14, with compatibility tests and profile/manifest digest review. |
| Examples and tests | All 43 specification examples and the frozen pre-migration baseline remain byte-identical. Multilingual inputs are intentional. | Translate remaining explanatory comments and descriptions; retain Unicode/locale regression data. |
| Historical plans and third-party material | Preserve history and original notices; add new completion records in English. | English summaries of history where useful; never rewrite legal text as a translation cleanup. |

## Translation evidence

The [glossary](translation-glossary.md) defines terminology and modal force. The [translation ledger](translation-ledger.json) records each requirement's Swedish source, English target, digests and author review. Checks compare it with the independent frozen sprint 5.10 baseline, preserve requirement/section IDs and inline protocol tokens, and reject changed modal force. They also preserve every fenced example byte for byte.

Author review covers the translated prose. Automated checks do not prove semantic equivalence of arbitrary language, independent acceptance or standards conformance. This increment changes documentation and authored UI copy; runtime diagnostics, module source, profile contracts and expected results retain their existing bytes.

## Translation rules

Keep requirement IDs, schema names, command names, diagnostic codes and public identifiers stable unless a separate compatibility change is accepted. Translate normative Swedish `MÅSTE`, `BÖR` and `FÅR` as `MUST`, `SHOULD` and `MAY`, with their original force. Distinguish implemented, partially implemented, target-only and independently verified behavior.

Document, source, revision, version, run, result, channel, anchor, source map, artifact and projection have distinct meanings. Preserve those distinctions. A source example containing Swedish text is not automatically untranslated product copy; source content may be deliberately multilingual.

For each translated contract, review its meaning against the previous version, run relevant examples and tests, and update the evidence links. Do not alter a golden value merely because its surrounding prose has changed.
