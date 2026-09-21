# Textabana

Textabana turns readable text into a position-aware interface for structured applications. It compiles blocks and open intervals into an explicit execution plan, then produces a primary rendered value, named output channels and metadata linked back to the source.

[Try the playground](https://textpipe-editor.leo-salmonsson.chatgpt.site) · [Documentation](docs/README.md) · [Specification](docs/reference/README.md) · [Contributing](CONTRIBUTING.md)

## Project status

This is an experimental engine and reference playground. Language 0.4 and Interop draft 0.7 have explicitly limited implementations and versioned conformance profiles. A passing profile is evidence for its declared scope, not full production or standards conformance.

The repository is being consolidated for an open-source release. A project license has not yet been selected, and the application workspace is not a published npm package. The specification, application controls, lab explanations and SDK reference are in English. The [migration register](docs/english-migration.md) identifies remaining runtime messages, version-bound profiles and historical material.

## Run from source

Use Linux or WSL2, Node.js >=22.13, npm and Python >=3.10 available as `python3`.

```sh
git clone https://github.com/leosa83/scd-adapter-textabana.git
cd scd-adapter-textabana
npm ci
npm test
node examples/integration/editor-loop.mjs
```

The headless test command builds the kernel without building the website. The integration example opens a document, analyzes it, subscribes to metadata, runs it, applies a revision and verifies errors and artifact integrity. No Sites account or external service is required.

To work on the playground:

```sh
npm run dev
```

To build and verify the application separately:

```sh
npm run test:app
```

See [Development](docs/development.md) for command boundaries, supported environments and generated files. The current workspace installs the engine and application dependencies together; separate distributable packages are part of the consolidation plan.

## What works today

- A Lezer parser with lossless CST, AST, typed IR, local recovery and Unicode source spans.
- Blocks, open intervals, inheritance, explicit execution graphs and atomic results.
- Revision-guarded editor sessions, source anchors, metadata deltas and credit-controlled delivery after commit.
- Conservative stage caching, bounded asynchronous overlap and cooperative resource limits.
- TypeScript/Python host clients, Node JSONL transport and CodeMirror/Monaco bindings.
- SHA-256-locked JavaScript module packages, explicit grants and separately verifiable semantic artifacts.
- Narrow, independently compared Python/JavaScript profiles for text, intervals, channels, source mapping and module admission.

Module grants do not create a JavaScript sandbox. Channel payload validation is currently a limited handwritten subset, whereas semantic artifact bundles use JSON Schema validation. Arrow/Parquet, full PROV export, LSP, OpenTelemetry, OpenLineage, MLflow and full Jupyter integration remain incomplete or planned. See the [standards assessment](docs/STANDARDS_DIRECTION.md).

## Explore the application

The eight labs cover Language & Scope, Editor Kernel, Editor Metadata, Channel & Result, Data & Lineage, Notebook Interop, Annotation & Review, and Conformance. They expose results and declared limits from the same kernel. The Specification view renders the repository's Markdown reference documents.

## Find the right source

| Task | Entry point |
|---|---|
| Embed the kernel | [Integration guide](docs/INTEGRATION_GUIDE.md), [SDK reference](docs/reference/sdk.md) and [`examples/integration/`](examples/integration/) |
| Understand the implementation | [Architecture map](docs/architecture.md) |
| Read normative requirements | [Specification reference](docs/reference/README.md) and [requirement index](public/docs/requirements.json) |
| Reproduce a profile claim | [Conformance guide](conformance/README.md) |
| Review implementation direction | [Standards direction](docs/STANDARDS_DIRECTION.md) |
| Contribute or follow the roadmap | [Contributing](CONTRIBUTING.md) and [active consolidation plan](CONSOLIDATION_PLAN.md) |

The current [Editor Kernel plan](EDITOR_KERNEL_PLAN.md) and earlier [adapter plan](IMPLEMENTATION_PLAN.md) retain implementation history. They do not replace versioned contracts or current development instructions.
