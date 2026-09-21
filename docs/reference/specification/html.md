# Textabana and HTML

HTML and JavaScript can build advanced metadata applications. The difference concerns which semantics are standardized and which artifact remains the canonical source, rather than what is possible to program.

**The key distinction**

HTML describes a document tree that a browser can present. Textabana describes which semantic processes apply to which parts of a text, in what order, and which traceable results they produce.

### HTML compared with Textabana

| Dimension | HTML | Textabana |
| --- | --- | --- |
| Primary artifact | A marked-up element tree for the web. | Readable, versioned text that can exist outside the web. |
| Basic structure | A strictly nested DOM. | A block tree plus open intervals that may overlap and cross. |
| Behavior | Usually defined by separate, application-specific JavaScript. | Declared functions, pipelines, scope order and inheritance are part of the language model. |
| Primary output | DOM and browser rendering. | TextabanaResult with render, typed channels, artifacts, diagnostics and provenance. |
| Metadata | Attributes and data-* on elements; the application defines their meaning. | Schema-checked events bound to source through Anchor and SourceMap. |
| Position | DOM nodes, selectors and offsets in the rendered structure. | Versioned source identity; row, line and DOM positions are interchangeable projections. |
| Order | Determined by the application's event and JavaScript code. | Normative through pipelines, @order, active scopes and inheritance policy. |
| Host | Browser- and DOM-oriented. | Host-neutral: editor, notebook, Python/R/Julia, server, data pipeline or web. |
| Crossing intervals | Cannot be expressed as one valid nested element tree without fragmentation. | A first-class concept with explicit cross policy and preserved scope ids. |

### HTML stores an existing assertion

### Metadata in a DOM element

Illustrative · html

```html
<p data-kind="claim" data-confidence="0.94">
  Textabana kan användas för metadataeditorer.
</p>
```

The element carries metadata, but HTML does not define which process created it, how it was validated or how it is to follow changes back to edited source text.

### Textabana declares the process

### Semantic functions over source text

Illustrative · textabana

```textabana
>>>>+ normalize @id=clean @order=10
>>>>+ claims.extract @id=claims @order=20

Textabana kan användas för metadataeditorer.

<<<<+ @id=clean
<<<<+ @id=claims
```

The same run can produce a clean render, a typed claim event, an editor annotation, an Anchor and provenance without embedding everything in the visible text.

**Textabana source** — canonical semantics

**TextabanaResult** — render · channels · anchors

**HTML adapter** — projection policy

**DOM** — one possible presentation

<a id="HTML-ADAPTER-001"></a>

> **HTML-ADAPTER-001** HTML MAY be a rendering format and editor host, but DOM nodes or DOM offsets cannot replace Textabana's canonical Anchor identity.

<a id="HTML-ADAPTER-002"></a>

> **HTML-ADAPTER-002** When crossing intervals are projected to HTML, the adapter MUST fragment the presentation without losing scope ids, SourceMap or execution semantics.

<a id="HTML-ADAPTER-003"></a>

> **HTML-ADAPTER-003** An HTML adapter may present or sanitize the result but cannot make browser order, DOM nesting or event timing new language semantics.
