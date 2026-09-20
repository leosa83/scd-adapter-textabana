# Data, AI and ML

Bindings ska vara externa och typed. DataFrames, modeller och dataset serialiseras inte in i källtexten; de binds som inputs eller ArtifactRefs och spåras i run-proveniens.

**Körbar Data & Lineage-subset**

`data/1` körs som en avgränsad playground-subset: typade JSON-records, dataset/schema-events, stabila `recordId`, deterministisk inner join, kolumnbundna `DataSelector`, derived aggregation och multi-input-lineage via SourceMaps som förenar båda inputankarna. Arrow IPC, Parquet, DuckDB, beständiga ArtifactRefs, OpenLineage-export och full `data/1`-konformitet är fortfarande unsupported.

### Exakt exekverad datamodell i playgrounden

| Lager | Körbar representation | Identitet och mapping |
| --- | --- | --- |
| Författad input | Två vanliga GFM Markdown-tabeller i ett relational_join-block. | Deklarerade datasetnamn och join key; ingen dold tabellsyntax. |
| Canonical Result | data.datasets, data.input.records, data.output.records, data.lineage och data.aggregates. | Dataset-ID, naturlig key och innehållsbaserat recordId; aldrig fysisk radposition. |
| Join | Deterministisk inner equijoin med vänster inputordning och explicit fel för tomma eller duplicerade keys. | Varje outputrecord har en derived SourceMap med vänster och höger inputanchor. |
| Cell-lineage | Ett lineage-event per outputcell med DataSelector för output- och inputkolumn. | Join key pekar på båda key-cellerna; övriga celler pekar på sin vänster- eller högerkälla. |
| Aggregation | Count över join-output i data.aggregates. | Alltid derived och kopplad till de records som räknades. |
| Adapterprojektion | application/json med schema, rows, record-/cell-lineage och explicit fidelity report. | Source-bound post-commit-projektion; artifactRefs är tom tills verkliga bytes finns. |

### Derived SourceMap för en join-record

Körbar lab-envelope · json

```json
{
  "outputRef": "event:...",
  "outputSelector": { "type": "DataSelector", "datasetId": "voyage_cargo", "recordId": "record:..." },
  "inputAnchorRefs": ["anchor:row:ships:...", "anchor:row:manifests:..."],
  "inputSelectors": [
    { "type": "DataSelector", "datasetId": "ships", "recordId": "record:ships:..." },
    { "type": "DataSelector", "datasetId": "manifests", "recordId": "record:manifests:..." }
  ],
  "mapping": "derived",
  "generatingActivity": "activity:invocation:..."
}
```

**Cell betyder semantisk kolumn i denna subset**

Cell-lineage använder en kolumnbunden `DataSelector` ovanpå ett stabilt row-anchor. Playgrounden räknar inte ut exakta teckenpositioner för varje Markdown-cell; sådan textpositionsprecision kräver separata cellankare och är ännu unsupported.

### Data- och analyticsprofil

| Behov | Primär standard | Textabanaregel |
| --- | --- | --- |
| Tabeller mellan processer | Apache Arrow / Arrow IPC | Schema + stabil record identity + anchor refs. |
| Beständig tabell | Parquet | Proveniens måste överleva export som fysiska kolumner/relationer. |
| Pandas / Polars | Arrow PyCapsule, Arrow IPC, därefter dataframe interchange | Adapterkonvertering; inte nytt core-value. |
| Lokal SQL | DuckDB över Arrow | SQL-stage i ExecutionPlan med typed in/out. |
| Tensor/embedding | DLPack eller Arrow FixedSizeList/standard extension | Shape, dtype, device och mapping deklareras. |
| Experiment tracking | MLflow adapter | Run params, metrics, models och artifacts projiceras från TextabanaResult. |

### Provenienskolumner som överlever pipelines

Informativ adapterprofil · arrow schema

```arrow schema
claim_id: utf8 not null
claim_text: utf8 not null
confidence: float32
_textabana_record_id: utf8 not null
_textabana_anchor_refs: list<utf8> not null
_textabana_activity_id: utf8 not null
```

**AI invocation provenance**

Provider, model-id/revision, prompt-template digest eller skyddad artifactref, input/output-digests, samplingparametrar, seed när relevant, tool/retrieval refs, tokenanvändning/kostnad, schema, timing och reviewer state.

<a id="DATA-001"></a>

> **DATA-001** Dataset row identity MÅSTE använda stabilt `recordId` eller deklarerad key — aldrig fysisk row index efter filter, join eller sortering.

<a id="DATA-002"></a>

> **DATA-002** Filter bevarar lineage; join förenar inputanchors; aggregation producerar `derived` mapping och en explicit provenance relation.

<a id="DATA-003"></a>

> **DATA-003** Kritisk proveniens får inte endast ligga i Arrow- eller Parquet-schema metadata om den ska överleva tredjepartsverktyg.

<a id="DATA-004"></a>

> **DATA-004** Arrow IPC Stream delar ett schema. En inkompatibel schemaändring MÅSTE skapa en ny stream eller schemaversion.

<a id="DATA-005"></a>

> **DATA-005** In-process Arrow- eller DLPack-handles får aldrig serialiseras i TextabanaResult; resultatet använder transportformat eller ArtifactRef.

<a id="AI-001"></a>

> **AI-001** Confidence är ett modellmått, inte sanning. Candidate, accepted, rejected och superseded är separata review states.

<a id="AI-002"></a>

> **AI-002** MCP FÅR exponera manifestfunktioner som tools och docs/resultat som resources, men är en adapter och får inte bli kärnans runtime- eller proveniensmodell.
