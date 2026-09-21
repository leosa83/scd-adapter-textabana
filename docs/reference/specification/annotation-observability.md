# Annotation and observability

Textabana separates a model's proposal from a person's decision. The kernel stores candidate, review and revision as separate events with the same stable annotation identity. A post-commit adapter projects the chain to external standards without making their formats new core semantics.

**Executable Annotation & AI Review subset**

`annotation/1` supports whole snapshots, stable annotation ids, model/prompt/input digests, an explicit confidence method, accept/reject/supersede and resolvable W3C and Label Studio projections. Digests are labeled `fnv1a-lab`; actual model execution, a persistent review store and `ml-lineage/1` are not simulated.

### Exact annotation model executed in the playground

| Channel | Payload | Semantics |
| --- | --- | --- |
| `annotation.set` | setId, wholeSnapshot, authoredOrder, candidateIds, currentIds, counts, setDigest | Exactly one complete snapshot fixing the event set, order and current view. |
| `annotation.candidates` | annotationId, revision 0, body, model, prompt, inputDigest, confidence | Immutable model facts. The payload never contains decision, reviewer or supersededBy. |
| `annotation.reviews` | reviewId, candidateEventRef, revision 1, decision, reviewer, reviewDigest | Append-only human action. accept, reject and supersede are the only decisions in the lab subset. |
| `annotation.revisions` | revisionId, state, basedOnEventRef, reviewEventRef, supersedes/supersededBy | Materialized review outcome plus an optional explicit human replacement. |

### Lightweight review source

Executable fixture · annotation-review · textabana

```textabana
>>>>! include "./modules/annotation.js"

>>>> annotation_review set_id="voyage-review" reviewer="leo"
## Annotation: Route {#ann-route origin="ai" model="extractor" model_version="1.0" prompt_id="route-v1" confidence=0.82 confidence_method="model-reported" decision="accept"}
Aurora lämnade Göteborg den 4 maj.

## Annotation: Status candidate {#ann-status origin="ai" model="extractor" model_version="1.0" prompt_id="status-v1" confidence=0.73 confidence_method="model-reported" decision="supersede" superseded_by="ann-status-reviewed"}
Positionen är en granskningskandidat.

## Annotation: Status reviewed {#ann-status-reviewed origin="human" supersedes="ann-status"}
Positionen kräver extern verifiering.
<<<< annotation_review
```

**Review is source-driven in this fresh runtime**

The playground has no buttons that pretend to save decisions. Change `decision` in the source and run again: the candidate's facts remain separate, while a new review event and revision 1 materialize the decision in the new snapshot.

### Interoperability mapping

| Technology | Role | Textabana mapping |
| --- | --- | --- |
| W3C Web Annotation | Portable annotation export | Executable AnnotationPage; target copies a versioned Anchor with position/quote selectors and anchorRef. |
| W3C PROV | Semantic provenance | Source/result/event/artifact = Entity; stage/run = Activity; person/runtime/module/model = Agent. |
| LSP | Transient editor projection | Diagnostics, semantic tokens, inlay hints and code actions; never canonical storage. |
| OpenLineage | Data pipeline lineage | Job, Run and Dataset from Plan, Run and Artifact/Data outputs. |
| OpenTelemetry | Operational observability | Traces, logs and metrics with traceId/spanId; not semantic truth. |
| CloudEvents | Distributed event transport | Event envelope export with idempotent event identity. |
| MLflow | Experiments and model artifacts | Parameters, metrics, models and artifacts from run/provenance. |
| Label Studio | Annotation tool | Executable task/import subset with choices results and Textabana references in meta; no API/project round trip. |
| doccano / Prodigy / brat | Additional annotation tools | Planned adapter profiles through Anchor + Annotation + review relations. |

### Immutable model candidate

Canonical event payload · annotation.candidates · json

```json
{
  "annotationId": "ann-route",
  "revision": 0,
  "status": "candidate",
  "body": "Aurora lämnade Göteborg den 4 maj.",
  "model": { "id": "extractor", "version": "1.0", "digest": "fnv1a:..." },
  "prompt": { "id": "route-v1", "digest": "fnv1a:..." },
  "inputDigest": "fnv1a:...",
  "confidence": { "score": 0.82, "method": "model-reported" }
}
```

### W3C target reuses Anchor

Executable adapter projection · json

```json
"target": {
  "source": "doc:document.md",
  "selector": [
    { "type": "TextPositionSelector", "start": 184, "end": 223 },
    { "type": "TextQuoteSelector", "exact": "Aurora lämnade Göteborg den 4 maj." }
  ],
  "textabana:anchorRef": "anchor:annotation:..."
}
```

### Label Studio task/import subset

Executable adapter projection · json

```json
{ "id": "ann-route",
  "data": { "text": "Aurora lämnade Göteborg den 4 maj." },
  "annotations": [{ "id": "review:ann-route:1", "result": [{
    "type": "choices", "value": { "choices": ["accept"] }
  }] }],
  "meta": { "textabana": { "anchorRef": "anchor:annotation:..." } } }
```

<a id="ANNOTATION-001"></a>

> **ANNOTATION-001** Internal annotation MUST support spans, document classification, relations and review state. W3C Web Annotation is an import/export profile, not the entire core model.

<a id="ANNOTATION-002"></a>

> **ANNOTATION-002** Human-in-the-loop review MUST create a separate review event and a new reviewed revision. The model candidate's original facts cannot be mutated. Only `supersede` requires an explicit replacement with reciprocal `supersededBy`/`supersedes` relations.

<a id="ANNOTATION-003"></a>

> **ANNOTATION-003** An AI candidate MUST state a stable annotationId, model id/version/digest, prompt id/digest, input digest and confidence score and method. Confidence is evidence metadata, not the probability of truth.

<a id="ANNOTATION-004"></a>

> **ANNOTATION-004** Every durable candidate, review and revision MUST be resolvable through Event, AnnotationSelector, Anchor, SourceMap and generating Activity. An exported target cannot invent independent offsets.

<a id="ANNOTATION-005"></a>

> **ANNOTATION-005** W3C Web Annotation and annotation-tool formats are adapter projections. They cannot write external format semantics back into candidate or review events without an explicitly imported new revision.

<a id="ANNOTATION-006"></a>

> **ANNOTATION-006** A whole annotation snapshot MUST validate unique ids, counts, links, decisions, current view and an acyclic supersede chain before commit. The current lab subset limits each target to one non-empty text line.

<a id="PROV-001"></a>

> **PROV-001** Every durable output MUST link to its generating Activity and the input anchors/entities used. Operational traces MAY be linked but do not replace semantic provenance.

<a id="EXT-001"></a>

> **EXT-001** Unknown namespaced extension fields MUST round-trip through adapters that do not understand them.

### Standard references

- [**Lezer** — Editor parser, CST, recovery and incremental reuse](https://lezer.codemirror.net/docs/guide/)
- [**JSON Schema 2020-12** — Validation of portable JSON contracts](https://json-schema.org/draft/2020-12)
- [**W3C Web Annotation** — Annotation export](https://www.w3.org/TR/2017/REC-annotation-model-20170223/)
- [**W3C PROV-O** — Provenance export](https://www.w3.org/TR/2013/REC-prov-o-20130430/)
- [**Jupyter Messaging** — Kernel transport](https://jupyter-client.readthedocs.io/en/stable/messaging.html)
- [**nbformat** — Notebook projection and cell ids](https://nbformat.readthedocs.io/en/latest/format_description.html)
- [**Apache Arrow** — Tabular data plane](https://arrow.apache.org/docs/format/Columnar.html)
- [**CloudEvents** — Distributed event export](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
