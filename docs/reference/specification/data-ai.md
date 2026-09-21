# Data, AI and ML

Bindings are to be external and typed. DataFrames, models and datasets are not serialized into source text; they are bound as inputs or ArtifactRefs and tracked in run provenance.

**Executable Data & Lineage subset**

`data/1` runs as a bounded playground subset: typed JSON records, dataset/schema events, stable `recordId`, deterministic inner joins, column-bound `DataSelector`, derived aggregation and multi-input lineage through SourceMaps that combine both input anchors. Arrow IPC, Parquet, DuckDB, persistent ArtifactRefs, OpenLineage export and full `data/1` conformance remain unsupported.

### Exact data model executed in the playground

| Layer | Executable representation | Identity and mapping |
| --- | --- | --- |
| Authored input | Two ordinary GFM Markdown tables in a relational_join block. | Declared dataset names and join key; no hidden table syntax. |
| Canonical Result | data.datasets, data.input.records, data.output.records, data.lineage and data.aggregates. | Dataset ID, natural key and content-based recordId; never physical row position. |
| Join | Deterministic inner equijoin in left-input order, with explicit errors for empty or duplicate keys. | Every output record has a derived SourceMap with left and right input anchors. |
| Cell lineage | One lineage event per output cell with DataSelector for the output and input columns. | The join key points to both key cells; other cells point to their left or right source. |
| Aggregation | Count over the join output in data.aggregates. | Always derived and linked to the records counted. |
| Adapter projection | application/json with schema, rows, record/cell lineage and an explicit fidelity report. | Source-bound post-commit projection; artifactRefs remain empty until actual bytes exist. |

### Derived SourceMap for a join record

Executable lab envelope · json

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

**Cell means a semantic column in this subset**

Cell lineage uses a column-bound `DataSelector` on top of a stable row anchor. The playground does not compute exact character positions for each Markdown cell; that text-position precision requires separate cell anchors and is not yet supported.

### Data and analytics profile

| Need | Primary standard | Textabana rule |
| --- | --- | --- |
| Tables between processes | Apache Arrow / Arrow IPC | Schema + stable record identity + anchor refs. |
| Persistent table | Parquet | Provenance must survive export as physical columns/relations. |
| Pandas / Polars | Arrow PyCapsule, Arrow IPC, then dataframe interchange | Adapter conversion, not a new core value. |
| Local SQL | DuckDB over Arrow | SQL stage in ExecutionPlan with typed input/output. |
| Tensor/embedding | DLPack or Arrow FixedSizeList/standard extension | Declare shape, dtype, device and mapping. |
| Experiment tracking | MLflow adapter | Run parameters, metrics, models and artifacts are projected from TextabanaResult. |

### Provenance columns that survive pipelines

Informative adapter profile · arrow schema

```arrow schema
claim_id: utf8 not null
claim_text: utf8 not null
confidence: float32
_textabana_record_id: utf8 not null
_textabana_anchor_refs: list<utf8> not null
_textabana_activity_id: utf8 not null
```

**AI invocation provenance**

Provider, model id/revision, prompt-template digest or protected artifact reference, input/output digests, sampling parameters, seed where relevant, tool/retrieval references, token usage/cost, schema, timing and reviewer state.

<a id="DATA-001"></a>

> **DATA-001** Dataset row identity MUST use a stable `recordId` or declared key, never a physical row index after filtering, joining or sorting.

<a id="DATA-002"></a>

> **DATA-002** Filtering preserves lineage; a join combines input anchors; aggregation produces `derived` mapping and an explicit provenance relation.

<a id="DATA-003"></a>

> **DATA-003** Critical provenance cannot reside only in Arrow or Parquet schema metadata if it is to survive third-party tools.

<a id="DATA-004"></a>

> **DATA-004** An Arrow IPC Stream shares one schema. An incompatible schema change MUST create a new stream or schema version.

<a id="DATA-005"></a>

> **DATA-005** In-process Arrow or DLPack handles can never be serialized in TextabanaResult; the result uses a transport format or ArtifactRef.

<a id="AI-001"></a>

> **AI-001** Confidence is a model metric, not truth. Candidate, accepted, rejected and superseded are separate review states.

<a id="AI-002"></a>

> **AI-002** MCP MAY expose manifest functions as tools and documents/results as resources, but it is an adapter and cannot become the kernel's runtime or provenance model.
