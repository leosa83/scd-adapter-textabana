# Runtime protocol

Detta är målprotokollet för polyglotta runtimes. Den körbara hostgränsen i dag är Editor Kernels meddelanden nedan; `initialize` och `execute` är inte metoder i dagens TypeScript-klient. Börja med [integrationsguiden](./integration.md) för fungerande anrop.

### Runtime-metoder

| Metod | Krav | Ansvar |
| --- | --- | --- |
| `initialize` | MÅSTE | Förhandla version, miljö och granted capabilities. |
| `capabilities` | MÅSTE | Deklarera värdets runtimes, value kinds, limits och adapterprofiler. |
| `execute` | MÅSTE | Kör en stage med typed input, args, anchors och run context. |
| `cancel` | MÅSTE | Propagera avbrott till pågående invocation. |
| `inspect` | BÖR | Beskriv symbol, schema eller runtimevärde för editor. |
| `complete` | FÅR | Ge completions för funktioner, args och channels. |
| `shutdown` | BÖR | Frigör session och externa resurser. |

### ExecuteRequest — logisk form

Normativt schemafragment · json

```json
{
  "runId": "run:42",
  "stageId": "extract:1",
  "functionRef": "org.example.claims/extract@2.1.0",
  "input": { "kind": "text", "mediaType": "text/markdown", "data": "..." },
  "args": { "model": "claims-v2" },
  "sourceAnchors": ["anchor:claim-input"],
  "grantedCapabilities": ["model:claims-v2"],
  "deadline": "host-monotonic-deadline",
  "cancelToken": "cancel:42:1"
}
```

source snapshotanchor builderrun / stage / profileemitsystem.outartifacts.putcancellationgranted capabilitiesdiagnostics

<a id="RUNTIME-001"></a>

> **RUNTIME-001** `emit` är logiskt acknowledged. Modulens completion MÅSTE flush:a alla accepted events innan stage avslutas.

<a id="RUNTIME-002"></a>

> **RUNTIME-002** Funktioner får inte implicit läsa channels. En kanal som input kräver en explicit Plan-edge eller adapterstage.

<a id="RUNTIME-003"></a>

> **RUNTIME-003** JavaScript, TypeScript, Python, R, Julia, SQL, WASM och externa tjänster FÅR implementera samma protokoll utan språksemantisk särbehandling.
