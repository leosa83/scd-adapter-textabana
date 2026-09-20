# Textabana and HTML

HTML kan tillsammans med JavaScript bygga avancerade metadataapplikationer. Skillnaden är inte vad som över huvud taget går att programmera, utan vilken semantik som standardiseras och vilken artefakt som förblir den kanoniska källan.

**Den avgörande skillnaden**

HTML beskriver ett dokumentträd som en webbläsare kan presentera. Textabana beskriver vilka semantiska processer som gäller över vilka delar av en text, i vilken ordning, och vilka spårbara resultat de producerar.

### HTML jämfört med Textabana

| Dimension | HTML | Textabana |
| --- | --- | --- |
| Primär artefakt | Ett märkt elementträd för webben. | Läsbar, versionerad text som kan leva utanför webben. |
| Grundstruktur | En strikt nästlad DOM. | Ett blockträd plus öppna intervall som får överlappa och korsa. |
| Beteende | Definieras normalt av separat, applikationsspecifik JavaScript. | Deklarerade funktioner, pipelines, scope-ordning och inheritance ingår i språkmodellen. |
| Primär output | DOM och browserrendering. | TextabanaResult med render, typade channels, artifacts, diagnostics och provenance. |
| Metadata | Attribut och data-* på element; betydelsen bestäms av applikationen. | Schema-kontrollerade events som binds till källan via Anchor och SourceMap. |
| Position | DOM-noder, selectors och offsets i den renderade strukturen. | Versionerad källidentitet; row, line och DOM-position är utbytbara projektioner. |
| Ordning | Bestäms av den aktuella applikationens event- och JavaScriptkod. | Är normativ genom pipeline, @order, aktiva scopes och inheritance-policy. |
| Host | Webbläsar- och DOM-orienterad. | Host-neutral: editor, notebook, Python/R/Julia, server, datapipeline eller webb. |
| Korsande intervall | Kan inte uttryckas som ett enda giltigt nästlat elementträd utan fragmentering. | Är ett förstaklassbegrepp med explicit cross-policy och bevarade scope-id:n. |

### HTML lagrar ett färdigt påstående

### Metadata i ett DOM-element

Illustrativt · html

```html
<p data-kind="claim" data-confidence="0.94">
  Textabana kan användas för metadataeditorer.
</p>
```

Elementet bär metadata, men HTML definierar inte vilken process som skapade den, hur den validerades eller hur den ska följa med tillbaka till en redigerad källtext.

### Textabana deklarerar processen

### Semantiska funktioner över källtext

Illustrativt · textabana

```textabana
>>>>+ normalize @id=clean @order=10
>>>>+ claims.extract @id=claims @order=20

Textabana kan användas för metadataeditorer.

<<<<+ @id=clean
<<<<+ @id=claims
```

Samma run kan producera en ren render, ett typat claim-event, en editorannotation, ett Anchor och proveniens utan att bädda in allt i den synliga texten.

**Textabana source** — kanonisk semantik

**TextabanaResult** — render · channels · anchors

**HTML-adapter** — projection policy

**DOM** — en möjlig presentation

<a id="HTML-ADAPTER-001"></a>

> **HTML-ADAPTER-001** HTML FÅR vara renderformat och editorhost, men DOM-noder eller DOM-offsets får inte ersätta Textabanas kanoniska Anchor-identitet.

<a id="HTML-ADAPTER-002"></a>

> **HTML-ADAPTER-002** När korsande intervall projiceras till HTML MÅSTE adaptern fragmentera presentationen utan att förlora scope-id, SourceMap eller exekveringssemantik.

<a id="HTML-ADAPTER-003"></a>

> **HTML-ADAPTER-003** En HTML-adapter får presentera eller sanera resultatet men får inte göra browserordning, DOM-nästling eller eventtiming till ny språksemantik.
