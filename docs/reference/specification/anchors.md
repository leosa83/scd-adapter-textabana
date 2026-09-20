# Anchors and source maps

Rader flyttar sig när text redigeras. En hållbar metadataapplikation behöver därför versionerad target, flera selectors och en ärlig re-anchor-algoritm.

### Kanoniskt Anchor

Normativt schemafragment · json

```json
{
  "anchorId": "anchor:claim-42",
  "target": {
    "resourceId": "doc:claims",
    "version": "sha256:...",
    "view": "source",
    "cellId": null
  },
  "selectors": [
    { "type": "TextPositionSelector", "start": 128, "end": 171, "unit": "unicode-code-point" },
    { "type": "TextQuoteSelector", "exact": "Den centrala slutsatsen.", "prefix": "...", "suffix": "..." },
    { "type": "NodeSelector", "nodeId": "claim-block" }
  ]
}
```

### Kanoniska selectors

| Selector | Identifierar | När den används |
| --- | --- | --- |
| `TextPositionSelector` | Halvöppet code-point-spann. | Exakt snapshot och snabb lookup. |
| `TextQuoteSelector` | Exakt text med valfri prefix/suffix-context. | Re-anchor efter textredigering. |
| `NodeSelector` | Semantisk IR-node. | Strukturell stabilitet över mindre ändringar. |
| `CellSelector` | Stabilt notebook cell.id. | Notebookprofil. |
| `DataSelector` | datasetId, recordId och valfri kolumn. | Tabell- och analyticsprofil. |
| `Time/FragmentSelector` | Tid, bildregion eller annan coordinate space. | Namespaced extension. |

### Coordinate spaces

| view | Koordinat | Typiskt mål |
| --- | --- | --- |
| `source` | Unicode code points | Kanonisk textkälla. |
| `generated` | Outputselector + SourceMap | Transformerat mellanvärde. |
| `rendered` | Rendererspecifik selector | Visuell Markdown/HTML-projektion. |
| `notebook` | cellId + source selector | Notebookcell. |
| `table` | datasetId + recordId + column | Tabellrecord. |
| `image / time` | Fragment eller time selector | Bild-, ljud- och videoregion. |

### Re-anchor i bestämd ordning

1 · Samma version → position2 · Stabil node/cell/record identity3 · Unik quote + context4 · Ambiguous/orphan + diagnostic

<a id="ANCHOR-001"></a>

> **ANCHOR-001** En durable annotation MÅSTE binda till en versionerad target och minst en selector. Position och quote BÖR lagras tillsammans.

<a id="ANCHOR-002"></a>

> **ANCHOR-002** En runtime får aldrig tyst välja en av flera re-anchor-kandidater. Flera giltiga kandidater MÅSTE ge `ambiguous`; ingen giltig kandidat MÅSTE ge `orphaned`. Båda utfallen ska förbli olösta och diagnostiserbara.

<a id="ANCHOR-003"></a>

> **ANCHOR-003** Human-facing line och column är ettbaserade. LSP-adaptern MÅSTE konvertera till nollbaserade UTF-16-positioner.

Detta avser presentation för människor. Serialiserad `SourceSpan` använder ettbaserade rader men nollbaserade code-point-kolumner och halvöppna offsets. CodeMirror-/Monaco-bindningarna konverterar UTF-16-offsets; en LSP-adapter är ännu planerad.

<a id="SOURCEMAP-001"></a>

> **SOURCEMAP-001** Varje mapping record MÅSTE ange `exact`, `derived` eller `synthetic` samt generating activity. Aggregat är aldrig `exact` utan verifierat mapping proof.

**Editor Metadata Lab**

Editor Metadata Lab producerar Anchor med position- och quote-selector och visar SourceMap-records. Editor Kernel Lab publicerar därutöver verkliga cross-revision transitions: stabilt anchor-id matchas först och unik quote + origin därefter; flera kandidater blir `ambiguous` och ingen kandidat blir `orphaned`. Persistens över worker-restart, strukturell/fuzzy matching och LSP-coordinate conversion återstår.
