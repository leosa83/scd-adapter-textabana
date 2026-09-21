# Translation glossary and review rules

This glossary governs sprint 5.12. English is the authored reference language. The original Swedish requirement baseline remains available for comparison; an English translation does not introduce a new runtime capability or broaden a profile claim.

## Normative language

| Swedish | English | Preserved meaning |
|---|---|---|
| MÅSTE | MUST | Required behavior within the stated contract or profile. |
| MÅSTE INTE / FÅR INTE | MUST NOT | A prohibition; never translate it as optional behavior. |
| BÖR | SHOULD | A recommendation, not an unconditional requirement. |
| BÖR INTE | SHOULD NOT | A recommendation against a behavior. |
| FÅR | MAY | Permission, not a guarantee of implemented support. |
| kan | can | Ability or possibility; it does not automatically imply normative permission. |

## Domain terms

| Swedish wording | English term | Boundary |
|---|---|---|
| källa / källdokument | source / source document | Authored input, separate from its rendered result. |
| dokumentrevision | document revision | Monotonic state within a document session. |
| dokumentversion | document version | Content-bound identity, separate from the revision counter. |
| körning | run | One accepted execution and its captured input state. |
| resultat / committat resultat | result / committed result | Domain values become durable only after a successful commit. |
| block / intervall | block / interval | Nested structural region versus independently opened and closed scope. |
| arv / intervallinjektion | inheritance / interval injection | Separate mechanisms with explicit order and scope. |
| kanal | channel | Typed append-only events within a run; `render` remains the primary return value. |
| ankare / källkoppling | anchor / source mapping | Version-bound target and relation to source; continuity across revisions is explicit. |
| körplan / körspår | execution plan / execution trace | Planned dependencies versus observed resolutions. |
| förhandskontroll / exportkontroll | admission check / export validation | Package checks before entrypoint execution versus checks of loaded exports. |
| projektion | projection | A derived representation; it does not become an authoritative contract. |
| återanvändning | reuse | Actual materialization from cache, separate from eligibility or a lookup hit. |
| avgränsad delmängd / målkontrakt | bounded subset / target contract | Implemented scope versus a requirement that is not yet fully implemented. |
| kandidat / granskningsrevision | candidate / review revision | Immutable proposal versus an append-only human decision. |
| deklarerat / möjligt att göra anspråk på | declared / claimable | Catalog support versus evidence satisfying every applicable requirement. |

## Review procedure

Read each original requirement next to its English target. Preserve its actor, obligation or permission, trigger, scope, exclusions, order, atomicity and identity rules. Preserve inline protocol identifiers and links. Use the same implementation and verification sources; a translation is not new implementation evidence.

The translation ledger records source and target text, their hashes, modal sequence and protected inline tokens. Automated checks detect drift and structural omissions; they cannot establish semantic equivalence of arbitrary prose. The ledger records an author review, not an independent reviewer or user approval. The original requirement and code-example baselines must not be regenerated from the translated implementation.

Keep source examples, runtime diagnostic strings and version-bound profile bytes unchanged in this sprint. The app may therefore display Swedish user data or runtime messages even when its authored interface and reference documentation are English.
