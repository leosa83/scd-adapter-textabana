# Annotation and observability

Textabana skiljer modellens förslag från människans beslut. Kärnan lagrar kandidat, review och revision som separata events med samma stabila annotation-identitet. En post-commit-adapter projicerar kedjan till externa standarder utan att göra deras format till ny kärnsemantik.

**Körbar Annotation & AI Review-subset**

`annotation/1` kör whole snapshots, stabila annotation-id:n, modell-/prompt-/inputdigests, explicit confidence method, accept/reject/supersede och resolverbara W3C- samt Label Studio-projektioner. Digests är märkta `fnv1a-lab`; verklig modellkörning, persistent review store och `ml-lineage/1` är inte simulerade.

### Exakt exekverad annotationsmodell i playgrounden

| Kanal | Payload | Semantik |
| --- | --- | --- |
| `annotation.set` | setId, wholeSnapshot, authoredOrder, candidateIds, currentIds, counts, setDigest | Exakt en komplett snapshot som låser eventmängd, ordning och current view. |
| `annotation.candidates` | annotationId, revision 0, body, model, prompt, inputDigest, confidence | Immutable modellfakta. Payloaden innehåller aldrig decision, reviewer eller supersededBy. |
| `annotation.reviews` | reviewId, candidateEventRef, revision 1, decision, reviewer, reviewDigest | Append-only mänsklig handling. accept, reject och supersede är de enda besluten i lab-subseten. |
| `annotation.revisions` | revisionId, state, basedOnEventRef, reviewEventRef, supersedes/supersededBy | Materialiserat reviewutfall plus eventuell explicit mänsklig ersättare. |

### Lättviktig reviewkälla

Körbar fixture · annotation-review · textabana

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

**Review är källstyrd i denna fresh-runtime**

Playgrounden visar inga knappar som låtsas spara beslut. Ändra `decision` i källan och kör igen: kandidatens fakta förblir separata, medan ett nytt review-event och revision 1 materialiserar beslutet i den nya snapshoten.

### Interopmappning

| Teknik | Roll | Textabana mapping |
| --- | --- | --- |
| W3C Web Annotation | Portabel annotationsexport | Körbar AnnotationPage; target kopierar versionerad Anchor med position/quote selectors och anchorRef. |
| W3C PROV | Semantisk proveniens | Source/result/event/artifact = Entity; stage/run = Activity; människa/runtime/modul/model = Agent. |
| LSP | Transient editorprojection | Diagnostics, semantic tokens, inlay hints och code actions; aldrig canonical storage. |
| OpenLineage | Data pipeline lineage | Job, Run och Dataset från Plan, Run och Artifact/Data outputs. |
| OpenTelemetry | Operativ observability | Trace, logs och metrics med traceId/spanId; inte semantisk sanning. |
| CloudEvents | Distribuerad eventtransport | Export av event envelope med idempotent event identity. |
| MLflow | Experiment och modellartifacts | Parametrar, metrics, models och artifacts från run/proveniens. |
| Label Studio | Annoteringsverktyg | Körbar task/import-subset med choices-resultat och Textabana-referenser i meta; ingen API-/projektroundtrip. |
| doccano / Prodigy / brat | Ytterligare annoteringsverktyg | Planerade adapterprofiler via Anchor + Annotation + review relations. |

### Immutable modellkandidat

Kanoniskt eventpayload · annotation.candidates · json

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

### W3C target återanvänder Anchor

Körbar adapterprojektion · json

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

### Label Studio task/import-subset

Körbar adapterprojektion · json

```json
{ "id": "ann-route",
  "data": { "text": "Aurora lämnade Göteborg den 4 maj." },
  "annotations": [{ "id": "review:ann-route:1", "result": [{
    "type": "choices", "value": { "choices": ["accept"] }
  }] }],
  "meta": { "textabana": { "anchorRef": "anchor:annotation:..." } } }
```

<a id="ANNOTATION-001"></a>

> **ANNOTATION-001** Intern annotation MÅSTE stödja span, document classification, relation och review state. W3C Web Annotation är en import/exportprofil, inte hela kärnmodellen.

<a id="ANNOTATION-002"></a>

> **ANNOTATION-002** Human-in-the-loop MÅSTE skapa ett separat review-event och en ny reviewed revision. Modellkandidatens ursprungliga fakta får inte muteras. Endast `supersede` kräver en explicit ersättare med ömsesidiga `supersededBy`/`supersedes`-relationer.

<a id="ANNOTATION-003"></a>

> **ANNOTATION-003** En AI-kandidat MÅSTE ange stabilt annotationId, modell-id/version/digest, prompt-id/digest, inputdigest samt confidence score och metod. Confidence är evidensmetadata, inte sanningssannolikhet.

<a id="ANNOTATION-004"></a>

> **ANNOTATION-004** Varje durable candidate, review och revision MÅSTE lösas genom Event, AnnotationSelector, Anchor, SourceMap och generating Activity. En exporterad target får inte uppfinna fristående offsets.

<a id="ANNOTATION-005"></a>

> **ANNOTATION-005** W3C Web Annotation och annoteringsverktygsformat är adapterprojektioner. De får inte skriva tillbaka extern formatsemantik till kandidat- eller revieweventen utan en explicit importerad ny revision.

<a id="ANNOTATION-006"></a>

> **ANNOTATION-006** En whole annotation snapshot MÅSTE validera unika id:n, counts, länkar, beslut, current view och acyklisk supersede-kedja före commit. Den aktuella lab-subseten begränsar varje target till en icke-tom textrad.

<a id="PROV-001"></a>

> **PROV-001** Varje durable output MÅSTE länka till generating Activity och använda inputanchors/entities. Operativa traces FÅR länkas men ersätter inte semantic provenance.

<a id="EXT-001"></a>

> **EXT-001** Okända namespaced extensionfält MÅSTE round-trippas av adaptrar som inte förstår dem.

### Standardreferenser

[**Lezer** — Editorparser, CST, recovery och inkrementell återanvändning](https://lezer.codemirror.net/docs/guide/)[**JSON Schema 2020-12** — Validering av portabla JSON-kontrakt](https://json-schema.org/draft/2020-12)[**W3C Web Annotation** — Annotationsexport](https://www.w3.org/TR/2017/REC-annotation-model-20170223/)[**W3C PROV-O** — Proveniensexport](https://www.w3.org/TR/2013/REC-prov-o-20130430/)[**Jupyter Messaging** — Kerneltransport](https://jupyter-client.readthedocs.io/en/stable/messaging.html)[**nbformat** — Notebookprojection och cell ids](https://nbformat.readthedocs.io/en/latest/format_description.html)[**Apache Arrow** — Tabulärt dataplan](https://arrow.apache.org/docs/format/Columnar.html)[**CloudEvents** — Distribuerad eventexport](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
