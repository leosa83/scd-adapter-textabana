# system.out

`system.out` is not Python, process or Jupyter stdout. It is a reserved, typed channel for position-bound metadata and editor experiences.

### Canonical system.out kinds

| kind | Purpose | Typical presentation |
| --- | --- | --- |
| `annotation` | Domain metadata, relation or review candidate. | Gutter, highlight, side panel. |
| `diagnostic` | Position-bound warning or information after a successful run. | Squiggle, Problems panel. |
| `metric` | Measurement bound to a document, span or record. | Badge, chart, status. |
| `progress` | Transient run status. | Progress row; never durable domain output. |
| `artifact-link` | Link between a position and ArtifactRef. | Preview, download, detail panel. |

### Position-bound editor event

Normative 0.4 format · json

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

Durable domain identity within a declared `rowSet` or dataset.

**row / line**

One-based convenience projections for presentation, never primary identity.

**anchorRef**

Canonical link to a versioned source and selectors.

**origin**

Stage, module, function, modality, scope and provenance relation.

<a id="SYSTEM-OUT-001"></a>

> **SYSTEM-OUT-001** Semantic `kind` and positioning method `target.mode` MUST be separate. `row` and `line` are target modes, not event types.

<a id="SYSTEM-OUT-002"></a>

> **SYSTEM-OUT-002** `context.system.out.row(...)` and `.line(...)` MAY exist as SDK helpers but MUST normalize to the same portable event envelope and Anchor.

<a id="SYSTEM-OUT-003"></a>

> **SYSTEM-OUT-003** Compile and run errors are stored in top-level diagnostics. A successful position-bound warning MAY also be projected into `system.out` with the same diagnostic id.

**Compatibility**

The playground normalizes `context.system.out.row(...)` and `.line(...)` into separate `kind`, `target.mode` and `anchorRef`, and shows Anchor and SourceMap in Editor Metadata Lab. Editor Kernel is the separate control-plane protocol for the document lifecycle and consumes `system.out` through channel subscriptions. Legacy fields `type`, `row` and `line` remain as compatibility projections. Persistent anchors and the LSP adapter are still unsupported.
