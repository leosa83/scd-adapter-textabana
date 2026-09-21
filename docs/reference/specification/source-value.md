# Source and values

Source is text-oriented, but a runtime value is not limited to a string. An explicit value envelope makes pipelines typeable across language boundaries.

### SourceDocument — minimum canonical fields

| Field | Type | Semantics |
| --- | --- | --- |
| `documentId` | URI or logical ID | Stable identity across revisions. |
| `documentVersion` | SHA-256 | Digest of normalized UTF-8 source. CRLF and CR become LF; no Unicode normalization is performed. |
| `baseUri` | URI | Base for include resolution and relative artifact references. |
| `source` | UTF-8 text | The exact immutable snapshot to which compilation is bound. |

### TextabanaValue — core kinds

| kind | Purpose | Data plane |
| --- | --- | --- |
| `text` | Text with a mediaType, normally text/plain or text/markdown. | Inline |
| `document` | Structured document value. | Inline or ArtifactRef |
| `scalar` | Boolean, number, string or null. | Inline JSON |
| `object` | Schema-checked object. | Inline JSON |
| `table` | Table with a schema and record identity. | Arrow or ArtifactRef |
| `tensor` | N-dimensional value with dtype and shape. | DLPack, Arrow or ArtifactRef |
| `graph` | Nodes and relations. | Schema-checked object/artifact |
| `mime-bundle` | Multiple representations of the same logical value. | MIME map |
| `artifact-ref` | Reference to large or binary data. | Opaque handle + digest |

<a id="VALUE-001"></a>

> **VALUE-001** Canonical offsets MUST be zero-based Unicode code point offsets and use half-open ranges `[start, end)`.

<a id="VALUE-002"></a>

> **VALUE-002** A string MAY be shorthand for `kind=text`. No other silent type conversion is permitted.

<a id="VALUE-003"></a>

> **VALUE-003** Pipeline edges MUST be type-checked against the function's `accepts` and `returns` when the schema is known.
