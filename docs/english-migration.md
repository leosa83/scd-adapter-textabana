# English migration register

English is the primary language of Textabana's application, documentation and codebase. This is an incremental migration, not a claim that every current string is already English.

| Surface | Sprint 5.11 scope | Remaining work |
|---|---|---|
| README, contributor/development guides, architecture and active consolidation plan | English primary entry points. | Keep new changes in English. |
| Application shell and metadata | English navigation, editor controls, fixture summaries, accessibility labels and page metadata. | Translate individual lab panels and remaining example explanations in sprint 5.12. |
| Specification | Move all sections into readable Markdown; English navigation and introduction. Preserve current normative wording during extraction. | Translate remaining sections and all 144 requirements with a reviewed term mapping. Swedish sections identify their language. |
| Integration and standards guides | English guides for current behavior and known limits. | Keep aligned with implementation changes. |
| SDK and runtime | Existing identifiers are predominantly English. | English API comments and complete response types; then translate observable diagnostics with explicit compatibility tests. |
| Versioned conformance profiles | Preserve source bytes while moving the general documentation. | Review translations, profile versions and manifest digests together. |
| Examples and tests | Preserve multilingual inputs and frozen expected outcomes. | Translate explanatory comments and descriptions; retain Unicode/locale regression data. |
| Historical plans and third-party material | Preserve history and original notices. | English summaries of history where useful; never rewrite legal text as a translation cleanup. |

## Translation rules

Keep requirement IDs, schema names, command names, diagnostic codes and public identifiers stable unless a separate compatibility change is accepted. Translate normative Swedish `MÅSTE`, `BÖR` and `FÅR` as `MUST`, `SHOULD` and `MAY`, with their original force. Distinguish implemented, partially implemented, target-only and independently verified behavior.

Document, source, revision, version, run, result, channel, anchor, source map, artifact and projection have distinct meanings. Preserve those distinctions. A source example containing Swedish text is not automatically untranslated product copy; source content may be deliberately multilingual.

For each translated contract, review its meaning against the previous version, run relevant examples and tests, and update the evidence links. Do not alter a golden value merely because its surrounding prose has changed.
