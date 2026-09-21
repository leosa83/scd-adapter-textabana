# Blocks and intervals

**Blocks**

Strictly balanced. An inner block is replaced by its result before the surrounding block runs.

`outer(inner(text))`

**Intervals**

Do not need to close in LIFO order. Each maximal segment with the same active scope set runs as a unit.

`ordered(activeScopes)`

### Nested interval inverse

Conformance fixture · textabana

```textabana
>>>>+ base64encode @id=encoder

>>>>+ base64decode @id=decoder

<base64decode><base64encode> Textabana kan transformera den här texten </base64encode></base64decode>

<<<<+ @id=encoder
<<<<+ @id=decoder
```

With ascending declaration order, `base64encode` runs before `base64decode`. The result is therefore the original text. The example shows that execution order is determined by scope order, not closing order.

### Ordering concurrent intervals

### Total order for active intervals

| Part | Rule | Tie-break |
| --- | --- | --- |
| Explicit `@order` | A finite numeric value takes precedence. | Declaration sequence. |
| Without `@order` | Declaration sequence is used as the order value. | Declaration sequence. |
| Direction | Ascending is the default; descending must be specified in config. | Document-wide configuration. |

<a id="SCOPE-001"></a>

> **SCOPE-001** An interval MAY be called several times during its lifetime when changes in other active scopes create multiple maximal segments.

<a id="SCOPE-002"></a>

> **SCOPE-002** An explicit `@id` SHOULD be used for persistent addressing. A generated id is stable only within the same document version.

<a id="SCOPE-003"></a>

> **SCOPE-003** Blocks MUST be strictly nested. Intervals MAY overlap and cross each other because they are represented separately from the block tree.
