# Contributing to Textabana

Start with the [development guide](docs/development.md) and [architecture map](docs/architecture.md). The current work is governed by the [consolidation plan](CONSOLIDATION_PLAN.md).

## Describe the intended behavior first

For a semantic change, identify the affected requirement or versioned profile, the intended observable behavior, compatibility impact and at least one counterexample. Update the relevant contract before implementing the behavior. A passing test cannot silently redefine a normative requirement.

Keep behavior-preserving refactoring, translations and semantic changes in separate commits when practical. Explain the reason for a change and its effect on users. Include the commands actually run, their outcomes and any remaining limitations in the pull request.

## Language and documentation

Write new UI text, documentation and comments in English. Follow the [English migration register](docs/english-migration.md). Retain meaningful multilingual test inputs. Do not translate protocol identifiers or blindly rewrite fixtures, expected digests, versioned reports or third-party license text.

Edit specification prose in `docs/reference/specification/`, then run `npm run docs:build`. Do not edit generated documentation JSON. Requirement IDs and links are stable interfaces. Update the requirement binding when a contract's implementation or verification boundary changes.

Document public code by responsibility, accepted inputs, returned results, errors, state ownership and relevant invariants. Comments should explain constraints and reasons that names and types cannot convey. Changes to public behavior need a corresponding reference update and an executable example where useful.

## Checks

Run `npm run docs:check`, `npm run types:check`, `npm run typecheck`, `npm run lint` and `npm test`. For changes affecting the application, also run `npm run test:app`. New `tests/*.test.mjs` files automatically join the headless suite unless explicitly assigned to the application suite in `scripts/run-tests.mjs`.

Preserve independent reference implementations and frozen conformance expectations. Shared examples may be consumed by the app and tests; expected outcomes must not simply be recalculated from the implementation being tested.

## Project status

The repository is being prepared for an open-source release. A project license and contribution licensing terms have not yet been selected; this guide does not grant a license or introduce a contributor agreement. The release checklist in the consolidation plan tracks that decision. Third-party notices retain their original terms.
