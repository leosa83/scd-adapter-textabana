# Artifacts and sinks

Textabana separates a payload's semantics from its destination. A file, panel, database, Kafka or network is a host binding, not a separate language output.

### ArtifactRef

Normative schema fragment · json

```json
{
  "artifactId": "artifact:claims-table",
  "uri": "textabana-artifact://run:42/claims.arrow",
  "mediaType": "application/vnd.apache.arrow.file",
  "schemaRef": "schema:claims-table/v2",
  "size": 48192,
  "sha256": "sha256:...",
  "createdBy": "activity:extract-claims",
  "retention": "project",
  "classification": "internal"
}
```

### Payload strategy

| Data | Recommended representation | Reason |
| --- | --- | --- |
| Small control objects | JSON / JSONL | Portable validation and straightforward inspection. |
| Rich notebook display | MIME bundle | Multiple presentations of the same value. |
| Tables in memory/transport | Apache Arrow / Arrow IPC | Schema, columns and efficient transfer across languages. |
| Persistent analytics snapshots | Parquet | Columnar storage and broad tooling compatibility. |
| Tensors/embeddings | DLPack or a standardized Arrow representation | Device-aware and zero-copy-aware transfer. |
| Models, images and large files | ArtifactRef | Avoid large base64 values in JSON or notebooks. |

<a id="ARTIFACT-001"></a>

> **ARTIFACT-001** Artifact digests MUST be verified. Signed URLs and credentials cannot be serialized as durable URIs; use an opaque handle and a host resolver.

<a id="SINK-001"></a>

> **SINK-001** A non-transactional sink MUST buffer durable delivery until commit. External delivery SHOULD use `(runId, sequence)` as its idempotency key.

<a id="SINK-002"></a>

> **SINK-002** Textabana cannot promise exactly-once delivery across arbitrary external systems. The adapter profile is to declare its delivery guarantee, normally at-least-once.
