# Inheritance

When a block lies within active intervals, its complete block pipeline runs first. The block's output then becomes input to the ambient intervals in scope order. This is the language's natural default.

Source text → Block pipeline → Ambient intervals → Output

### Inheritance policies

| Policy | Selection | Placement |
| --- | --- | --- |
| `@inherit=default` | All ambient intervals. | Implicitly after the entire block pipeline. |
| `@inherit=none` | No intervals. | The block is an isolated island. |
| `@inherit=only` | Only the specified names or ids. | Implicitly after the block pipeline. |
| `@inherit=except` | All except the specified names or ids. | Implicitly after the block pipeline. |
| `@inherit=explicit` | Only explicitly selected intervals. | At each virtual @intervals stage. |

### Explicit interval placement

Normative syntax · textabana

```textabana
>>>> extract @inherit=explicit
  | @intervals only=[clean,redaction]
  | summarize sentences=3
  | @intervals only=[translation,provenance]
  | bullet

Text
<<<< extract
```

<a id="INHERIT-001"></a>

> **INHERIT-001** The presence of at least one `@intervals` stage MUST disable all implicit interval injection for the block.

<a id="INHERIT-002"></a>

> **INHERIT-002** Selection by function name matches every active instance with that name; selection by `@id` matches exactly one instance.

<a id="INHERIT-003"></a>

> **INHERIT-003** Inheritance controls the entire interval call, including its return value and emissions. Already emitted events can never be piped onward as text.

### Crossing between blocks and intervals

### Cross policies

| Policy | Algorithm | Status |
| --- | --- | --- |
| `error` | Reject partial crossing before execution. | Default 0.3 |
| `split` | Partition the block at scope boundaries and run it per segment. | Defined 0.4 |
| `promote` | Apply crossing intervals to the entire block result. | Defined 0.4 |
| `truncate` | End the interval's effect at the block boundary. | Defined 0.4 |
| `preserve` | Run the block once and apply the scope only to the corresponding output segments through a verified segment map. | Defined 0.4 |

**Safe mapping**

`preserve` MUST be denied for reducing or aggregating functions that do not supply a verifiable mapping proof.
