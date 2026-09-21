# Anchors and source maps

Lines move when text is edited. A durable metadata application therefore needs a versioned target, multiple selectors and an explicit re-anchoring algorithm that reports uncertainty.

### Canonical Anchor

Normative schema fragment · json

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

### Canonical selectors

| Selector | Identifies | Use |
| --- | --- | --- |
| `TextPositionSelector` | Half-open code point span. | Exact snapshot and fast lookup. |
| `TextQuoteSelector` | Exact text with optional prefix/suffix context. | Re-anchoring after a text edit. |
| `NodeSelector` | Semantic IR node. | Structural stability across minor changes. |
| `CellSelector` | Stable notebook cell.id. | Notebook profile. |
| `DataSelector` | datasetId, recordId and an optional column. | Table and analytics profile. |
| `Time/FragmentSelector` | Time, image region or another coordinate space. | Namespaced extension. |

### Coordinate spaces

| view | Coordinate | Typical target |
| --- | --- | --- |
| `source` | Unicode code points | Canonical text source. |
| `generated` | Output selector + SourceMap | Transformed intermediate value. |
| `rendered` | Renderer-specific selector | Visual Markdown/HTML projection. |
| `notebook` | cellId + source selector | Notebook cell. |
| `table` | datasetId + recordId + column | Table record. |
| `image / time` | Fragment or time selector | Image, audio and video region. |

### Re-anchoring in a fixed order

1. Same version → position.
2. Stable node/cell/record identity.
3. Unique quote + context.
4. Ambiguous/orphaned + diagnostic.

<a id="ANCHOR-001"></a>

> **ANCHOR-001** A durable annotation MUST bind to a versioned target and at least one selector. Position and quote SHOULD be stored together.

<a id="ANCHOR-002"></a>

> **ANCHOR-002** A runtime can never silently choose one of several re-anchoring candidates. Multiple valid candidates MUST produce `ambiguous`; the absence of a valid candidate MUST produce `orphaned`. Both outcomes are to remain unresolved and diagnosable.

<a id="ANCHOR-003"></a>

> **ANCHOR-003** Human-facing line and column are one-based. The LSP adapter MUST convert to zero-based UTF-16 positions.

This concerns human-facing presentation. Serialized `SourceSpan` uses one-based lines but zero-based code point columns and half-open offsets. The CodeMirror/Monaco bindings convert UTF-16 offsets; an LSP adapter remains planned.

<a id="SOURCEMAP-001"></a>

> **SOURCEMAP-001** Every mapping record MUST state `exact`, `derived` or `synthetic` and its generating activity. Aggregates are never `exact` without a verified mapping proof.

**Editor Metadata Lab**

Editor Metadata Lab produces Anchors with position and quote selectors and shows SourceMap records. Editor Kernel Lab additionally publishes actual cross-revision transitions: stable anchor id is matched first, then unique quote + origin; multiple candidates become `ambiguous` and no candidate becomes `orphaned`. Persistence across Worker restarts, structural/fuzzy matching and LSP coordinate conversion remain unimplemented.
