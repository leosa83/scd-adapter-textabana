# Adapter contract

En adapter är en explicit, versionssatt post-commit-projektion av ett redan producerat `TextabanaResult`. Den får välja representation för en värd eller standard, men den får inte mutera källan, kärnresultatet eller dess semantiska identiteter.

**Immutable Result** — exakt committad input

**Adapter fan-out** — manifest · negotiation · pure projection

**Projection envelopes** — separata · versionssatta · source-bound

### AdapterManifest — kontrakt före körning

| Fält | Semantik | Sprint 1 |
| --- | --- | --- |
| `adapterId / version / profile` | Oberoende adapteridentitet och profilanspråk. | Obligatoriskt och digestbundet. |
| `accepts` | Tillåtna Result-scheman, profiler, channels och artifact kinds. | Förhandlas före projektion. |
| `produces` | Projection kind, value kind, mediaType och schemaRef. | Exakt en output för referensadaptern. |
| `capabilities` | Required och optional host-/runtimeförmågor. | Saknad required capability ger unsupported. |
| `support` | playground-subset · contract-only · unsupported. | Contract-only får aldrig producera låtsasoutput. |
| `fidelity` | lossless · selective · lossy samt omittedPaths. | Selektiv output måste behålla sourceResultRef. |

### AdapterManifest

Körbar lab-envelope · json

```json
{
  "schema": "textabana.adapter-manifest/lab-v1",
  "adapterId": "org.textabana.result-summary",
  "version": "1.0.0-lab.1",
  "contract": "adapter-contract/1",
  "profile": "adapter-contract/1",
  "support": "playground-subset",
  "phase": "post-commit",
  "execution": "pure",
  "accepts": { "resultSchemas": ["textabana.result/lab-v1"], "profiles": ["runtime-json/1"], "channels": [], "artifactKinds": [] },
  "produces": [{ "projectionKind": "result-summary", "valueKind": "object", "mediaType": "application/json", "schemaRef": "textabana.result-summary/lab-v1" }],
  "capabilities": { "required": ["atomic-success-result"], "optional": ["anchors"] },
  "deterministic": true,
  "fidelity": { "mode": "selective", "requiresSourceResult": true, "omittedPaths": ["render.data"] }
}
```

### AdapterProjection

Körbar lab-envelope · json

```json
{
  "schema": "textabana.adapter-projection/lab-v1",
  "projectionId": "projection:...",
  "adapterRef": { "adapterId": "org.textabana.result-summary", "version": "1.0.0-lab.1", "manifestDigest": "fnv1a:..." },
  "sourceResultRef": { "resultId": "lab:...", "resultSchema": "textabana.result/lab-v1", "sourceVersion": "fnv1a:..." },
  "status": "succeeded",
  "output": { "projectionKind": "result-summary", "mediaType": "application/json", "schemaRef": "textabana.result-summary/lab-v1", "data": {} },
  "mapping": "derived",
  "fidelity": { "mode": "selective", "requiresSourceResult": true, "omittedPaths": ["render.data"] },
  "references": { "eventRefs": [], "anchorRefs": [], "sourceMapRefs": [], "provenanceRefs": [] },
  "diagnostics": []
}
```

<a id="ADAPTER-001"></a>

> **ADAPTER-001** En adapter MÅSTE deklarera id, version, profil, accepterade resultatscheman, producerade representationer, kapabilitetsbehov och fidelity-policy innan den körs.

<a id="ADAPTER-002"></a>

> **ADAPTER-002** Varje projektion MÅSTE referera till exakt `source resultId` och manifestdigest. Samma deterministiska input, manifestversion och konfiguration MÅSTE ge samma `projectionId`.

<a id="ADAPTER-003"></a>

> **ADAPTER-003** Adaptrar läser samma immutable Result som oberoende fan-out. Adapter-till-adapter-dataflöde kräver en explicit, acyklisk dependency edge; list- eller UI-ordning är aldrig semantik.

<a id="ADAPTER-004"></a>

> **ADAPTER-004** Event identity, Anchor, SourceMap, artifact och provenance MÅSTE bevaras genom referens eller redovisas individuellt som förlust. Ett tomt loss-fält är ett verifierbart påstående.

<a id="ADAPTER-005"></a>

> **ADAPTER-005** Ett adapterfel FÅR inte ändra core run status eller mutera ett committat Result. Felet returneras som adapterdiagnostik i adapterkörningen.

<a id="ADAPTER-006"></a>

> **ADAPTER-006** En contract-only-deskriptor får förhandlas och inspekteras men får inte producera simulerad output eller användas som stöd för profilkonformitet.

**Adaptergrunden i playgrounden**

`org.textabana.result-summary`, data-, notebook- och annotationadaptrarna körs efter commit som oberoende, rena projektioner. Adapterfliken visar manifest, source-result-bindning, stabil projektionidentitet, fidelity och resolverbara referenser. `org.textabana.ml-lineage` är fortsatt contract-only och producerar ingen simulerad modell- eller observabilityoutput.
