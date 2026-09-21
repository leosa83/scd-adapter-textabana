# Textabana open-source consolidation

| Field | Value |
|---|---|
| Plan | `TA-OSS-CONSOLIDATION-001` |
| Version | `1.1.0` |
| Status | Active; sprint 5.12 in progress |
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
| 5.13 | Engine boundaries and public types | Extract document lifecycle, module admission, channel handling and adapter/conformance logic in small behavior-preserving changes; complete public response types, supply hosting environment types, add a clean type-check gate and document ownership, errors and invariants. |
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

## Sprint 5.12: translation contract

1. Translate all specification prose and requirement evidence notes into English. Keep the same 34 section IDs, 144 requirement IDs, links, public identifiers, normative force and implementation limits. Keep all 43 fenced examples byte-identical; multilingual source content remains legitimate input.
2. Use the [translation glossary](docs/translation-glossary.md) for normative language, lifecycle terms and identity distinctions. Record the Swedish source and English target per requirement with digests and checks. This review is performed within the implementation task; it is not independent external acceptance or a conformance claim.
3. Translate authored labels, explanations, empty states and accessibility copy in all eight lab panels. Preserve runtime messages, user-authored values, fixtures and protocol data. Their translation belongs to the separately versioned runtime/profile work.
4. Add an English API reference for the current TypeScript client, editor bindings, Node transport, Python client and JSONL boundary, grounded in their actual signatures, state ownership and error behavior. Add explanatory API comments without changing method signatures or response semantics. Complete response types and hosting declarations remain sprint 5.13 work.
5. Extend the migration checks to English requirements while retaining the frozen Swedish baseline and code-example expectations. Check negative modal/identifier edits, render the translated specification and labs, run existing integration/host tests and verify the build. Update the register and publish matching Git trees to GitHub and Sites.

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

Observed on Linux with Node 24.19.0 and Python 3.12.14:

| Check | Result |
|---|---|
| Clean detached source checkout | Installed 809 packages with `npm ci --prefer-offline`, using the existing download cache and a fresh `node_modules`. No dependency versions changed. |
| Headless development | `npm run docs:check`, `npm run lint` and all 219 headless tests passed in the clean checkout. `dist/` was absent both before and after `npm test`. |
| Application | `npm run test:app` built the application and passed all 6 rendering/component tests in the clean checkout. The Sites build helper also passed in the deployment checkout. |
| Specification extraction | 34 Markdown sections preserve all 144 normative requirements, stable section/requirement anchors and all 43 code examples against the independent sprint 5.10 baseline. The rendered component preserves their anchors, examples and evidence disclosures. |
| Standards assessment | All 11 rows are generated from one source into both the guide and specification. No new standards-conformance claim or runtime behavior was introduced. |
| External reports | All nine CLI suites passed. Six checked-in reports changed only their `package-lock.json` source fingerprint after the workspace name change; the other three reports remained byte-identical. Frozen profile expectations were unchanged. |
| Generated sources | Regeneration and both test suites left the clean checkout's tracked files unchanged. |
| Type checking | `tsc --noEmit` reports three hosting declaration errors, documented in the development guide and scheduled for sprint 5.13. It is not a passing gate. |
| GitHub Actions | The workflow defines headless jobs for Node 22/24 and an application job for Node 22. Hosted execution is separate from these observed local results; consult [Actions](https://github.com/leosa83/scd-adapter-textabana/actions/workflows/ci.yml) for the status of the published commit. |

The first English increment covers repository entry points, contribution/development/architecture guidance, integration and standards guides, application controls, fixture summaries and specification navigation/introduction. The [migration register](docs/english-migration.md) records remaining specification prose, lab panels, API comments, diagnostics and version-bound profiles. Sprint 5.12 begins with an agreed glossary and the English reference/lab/API documentation; structural engine work follows in 5.13.

Publication uses matching Git trees in GitHub and Sites. Deployment status is verified separately through the hosting service; a local build alone is not a publication claim.
