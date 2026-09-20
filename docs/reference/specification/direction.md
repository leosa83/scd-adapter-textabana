# Direction and standards

Arkitekturen följer riktningen; standardåteranvändningen är delvis genomförd och flera adapterlöften återstår.

Bedömt 2026-09-20 mot sprint 5.9. Tabellen skiljer faktisk formatanvändning, avgränsad projektion och planerat stöd. Ett internt test eller ett välkänt fältnamn bevisar inte extern interoperabilitet.

### Etablerade standarder: faktisk användning och gräns

<!-- standards:start -->
| Standard | Status | Actual use | Boundary |
|---|---|---|---|
| [Markdown / GFM](https://github.github.com/gfm/) | Used for presentation | Rendered text uses react-markdown and remark-gfm. Textabana adds its own control lines around readable text. | Textabana has its own grammar. Full CommonMark/GFM conformance for an entire Textabana source document has not been verified. |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) | Partially implemented | The artifact bundle schema is compiled with Ajv2020 and used by the same verifier in the CLI and application. | Channel payloads use handwritten checks for type, required and one level of properties. Constraints such as $ref, enum, minimum and nested rules are not enforced. schemaRef is not an automatic resolver. |
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

**Prioriterad implementationsskuld: kanalernas schemavalidering**

Artefaktpaketet använder Ajv2020. Kanalpayloads använder fortfarande en egen begränsad kontroll; exempelvis `minimum`, `enum` och `$ref` verkställs inte. Nästa schemaarbete behöver använda en standardvalidator eller avvisa regler utanför en uttrycklig dialekt. Den här dokumentationsrevisionen ändrar inte valideringsbeteendet.

Egna IR-, Result- och revisionskontrakt behövs för att binda källa, plan, events och projektion till samma betydelse. Vid formatgränser ska etablerade representationer användas. Läs [hela riktningsbedömningen med källor och prioriteringar](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/STANDARDS_DIRECTION.md).

<a id="DIRECTION-001"></a>

> **DIRECTION-001** Ett nytt Textabana-format MÅSTE ange vilket semantiskt samband det tillför, vilken etablerad standard som övervägts och hur utbyte ska ske utan dold betydelseförändring.

<a id="DIRECTION-002"></a>

> **DIRECTION-002** Standardstöd MÅSTE beskriva version, riktning för import/export, implementerad delmängd och verifierad gräns. Ett schema-ID, en dependency eller en planerad adapter får inte ensam räknas som stöd.

<a id="DIRECTION-003"></a>

> **DIRECTION-003** En adapter MÅSTE redovisa mapping och förluster vid standardgränsen. Intern konformitet och verifiering mot en oberoende extern konsument MÅSTE rapporteras separat.
