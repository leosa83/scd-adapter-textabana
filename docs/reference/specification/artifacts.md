# Artifacts and sinks

Textabana skiljer payloadens semantik från vart den skickas. Fil, panel, databas, Kafka och nätverk är host-bindings — inte separata språkoutputs.

### ArtifactRef

Normativt schemafragment · json

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

### Payloadstrategi

| Data | Rekommenderad representation | Motiv |
| --- | --- | --- |
| Små kontrollobjekt | JSON / JSONL | Portabel validering och enkel inspektion. |
| Rich notebook display | MIME bundle | Flera presentationer av samma värde. |
| Tabeller i minne/transport | Apache Arrow / Arrow IPC | Schema, kolumner och effektivt språkbyte. |
| Beständiga analytics-snapshots | Parquet | Kolumnär lagring och bred verktygskompatibilitet. |
| Tensorer/embeddings | DLPack eller standardiserad Arrow-representation | Device- och zero-copy-aware överföring. |
| Modeller, bilder och stora filer | ArtifactRef | Ingen stor base64 i JSON eller notebook. |

<a id="ARTIFACT-001"></a>

> **ARTIFACT-001** Artifact digest MÅSTE verifieras. Signed URLs och credentials får inte serialiseras som durable URI; använd opaque handle och en host-resolver.

<a id="SINK-001"></a>

> **SINK-001** En icke-transaktionell sink MÅSTE buffra durable leverans till commit. Extern leverans BÖR använda `(runId, sequence)` som idempotency key.

<a id="SINK-002"></a>

> **SINK-002** Textabana får inte lova exactly-once över godtyckliga externa system. Adapterprofilen ska deklarera leveransgaranti, normalt at-least-once.
