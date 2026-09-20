# Typed channels

Kanaler följer logger-mönstrets öppna namnrymd, men ett kanalnamn måste lösa till en descriptor. JSON är kontrollplan; Arrow och ArtifactRef är dataplan.

### ChannelDescriptor och event envelope

Normativt schemafragment · json

```json
{
  "descriptor": {
    "name": "claims",
    "payloadKind": "object",
    "mediaType": "application/json",
    "schemaRef": "schema:claim/v2",
    "delivery": "snapshot",
    "persistence": "durable",
    "ordering": "global-sequence",
    "key": ["payload.claimId"],
    "required": false,
    "sensitivity": "internal"
  },
  "event": {
    "schema": "textabana.event/v1",
    "eventId": "run:42:17",
    "runId": "run:42",
    "sequence": 17,
    "channel": "claims",
    "kind": "candidate",
    "phase": "run",
    "target": { "anchorRef": "anchor:claim-42" },
    "origin": { "stageId": "extract:1" },
    "correlation": { "traceId": "trace:...", "spanId": "span:..." },
    "provenanceRef": "activity:extract-claims",
    "state": "committed",
    "payload": { "label": "Textabana" },
    "extensions": {}
  }
}
```

### ChannelDescriptor — portabelt kontrakt

| Fält | Tillåtna värden | Regel |
| --- | --- | --- |
| `name` | Öppet, namespaced namn | Måste vara unikt i resultatet; system.* är reserverat. |
| `payloadKind / mediaType / schemaRef` | TextabanaValue + mediatyp + JSON Schema | Bestämmer validering och adapterval. |
| `delivery` | snapshot · stream | Beskriver konsumtionssätt, inte commitstatus. |
| `persistence` | durable · transient | Transient events ingår inte i committed snapshot. |
| `ordering` | global-sequence eller deklarerad key | Måste ge reproducerbar iteration. |
| `key` | Ett eller flera payloadfält | Valfri stabil domänidentitet/idempotency. |
| `required` | boolean | Om avsaknad av event gör run invalid. |
| `sensitivity` | Hostdefinierad klassificering | Får endast skärpas av en adapter, aldrig tyst sänkas. |

`return value`**Primärt värde**

Blir input till nästa steg och slutligen resultatets `render`.

`context.emit(name, event)`**Sidoflöde**

Appenderar ett validerat event utan att ändra pipelinevärdet.

`result.channel(name)`**Mål-API för läsning**

Illustrativ hjälpare. Aktuell SDK läser `resultEnvelope.channelSnapshots[name].events` efter run.

<a id="CHANNEL-001"></a>

> **CHANNEL-001** Kanalnamn är obegränsade utom den reserverade namnrymden `system.*`. `render` är reserverat som resultatfält.

<a id="CHANNEL-002"></a>

> **CHANNEL-002** I strict profile MÅSTE descriptor och payloadschema deklareras före emit. En permissive legacyprofil FÅR syntetisera generisk JSON-descriptor vid första emit men får inte hävda typed-channel conformance.

<a id="CHANNEL-003"></a>

> **CHANNEL-003** Events är append-only inom en run. Ett schemafel, en cyklisk payload eller ett oserialiserbart värde MÅSTE avvisas — inte förlustkonverteras till text.

<a id="CHANNEL-004"></a>

> **CHANNEL-004** Varje accepted emit får en order key `(planStep, invocationOrder, localEmitIndex)`. `sequence` tilldelas vid deterministic merge/commit.

<a id="CHANNEL-005"></a>

> **CHANNEL-005** En funktionsmodul körs inte en gång per kanal. Ett enda funktionsanrop FÅR emittera till valfritt många kanaler.

**Strict channels i playgrounden**

Strict mode kräver en deklarerad descriptor och avvisar odeklarerade kanaler, reserverade namn samt cykliska eller icke-serialiserbara payloads. Egen payloadkontroll verkställer endast `type`, `required` och direkta `properties[*].type`. Exempelvis `$ref`, `enum`, `minimum` och nästlade constraints kan ignoreras; `schemaRef` löser inte automatiskt ett schema. Full JSON Schema 2020-12 för kanalpayloads återstår. Editor Kernel har credit-styrd metadata-streaming efter commit; kontinuerlig stage-streaming och generell sink-backpressure återstår.
