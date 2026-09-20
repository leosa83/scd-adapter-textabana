# Textabana open-source consolidation

| Field | Value |
|---|---|
| Plan | `TA-OSS-CONSOLIDATION-001` |
| Version | `1.0.0` |
| Status | Active; sprint 5.11 in progress |
| Baseline | Sprint 5.10, GitHub `a0ec88761b904602e28522a6334bc90c5ae0f5e3` |
| Accepted | 2026-09-20 |
| Goal | A repository that external developers can understand, run, test and maintain without conversation history or a Sites account |

## Direction

Preserve Textabana's semantic contracts while separating the reusable engine, host interfaces, examples, documentation and deployed playground. Use established formats and libraries at interchange boundaries. Make implementation limits explicit. A documentation index is not proof that every requirement is satisfied.

English is the primary language for the entire application and codebase. New public documentation, UI copy, comments and developer-facing explanations must be English. Translate existing material in coherent increments. Preserve identifiers, source coordinates, protocol values, user-authored text and multilingual Unicode regression cases. Changes to observable diagnostics, defaults or version-bound specifications need explicit compatibility review and tests; they are not mechanical text replacement.

## Sequence and acceptance

| Sprint | Scope | Acceptance |
|---|---|---|
| 5.11 | Reproducible development, document sources, first English surfaces | Standalone headless test command; checked-in CI; contributor/developer guides; readable specification documents rendered by the app; all 144 requirement IDs and existing anchors preserved; English README, app shell and new guidance; remaining translation work recorded. |
| 5.12 | English reference, lab panels and API documentation | Specification, lab explanations and SDK documentation in English, with a reviewed glossary and requirement-level translation checks; no accidental changes to examples or runtime behavior. |
| 5.13 | Engine boundaries and public types | Extract document lifecycle, module admission, channel handling and adapter/conformance logic in small behavior-preserving changes; complete public response types and document ownership, errors and invariants. |
| 5.14 | Contract gaps and remaining code translation | Established channel schema validation or a strictly enforced documented dialect; targeted positive/negative tests; English diagnostics/comments with compatibility changes declared; version-bound profiles migrated deliberately. |
| 5.15 | External release | Chosen project license and dependency notices; version/release policy; packaged CLI/SDK installed into an external consumer project; documented contribution/security contact; clean checkout and release verification. |

## Sprint 5.11: implementation contract

1. `npm test` runs headless checks without a web build or a Sites login. A separate command builds and tests the application. Every existing test belongs to a declared suite, and new tests cannot silently fall out of the default check.
2. The existing package manager and dependency versions remain in use. Node, Python and OS requirements are explicit. Sites-specific deployment helpers remain available without becoming mandatory for kernel development.
3. CI runs the documented commands, uses a read-only repository token and does not publish. CI configuration and observed remote run status must be reported separately.
4. Specification prose is authored in Markdown under `docs/reference/`. The React component presents generated content. Requirement extraction reads document sources, not JSX. Keep current normative wording during the structural move; translating a requirement is a separately visible edit.
5. Preserve the 144 requirement IDs, section anchors, code examples, links and normative content. Verify the migration against a frozen baseline independently of the new generator. Preserve narrow profile documents whose byte digests are part of conformance manifests.
6. Provide an English README, documentation index, development/contribution guides, architecture map and language migration register. Translate the application shell and metadata as the first UI slice. Clearly identify remaining Swedish specification/lab/runtime content.
7. Check a clean source copy with no pre-existing web build. Regenerate docs and kernel artifacts, run relevant tests, build the Site, publish matching source trees to GitHub and Sites, and record actual outcomes.

## Working rules

- Commit planning, behavior-preserving structure and user-visible changes as separate logical changes.
- Define semantic changes before implementation; keep runtime changes separate from document moves and translation.
- Share example inputs where useful, but preserve independent reference implementations and frozen expected outcomes.
- Document public APIs by responsibility, input/output, error behavior, state ownership, commit timing and contract references. Generate mechanical API reference where practical.
- Keep current guidance separate from sprint history. Preserve historical records and stable links while introducing a readable entry point.
- Avoid adding runtime features during the consolidation unless needed to close an explicitly accepted contract gap.

## Decisions still required for the first open-source release

The owner has requested open-source preparation but has not selected a project license. Do not invent a license grant. License selection and a working private security reporting route are release requirements, not blockers for repository cleanup. The current application workspace remains private as an npm package until distributable packages and release policy are defined.

## Validation record

To be completed from observed sprint results. Local validation does not imply that a hosted GitHub Actions run has passed.
