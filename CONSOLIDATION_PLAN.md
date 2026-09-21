# Textabana open-source consolidation

| Field | Value |
|---|---|
| Plan | `TA-OSS-CONSOLIDATION-001` |
| Version | `1.2.1` |
| Status | Active; sprints 5.11–5.13 implemented, sprint 5.14 next |
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

## Sprint 5.13: boundary and typing contract

1. Separate document/session lifecycle, module admission/loading, channel collection, result construction, adapter projections and lab conformance from the Worker dispatcher. State belongs to a kernel instance or accepted run; extracted modules must not import the Worker or the app.
2. Preserve public messages, diagnostic bytes, validation precedence, captured revisions, commit timing, cancellation, cache observations, channel ordering and frozen profile outcomes. Keep the established handwritten channel dialect unchanged for the separately scoped sprint 5.14.
3. Move reusable runtime data types out of the presentation layer. Type all nine command responses, protocol failures and metadata chunks; convenience methods infer their response. Keep the explicit generic command escape hatch and rejection semantics. Static types do not imply runtime validation.
4. Supply hosting types from the installed Cloudflare tooling, with optional bindings represented honestly. Add a reproducible repository-wide type-check command and CI gate without hiding source errors or adding broad ambient `any` declarations.
5. Verify isolated kernel state and unchanged message behavior with the existing regression suites and focused boundary/type-consumer tests. Refresh source-bound reports without rewriting golden expectations. Document ownership, errors and remaining limitations, then publish matching Git trees and the existing Site.

## Working rules

- Commit planning, behavior-preserving structure and user-visible changes as separate logical changes.
- Define semantic changes before implementation; keep runtime changes separate from document moves and translation.
- Share example inputs where useful, but preserve independent reference implementations and frozen expected outcomes.
- Document public APIs by responsibility, input/output, error behavior, state ownership, commit timing and contract references. Generate mechanical API reference where practical.
- Keep current guidance separate from sprint history. Preserve historical records and stable links while introducing a readable entry point.
- Avoid adding runtime features during the consolidation unless needed to close an explicitly accepted contract gap.

## Decisions still required for the first open-source release

The owner has requested open-source preparation but has not selected a project license. Do not invent a license grant. License selection and a working private security reporting route are release requirements, not blockers for repository cleanup. The current application workspace remains private as an npm package until distributable packages and release policy are defined.

## Validation record: sprint 5.11

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

The first English increment covered repository entry points, contribution/development/architecture guidance, integration and standards guides, application controls, fixture summaries and specification navigation/introduction. Sprint 5.12 completes the reference, lab explanations and SDK documentation. The [migration register](docs/english-migration.md) tracks the remaining runtime, profile and historical material.

## Validation record: sprint 5.12

Implemented on 2026-09-21 with Node 24.19.0 and Python 3.12.14:

| Check | Result |
|---|---|
| Specification | All 34 sections and 144 requirements are English. The translation ledger binds each original Swedish requirement to its reviewed English target. All section/requirement IDs, inline protocol tokens, formal modal force and 43 fenced code examples pass the frozen-baseline checks. |
| Negative translation checks | Deliberately weakening a prohibition or changing a protected range identifier is rejected even after the English digest is recalculated. Author review remains necessary for prose meaning; these checks are not independent acceptance. |
| Lab rendering | All eight panels render real successful and failed kernel results with English controls and status copy. Runtime diagnostic codes and multilingual source values remain data. Existing stale descriptions of parser/cache reuse were corrected. |
| SDK | English API reference and source comments cover current signatures, responses, ownership, Unicode conversion, errors and shutdown. TypeScript/Node emitted executable code and Python AST without docstrings are unchanged. No response type or runtime behavior was added. |
| Automated checks | All 220 headless tests and 7 application tests pass. Documentation freshness, local links, lint and the Sites production build pass. Existing integration tests execute the TypeScript/Node and Python/JSONL examples. |
| Integrity records | Python documentation changes require a new local adapter catalog entry, `org.textabana.python@1.0.1`, and new file/package digests; registry verification passes. Four external profile reports were rerun and changed only the Node transport source fingerprint after API comments were added. Their outcomes, fixtures and claims are identical; the other five reports remain byte-identical. |
| Preserved semantics | Runtime/compiler sources, generated kernel, profile contracts, manifest expectations and frozen regression data are unchanged. Multilingual examples and version-bound diagnostics retain their original text. |
| Remaining limits | Full SDK response types, engine separation and the three previously recorded hosting type errors remain sprint 5.13 work. Observable diagnostic translation and profile migration remain sprint 5.14 work. This translation does not expand standards support. |
| Hosted CI | Local results above are observed; GitHub Actions status is recorded by the workflow for the published commit and must be checked separately. |

Sprint 5.13 follows this translation increment with engine responsibility separation, public response types and a clean repository-wide type-check gate. The established-format direction and explicit standards boundaries remain unchanged.

## Validation record: sprint 5.13

Implemented on 2026-09-21 with Node 24.19.0 and Python 3.12.14:

| Check | Result |
|---|---|
| Engine boundaries | The Worker dispatcher is reduced from 4,219 to 963 lines. Document/session state, admission/loading, channel collection, result construction, adapter projections and lab conformance have explicit source modules. Editor and loader instances own their mutable state; lower-level modules do not import the app or dispatcher. |
| Behavior preservation | All prior regression cases pass. A source comparison retains 85 of the original 88 function bodies after formatting normalization; the three changed functions replace direct transport delivery, the scheduler busy guard and loader-cache clearing with explicit instance dependencies. The public protocol, diagnostic text and frozen outcomes are unchanged. |
| Boundary tests | Two new tests verify isolated document revisions, parser caches and subscriptions; busy checkpoint rejection; and independent module closures/reset. |
| SDK response types | All nine command responses, protocol/run/transport failures, metadata chunks, checkpoints and shared runtime/result records are exported from the SDK. The app reuses them. Strict standalone consumer compilation checks inference, discrimination, editor bindings and expected errors. Explicit generic assertions remain available; open payloads remain unknown and runtime validation is not claimed. |
| Hosting types | Official runtime declarations are generated by the locked Wrangler/workerd toolchain with a pinned date/flags configuration. Optional D1 is declared explicitly. Generated declaration freshness and repository-wide TypeScript checks pass; the three earlier hosting declaration errors are resolved. CI includes both gates on Node 22 and 24. |
| Tests and build | All 222 headless tests and 7 application tests pass. Lint has no errors or warnings; documentation freshness, type checks and the production build pass. SDK and UI type-only edits produce unchanged executable output. |
| External evidence | All nine CLI suites pass. Eight reports refresh only kernel/source fingerprints; their checks, fixtures and profile claims are unchanged. The contract report is byte-identical. Six runtime reports now identify the extracted source modules explicitly through a shared source list. |
| Documentation | Architecture and kernel operation references describe state ownership, dependencies, errors and commit ordering. SDK/integration/development guides, contribution checks and requirement implementation links reflect the new boundaries. |
| Remaining limits | The engine remains JavaScript tested by behavior/profile suites; repository type checking does not claim full `checkJs` coverage. Complete runtime response validation, published packages, a project license and broad standards adapters are not added. Channel validation and diagnostic/profile translation remain sprint 5.14 work. |
| Hosted CI | Local results above are observed. The published commit's workflow separately records hosted Node 22/24 and application outcomes. |

Next is sprint 5.14: define and enforce the channel schema boundary using an established validator or a strictly rejected unsupported dialect, then translate observable diagnostics and version-bound profile prose with explicit compatibility review. Preserve multilingual inputs and frozen expectations through that migration.

Publication uses matching Git trees in GitHub and Sites. Deployment status is verified separately through the hosting service; a local build alone is not a publication claim.
