# TextabanaResult

### Resultatkuvert · målkontrakt

Normativt schemafragment · json

```json
{
  "schema": "textabana.result/v1",
  "resultId": "sha256:...",
  "run": { "runId": "run:...", "instanceId": "run-instance:...", "profile": "fresh", "status": "succeeded" },
  "source": { "documentId": "doc:claims", "version": "sha256:..." },
  "render": { "kind": "text", "mediaType": "text/markdown", "data": "..." },
  "channelSnapshots": {
    "system.out": { "descriptor": {}, "events": [] },
    "claims": { "descriptor": {}, "events": [] }
  },
  "artifacts": [],
  "provenance": { "entities": [], "activities": [], "agents": [] },
  "diagnostics": [],
  "hashes": { "ir": "sha256:...", "environment": "sha256:..." }
}
```

### Resultatets delar

| Del | Ansvar | Regel |
| --- | --- | --- |
| `render` | Primär projektion av returpipelinen. | Är ett resultatfält, inte en emitterbar kanal. |
| `channelSnapshots` | Noll eller fler namngivna, typade eventlistor. | Publiceras atomiskt vid success. |
| `artifacts` | Content-addressed stora/binära outputs. | Bär inga durable credentials. |
| `provenance` | Entity–Activity–Agent-relationer. | Binder varje durable output till hur den skapades. |
| `diagnostics` | Compile- och run-diagnostik. | Top-level är enda kanoniska sanningskällan för körfel. |

<a id="RESULT-001"></a>

> **RESULT-001** Ett lyckat resultat MÅSTE vara immutable. `resultId` BÖR vara content-addressed.

<a id="RESULT-002"></a>

> **RESULT-002** Ett failed eller cancelled resultat MÅSTE ha tom committed render och tomma committed domain channels, men FÅR bära control-plane diagnostics.

<a id="RESULT-003"></a>

> **RESULT-003** Timestamps är transportmetadata och får inte styra semantisk hash eller eventordning.

**Resultatet som playgrounden visar**

Det aktuella kuvertet är `textabana.result/lab-v1`, inte produktionsschemat i fragmentet ovan. Läs `response.resultEnvelope` och kanalernas `channelSnapshots[name].events`; transportens `output` och `channels` är separata bekvämlighetsfält. Success committas atomiskt; failed och cancelled visar tom committed render och tomma domänkanaler. Separata SHA-256-artefaktidentiteter, credit-styrd metadata-streaming efter commit samt explicita stage-, event- och rendergränser finns. Återstående arbete omfattar synkron preemption, kontinuerlig stage-streaming, generell sink-backpressure, hårda CPU-/minneskvoter, extern rollback och beständiga binära artifacts före full `runtime-json/1`-konformitet.
