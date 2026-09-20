# Development

## Requirements

- Node.js 22.13 or later; the CI matrix covers Node 22 and 24.
- npm and the checked-in `package-lock.json`.
- Python 3.10 or later, available as `python3`, for independent reference implementations and Python host tests.
- Linux or WSL2 is the documented environment. The application build also uses Bash and GNU `timeout`. Native Windows and macOS have not yet been certified by this workflow.

No Sites account, deployment credentials, API keys or database are required to run the kernel and its tests. The current workspace still installs the application dependencies together with the kernel dependencies; independent distributable packages are planned.

## From a clean checkout

```sh
git clone https://github.com/leosa83/scd-adapter-textabana.git
cd scd-adapter-textabana
npm ci
npm test
```

`npm test` builds the generated parser, schema validator and Worker, then runs the headless suite. It does not build the website or require an existing `dist/` directory. The headless suite includes runtime, SDK, independent conformance, examples and documentation checks. Some playground fixture tests still read authored examples from the app; extracting those examples is tracked separately.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Build the kernel and run headless checks with two test files at a time. |
| `npm run test:app` | Build the website and run application component/rendering checks. |
| `npm run test:all` | Run both suites. |
| `npm run lint` | Check authored code without a Sites environment wrapper. |
| `npm run docs:build` | Regenerate the specification projection and requirement/source indexes. |
| `npm run docs:check` | Reject stale generated documentation, missing sources and invalid references. |
| `npm run runtime:build` | Rebuild the parser, schema validator and browser Worker. |
| `npm run dev` | Start the application locally. |
| `npm run build` | Generate documentation and build the application. |

Run the [integration examples](INTEGRATION_GUIDE.md) after `npm run runtime:build`. For external profile reports, use the commands and scope definitions in [conformance/README.md](../conformance/README.md).

## Generated files and evidence

Author the language grammar in `runtime/textabana.grammar`, the artifact schema in `contracts/semantic-bundle-v1.js` and specification prose in `docs/reference/specification/`. Generated files under `runtime/generated/`, `public/contracts/` and `public/docs/`, plus `public/runtime-worker.js`, are checked in for reproducibility. Rebuild them from their sources.

Static conformance reports bind particular source bytes and are not live CI status. Changing a fingerprinted source or lockfile requires refreshed reports before claiming they describe the new revision. Never replace frozen expected outcomes merely to make a changed implementation pass.

## Remaining type-checking gap

The repository-wide `tsc --noEmit` check currently reports three errors in the hosting scaffolding: missing declarations for `cloudflare:workers`, `Fetcher` and `D1Database`. The application build does not replace a full TypeScript check. Providing the hosting environment types and adding a clean type-check gate is part of sprint 5.13, together with complete SDK response types.

## CI and hosting

[The CI workflow](../.github/workflows/ci.yml) runs headless checks on Node 22/24 and the application build separately. It has read-only repository permissions and does not deploy. Its presence is configuration; only an actual completed run establishes CI success.

The existing `scripts/sites-env.sh`, `scripts/install-ci.sh` and hosting configuration support the managed Sites deployment environment. They are not prerequisites for ordinary kernel development. The application's npm package remains private until a public package boundary and release policy have been verified.
