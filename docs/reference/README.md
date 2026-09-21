# Specification reference

For implementation APIs, see the [host SDK and transport reference](sdk.md).

Language & Interop draft 0.7, Language 0.4. These Markdown documents are the authored source for the application's Specification view. Edit a section here, then run `npm run docs:build`; check generated projections with `npm run docs:check`.

All 34 sections and 144 requirements are authored in English. The [translation ledger](../translation-ledger.json) retains each Swedish source and reviewed English target; the [glossary](../translation-glossary.md) defines the terminology. All 43 code examples retain their original bytes, including deliberate multilingual input. See the [language migration register](../english-migration.md) for the rest of the codebase.

The target specification, implementation status and versioned conformance profiles have different authority. Read the [architecture guide](../architecture.md#authority) and [conformance tools](../../conformance/README.md) before making a claim.

## Sections

| Section | Source language |
|---|---|
| [Readable text as an executable, position-aware semantic source](specification/definition.md) | English |
| [Status and norms](specification/status.md) | English |
| [Direction and standards](specification/direction.md) | English |
| [Textabana and HTML](specification/html.md) | English |
| [Architecture](specification/architecture.md) | English |
| [Semantic contract](specification/contract.md) | English |
| [Source and values](specification/source-value.md) | English |
| [Parser, syntax and recovery](specification/syntax.md) | English |
| [Blocks and intervals](specification/blocks-intervals.md) | English |
| [Inheritance](specification/inheritance.md) | English |
| [Properties and includes](specification/properties-modules.md) | English |
| [Processing model](specification/processing.md) | English |
| [IR, graph, plan and trace](specification/ir-plan.md) | English |
| [Anchors and source maps](specification/anchors.md) | English |
| [TextabanaResult](specification/result.md) | English |
| [Typed channels](specification/channels.md) | English |
| [system.out](specification/system-out.md) | English |
| [Artifacts and sinks](specification/artifacts.md) | English |
| [Manifests and functions](specification/module-manifest.md) | English |
| [Runtime protocol](specification/runtime-protocol.md) | English |
| [Editor Kernel](specification/editor-kernel.md) | English |
| [Integrate the kernel](specification/integration.md) | English |
| [Runs and transactions](specification/runs.md) | English |
| [Security](specification/security.md) | English |
| [Adapter contract](specification/adapter-contract.md) | English |
| [Jupyter and notebooks](specification/notebooks.md) | English |
| [Data, AI and ML](specification/data-ai.md) | English |
| [Annotation and observability](specification/annotation-observability.md) | English |
| [Use cases](specification/use-cases.md) | English |
| [Profiles and versions](specification/conformance.md) | English |
| [Contract sources and requirements](specification/documentation-sources.md) | English |
| [Error model](specification/errors.md) | English |
| [Playground Labs](specification/playgrounds.md) | English |
| [Glossary](specification/glossary.md) | English |

## Stable contracts and history

The byte-bound profile documents remain at their established repository paths. Their schema/profile versions and manifest digests must be reviewed together when translating. The [contract source index](../../public/docs/sources.json) links those contracts and their reports. Historical plans remain linked from the [documentation index](../README.md).
