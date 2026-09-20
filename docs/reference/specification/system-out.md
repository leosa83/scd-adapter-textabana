# system.out

`system.out` är inte Python-, process- eller Jupyter-stdout. Det är en reserverad, typad kanal för positionsbunden metadata och editorupplevelser.

### Kanoniska system.out kinds

| kind | Avsikt | Vanlig presentation |
| --- | --- | --- |
| `annotation` | Domänmetadata, relation eller review candidate. | Gutter, highlight, sidopanel. |
| `diagnostic` | Positionsbunden varning eller information efter lyckad körning. | Squiggle, Problems-panel. |
| `metric` | Mätvärde kopplat till dokument, span eller record. | Badge, chart, status. |
| `progress` | Transient run-status. | Progressrad; aldrig durable domänoutput. |
| `artifact-link` | Länk mellan position och ArtifactRef. | Preview, nedladdning, detaljpanel. |

### Positionsbundet editorevent

Normativt 0.4-format · json

```json
{
  "channel": "system.out",
  "kind": "annotation",
  "target": {
    "mode": "row",
    "anchorRef": "anchor:claim-42",
    "rowSet": "claims",
    "rowId": "claim:42",
    "row": 2,
    "line": 43
  },
  "payload": { "label": "Verifiera källa", "status": "candidate" },
  "origin": { "module": "claims", "function": "extract", "scopeId": "review" }
}
```

**rowId**

Durable domänidentitet inom deklarerad `rowSet` eller dataset.

**row / line**

Ettbaserade, lättanvända projektioner för presentation — aldrig primär identitet.

**anchorRef**

Kanonisk länk till versionerad källa och selectors.

**origin**

Stage, modul, funktion, modalitet, scope och proveniensrelation.

<a id="SYSTEM-OUT-001"></a>

> **SYSTEM-OUT-001** Semantisk `kind` och positioneringssätt `target.mode` MÅSTE vara separata. `row` och `line` är target modes, inte eventtyper.

<a id="SYSTEM-OUT-002"></a>

> **SYSTEM-OUT-002** `context.system.out.row(...)` och `.line(...)` FÅR finnas som SDK-helpers men MÅSTE normalisera till samma portabla event envelope och Anchor.

<a id="SYSTEM-OUT-003"></a>

> **SYSTEM-OUT-003** Compile- och run-fel lagras i top-level diagnostics. En lyckad positionsbunden varning FÅR dessutom projiceras i `system.out` med samma diagnostic-id.

**Kompatibilitet**

Playgrounden normaliserar `context.system.out.row(...)` och `.line(...)` till separata `kind`, `target.mode` och `anchorRef`, och visar Anchor samt SourceMap i Editor Metadata Lab. Editor Kernel är det separata control-plane-protokollet för dokumentlivscykeln och konsumerar `system.out` genom channel subscriptions. Legacyfälten `type`, `row` och `line` finns kvar som kompatibilitetsprojektioner. Persistenta ankare och LSP-adaptern är fortfarande unsupported.
