# Source and values

Källan är textorienterad, men runtimevärdet är inte begränsat till en sträng. Ett explicit värdekuvert gör pipelines typbara över språkgränser.

### SourceDocument — minsta kanoniska fält

| Fält | Typ | Semantik |
| --- | --- | --- |
| `documentId` | URI eller logiskt ID | Stabil identitet över revisioner. |
| `documentVersion` | SHA-256 | Digest av normaliserad UTF-8-källa. CRLF och CR blir LF; ingen Unicode-normalisering görs. |
| `baseUri` | URI | Bas för include-resolution och relativa artifactreferenser. |
| `source` | UTF-8 text | Den exakta immutable snapshot som kompileringen är bunden till. |

### TextabanaValue — core kinds

| kind | Avsikt | Dataplan |
| --- | --- | --- |
| `text` | Text med mediaType, normalt text/plain eller text/markdown. | Inline |
| `document` | Strukturerat dokumentvärde. | Inline eller ArtifactRef |
| `scalar` | Boolean, tal, sträng eller null. | Inline JSON |
| `object` | Schema-kontrollerat objekt. | Inline JSON |
| `table` | Tabell med schema och record identity. | Arrow eller ArtifactRef |
| `tensor` | N-dimensionellt värde med dtype och shape. | DLPack, Arrow eller ArtifactRef |
| `graph` | Noder och relationer. | Schema-kontrollerat objekt/artifact |
| `mime-bundle` | Flera representationer av samma logiska värde. | MIME-map |
| `artifact-ref` | Referens till stor eller binär data. | Opaque handle + digest |

<a id="VALUE-001"></a>

> **VALUE-001** Kanoniska offsets MÅSTE vara nollbaserade Unicode-code-point-offsets och använda halvöppna intervall `[start, end)`.

<a id="VALUE-002"></a>

> **VALUE-002** En sträng FÅR vara shorthand för `kind=text`. Ingen annan tyst typkonvertering är tillåten.

<a id="VALUE-003"></a>

> **VALUE-003** Pipelinekanter MÅSTE typkontrolleras mot funktionens `accepts` och `returns` när schema är känt.
