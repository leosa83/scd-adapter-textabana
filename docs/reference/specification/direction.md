# Direction and standards

The architecture follows the direction; standards reuse is partially implemented and several adapter commitments remain unfulfilled.

Assessed on 2026-09-20 against sprint 5.9. The table distinguishes actual format use, bounded projection and planned support. An internal test or a familiar field name does not prove external interoperability.

### Established standards: actual use and boundary

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

**Channel schema validation: implemented bounded policy**

Artifact bundles and inline channel schemas use Ajv2020. Sprint 5.14A adds the [versioned channel policy](../channel-schemas.md): nested constraints, `minimum`, `enum` and local `$ref` are enforced, while unsupported features are rejected. This closes a concrete standards-reuse gap without claiming external schema resolution or full typed-channel conformance. The [compatibility record](../../compatibility-5.14.md) distinguishes this behavior change from translation.

Textabana's IR, Result and revision contracts are needed to bind source, plan, events and projection to the same meaning. Established representations are to be used at format boundaries. Read the [full direction assessment with sources and priorities](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/STANDARDS_DIRECTION.md).

<a id="DIRECTION-001"></a>

> **DIRECTION-001** A new Textabana format MUST state which semantic relationship it adds, which established standard was considered and how interchange is to occur without hidden changes in meaning.

<a id="DIRECTION-002"></a>

> **DIRECTION-002** Standards support MUST describe the version, import/export direction, implemented subset and verified boundary. A schema id, dependency or planned adapter alone cannot count as support.

<a id="DIRECTION-003"></a>

> **DIRECTION-003** An adapter MUST report mappings and losses at the standards boundary. Internal conformance and verification against an independent external consumer MUST be reported separately.
