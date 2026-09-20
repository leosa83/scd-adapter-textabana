# Följer Textabana specifikationens riktning?

Bedömt 2026-09-20 mot sprint 5.9, GitHub `76c760cf7a6e0169ef790c10b4dd72295c272d3f`. Dokumentationssprint 5.10 ändrar inte detta runtimeunderlag.

**Bedömning: arkitekturen följer riktningen, men standardåteranvändningen är delvis genomförd.** De senaste sprintarna har främst stärkt kärnans egna kontrakt och jämförelsen mellan JavaScript och Python. De är relevant grundarbete, men bevisar inte interoperabilitet med externa standardimplementationer.

Utgångspunkten är användarens uttryckliga princip:

> Textabana återanvänder etablerade format där de redan löser problemet: Markdown för läsbar text, JSON Schema för kontrakt, Arrow/Parquet för data, MIME för notebookpresentation, W3C-modeller för annotation/proveniens och LSP/OTel/OpenLineage/MLflow som adaptrar. Det nya är den sammanhängande semantiken mellan dem.

## Faktisk återanvändning

Den gemensamma [standardmatrisen](./standards-status.json) används även direkt av Specification. Varje rad anger implementation, begränsning, primärkälla och relevanta lokala kontrollfiler. Kontrollfilerna är navigationshjälp: ett test av att Arrow är unsupported är inte evidens för Arrow-stöd.

<!-- standards:start -->
| Standard | Status | Faktisk användning | Begränsning |
|---|---|---|---|
| [Markdown / GFM](https://github.github.com/gfm/) | Används i presentation | Renderad text visas med react-markdown och remark-gfm. Textabana lägger egna kontrollrader runt den läsbara texten. | Textabanas grammar är ett eget språk. Ingen full CommonMark/GFM-konformitet för hela Textabana-källan är verifierad. |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) | Delvis implementerat | Artefaktpaketets schema kompileras med Ajv2020 och används av samma verifierare i CLI och webben. | Kanalpayloads använder egen grundkontroll av type, required och ett lager properties. Bland annat $ref, enum, minimum och nästlade constraints verkställs inte. schemaRef är ingen automatisk resolver. |
| [Apache Arrow / IPC](https://arrow.apache.org/docs/format/Columnar.html) | Planerat | Data-labbet använder JSON-records med stabila nycklar och separat lineage. | Ingen Arrow-kodning, Arrow-schemaöversättning eller IPC-roundtrip är implementerad. JSON-records är inte Arrow-stöd. |
| [Apache Parquet](https://parquet.apache.org/docs/overview/) | Planerat | Dataadaptern publicerar en host-neutral tabellprojektion. | Inga Parquet-filer eller beständiga ArtifactRefs skapas. Proveniens i JSON är inte Parquet-interoperabilitet. |
| [MIME / Jupyter](https://nbformat.readthedocs.io/en/latest/format_description.html) | Körbar delmängd | text/plain, text/markdown och application/vnd.textabana.result+json är presentationer av samma committade värde. Python-klienten skapar en MIME bundle. | Eget notebook-snapshotkontrakt; ingen nbformat-import/export, Jupyter Messaging eller extern kernelroundtrip. Textabanas egna mediatypnamn är inte belägg för IANA-registrering. |
| [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) | Exportdelmängd | Annotationadaptern skapar AnnotationPage, Annotation, body, target och selectors samt namespaced Textabana-fält. | Lokala tester verifierar projektion och referenser. Full JSON-LD-semantik, extern konsument och import/export-roundtrip är inte verifierade; egna selectors behöver en uttrycklig mapping. |
| [W3C PROV](https://www.w3.org/TR/prov-dm/) | Modellanknytning | Den egna proveniensen använder entities, activities och generating/input-relationer för den semantiska kedjan. | Liknande begrepp är inte PROV-konformitet. Ingen PROV-O/RDF-export, full relationsmapping eller standardvalidering är implementerad. |
| [LSP](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) | Planerat | Egna editorprotokollet och CodeMirror-/Monaco-bindningar hanterar revisioner och Unicode-offsets. | Editorbindningar är inte en LSP-server. Ingen LSP-transport, capability-förhandling eller standarddiagnostikexport finns. |
| [OpenTelemetry](https://opentelemetry.io/docs/concepts/signals/) | Planerat | Kärnan har egna körspår och resursrapporter. | Inget OTel-SDK, ingen OTLP-export och ingen collector-integration. Operativa traces ersätter inte semantisk proveniens. |
| [OpenLineage](https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.md) | Planerat | Data-labbet spårar egna dataset-, record- och inputrelationer. | Inga standardiserade RunEvent, Job/Dataset-identiteter, facets eller OpenLineage-transport implementeras. |
| [MLflow](https://mlflow.org/docs/latest/ml/tracking/) | Planerat | Modell-/promptmetadata finns i annotationernas labbkontrakt. | Ingen MLflow tracking client, tracking server, modellkörning eller experiment-roundtrip är implementerad. |
<!-- standards:end -->

## Var de egna kontrakten är motiverade

Textabana behöver definiera hur intervall/block, source-revision, execution plan, atomisk commit, flera kanaler och ankarkontinuitet hänger ihop. Inget av de uppräknade utbytesformaten fastställer hela denna språksemantik. Ett eget IR, Result-envelope och editorprotokoll är därför förenliga med riktningen när gränserna och projektionerna är explicita.

JSON Schema kan beskriva strukturen i Textabanas egna kontrakt. Det behöver kompletteras med referens- och identitetskontroller samt verifiering av exekveringssemantik. Det är motiverat att `semantic-contract.js` kontrollerar relationer mellan artefakter utöver schemavalideringen. JSON Schema bevisar varken att modulerna körts rätt eller att två implementationer har samma betydelse.

Ett eget notebook-snapshot kan bära Textabanas revisions- och körningssemantik. När data utbyts med Jupyter ska adaptern använda MIME, nbformat och Messaging där de redan löser uppgiften. Motsvarande gräns gäller typade data i Arrow/Parquet och extern provenance i PROV/OpenLineage.

## Konkreta avvikelser och risker

1. **Kanalernas schemakontroll är en faktisk implementationsskuld.** `validatePayload` i `runtime/worker-entry.js` tolkar `type`, `required` och direkta `properties[*].type`. Den är inte en JSON Schema-validator. Exempelvis `{ "type": "integer", "minimum": 10 }` kontrollerar heltal men inte gränsen 10. `$ref`, `enum`, sammansatta och nästlade constraints kan lämnas utan verkan. Artefaktpaketets Ajv2020-validering ska inte användas som belägg för att kanalerna får samma kontroll. `strictChannels` skärper deklaration och serialisering men utökar inte schemadialekten.
2. **Standardvokabulär är svagare än verifierad standardintegration.** AnnotationPage-exporten är körbar, men intern referensvalidering är inte oberoende JSON-LD-/W3C-verifiering. Proveniensen använder närliggande begrepp, men PROV-mapping saknas. Klassificera dessa separat.
3. **Transport- och dataplansarbetet har skjutits fram.** Arrow, Parquet, LSP, OTel, OpenLineage och MLflow är fortfarande planerade. Fler interna profiler minskar inte automatiskt denna integrationsskuld.
4. **Dokumentationens status måste vara lika exakt som runtimeanspråken.** Ett schema-ID, ett mediatypnamn, en installerad dependency eller en planerad adapter är inte i sig standardstöd. De egna labbschemana och mediatypnamnen innebär inte extern standardisering eller registrering.

## Rekommenderad fortsättning

| Prioritet | Konkret nästa steg | Evidens som behövs för att stänga luckan |
|---|---|---|
| 1 | Kanalernas schemadialekt och validering | Etablerad validator eller explicit begränsad dialekt som avvisar okända schemafunktioner; negativa fall för nästling, $ref och constraints. Ingen tyst ignorering. |
| 2 | En komplett extern adapterkedja | Välj ett avgränsat fall: exempelvis AnnotationPage med fryst mapping, verklig extern konsument och redovisade förluster. |
| 3 | Verklig dataplan | Arrow IPC/Parquet via etablerade bibliotek, schema-/typbevarande, digest och oberoende återläsning med bibehållna lineage-referenser. |
| 4 | Övriga adaptrar efter konkret värdbehov | PROV, LSP, OTel, OpenLineage och MLflow får separata mappings, versionsgränser och externa verifieringsfall. |

Ordningen är en rekommendation; ingen av dessa runtimeutökningar är levererad av dokumentationssprinten. Våg 5 ska inte stängas enbart för att dokumentationsregistret är komplett.

## Källor och avgränsning

Primärkällor till standardernas ansvar finns per rad i matrisen. Implementationsbedömningen bygger på [den granskade källversionen](https://github.com/leosa83/scd-adapter-textabana/tree/76c760cf7a6e0169ef790c10b4dd72295c272d3f), särskilt `app/playground-labs.tsx`, `runtime/worker-entry.js`, `scripts/build-semantic-contract.mjs`, `sdk/` och respektive adapters tester. Slutsatsen om riktningen är en arkitekturbedömning, inte ett konformitetscertifikat.
