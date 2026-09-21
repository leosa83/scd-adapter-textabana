# Standards reuse and architectural direction

**Assessment:** the architecture follows the stated direction, but actual standards reuse is only partially implemented. There is both documentation debt and implementation debt. The original sprint 5.9 assessment is updated through sprint 5.14A, which replaces handwritten channel payload checks with Ajv2020 under an explicitly bounded policy.

The direction, translated from the accepted specification, is:

> Textabana reuses established formats where they already solve the problem: Markdown for readable text, JSON Schema for contracts, Arrow/Parquet for data, MIME for notebook presentation, W3C models for annotation/provenance, and LSP/OTel/OpenLineage/MLflow as adapters. The new contribution is the coherent semantics connecting them.

## Actual support

The table is generated from [standards-status.json](standards-status.json). Each standard links to its primary specification or documentation. Implementation sources and relevant local tests are listed in the JSON; these references alone are not proof of full conformance.

<!-- standards:start -->
| Standard | Status | Actual use | Boundary |
|---|---|---|---|
| [Markdown / GFM](https://github.github.com/gfm/) | Used for presentation | Rendered text uses react-markdown and remark-gfm. Textabana adds its own control lines around readable text. | Textabana has its own grammar. Full CommonMark/GFM conformance for an entire Textabana source document has not been verified. |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) | Partially implemented | Ajv2020 validates artifact bundles and inline channel schemas. The versioned channel policy enforces nested rules, local references, enums and bounds, and rejects unsupported features. | Channel policy excludes external resolution, formats, content/custom vocabularies and async validation. Descriptors may omit inline schemas; schemaRef is not a resolver. Full typed-channel or general JSON Schema conformance is not claimed. |
| [Apache Arrow / IPC](https://arrow.apache.org/docs/format/Columnar.html) | Planned | The data lab uses JSON records with stable keys and separate lineage. | There is no Arrow encoding, schema translation or IPC round trip. JSON records do not constitute Arrow support. |
| [Apache Parquet](https://parquet.apache.org/docs/overview/) | Planned | The data adapter produces a host-neutral table projection. | No Parquet files or persistent ArtifactRefs are created. JSON provenance is not Parquet interoperability. |
| [MIME / Jupyter](https://nbformat.readthedocs.io/en/latest/format_description.html) | Executable subset | text/plain, text/markdown and application/vnd.textabana.result+json present the same committed value. The Python client creates a MIME bundle. | Textabana has its own notebook snapshot contract; no nbformat import/export, Jupyter Messaging or external kernel round trip. Custom media type names do not establish IANA registration. |
| [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) | Export subset | The annotation adapter produces AnnotationPage, Annotation, body, target and selectors, with namespaced Textabana fields. | Local tests verify projection and references. Full JSON-LD semantics, an external consumer and import/export round trips are unverified; custom selectors need an explicit mapping. |
| [W3C PROV](https://www.w3.org/TR/prov-dm/) | Related conceptual model | Internal provenance uses entities, activities and generating/input relationships for the semantic chain. | Similar concepts do not establish PROV conformance. No PROV-O/RDF export, complete relation mapping or standards validation is implemented. |
| [LSP](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) | Planned | The editor protocol and CodeMirror/Monaco bindings handle revisions and Unicode offsets. | Editor bindings are not an LSP server. No LSP transport, capability negotiation or standard diagnostic export exists. |
| [OpenTelemetry](https://opentelemetry.io/docs/concepts/signals/) | Planned | The kernel has internal execution traces and resource reports. | There is no OTel SDK, OTLP export or collector integration. Operational traces do not replace semantic provenance. |
| [OpenLineage](https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.md) | Planned | The data lab tracks internal dataset, record and input relationships. | Standard RunEvent objects, Job/Dataset identities, facets and OpenLineage transport are not implemented. |
| [MLflow](https://mlflow.org/docs/latest/ml/tracking/) | Planned | Model and prompt metadata exists in the annotation lab contracts. | No MLflow tracking client/server, model execution or experiment round trip is implemented. |
<!-- standards:end -->

## Where Textabana-specific contracts are justified

Textabana needs to define how intervals, blocks, source revisions, execution plans, atomic commit, multiple channels and anchor continuity relate. None of the listed interchange formats establishes the whole language semantics. An internal IR, result envelope and editor protocol therefore fit the direction when their boundaries and projections are explicit.

JSON Schema can describe the structure of these contracts. Reference and identity checks and execution-semantics verification are still needed. The cross-artifact checks in `runtime/semantic-contract.js` complement schema validation; a valid schema does not prove correct execution or equivalence between implementations.

A notebook snapshot can carry Textabana's revision and run semantics. Exchange with Jupyter should use MIME, nbformat and Messaging for their established responsibilities. The same principle applies to Arrow/Parquet data and external PROV/OpenLineage provenance.

## Specific gaps

1. **The silent channel-validation gap is closed within a bounded policy.** Sprint 5.14A uses Ajv2020 for inline schemas and rejects unsupported keywords. For example, `{ "type": "integer", "minimum": 10 }` now enforces the minimum. Nesting, local references, enums and composition have targeted positive/negative tests. Descriptors can still omit an inline schema, `schemaRef` is not a resolver, and formats/external references remain unsupported; this is not full typed-channel conformance. See the [policy](reference/channel-schemas.md) and [compatibility record](compatibility-5.14.md).
2. **Standards vocabulary is weaker than verified interoperability.** AnnotationPage export runs, but internal reference checks are not independent JSON-LD/W3C validation. Internal provenance uses related concepts without a complete PROV mapping. These must remain separate claims.
3. **Data and transport integration is deferred.** Arrow, Parquet, LSP, OTel, OpenLineage and MLflow remain planned. Additional internal profiles do not automatically reduce that integration debt.
4. **Documentation must state the exact scope.** A schema identifier, media type name, dependency or planned adapter does not establish standard support. Internal schemas and media type names do not imply external standardization or registration.

## Recommended next steps

| Priority | Work | Evidence needed to close the gap |
|---|---|---|
| 1 | Maintain the implemented channel schema boundary | Ajv2020 and explicit unsupported-feature rejection are implemented in 5.14A. Preserve regression evidence and review extensions separately. |
| 2 | One complete external adapter chain | A frozen mapping, an actual external consumer and declared losses, for example an AnnotationPage exchange. |
| 3 | A real data interchange layer | Arrow IPC/Parquet through established libraries, preserved types and schemas, file digests and independent readback with lineage references. |
| 4 | Further adapters for concrete host needs | Separate versioned mappings and external verification for PROV, LSP, OTel, OpenLineage and MLflow. |

The [consolidation plan](../CONSOLIDATION_PLAN.md) first makes the repository maintainable. These runtime extensions are not delivered by documentation or translation work. A complete documentation index does not close Wave 5's production requirements.

## Sources and limits

The original assessment is based on the [reviewed source revision](https://github.com/leosa83/scd-adapter-textabana/tree/76c760cf7a6e0169ef790c10b4dd72295c272d3f). Sprint 5.14A updates the channel row from `runtime/channel-schema.js`, `runtime/channels.js` and `tests/channel-schema.test.mjs`; the other adapter boundaries remain unchanged. Source links and limitations are recorded in [standards-status.json](standards-status.json). The conclusion about direction is an architectural assessment, not a conformance certificate.
