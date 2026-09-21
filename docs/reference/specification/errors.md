# Error model

### Error code families

| Prefix | Phase | Example |
| --- | --- | --- |
| `TBA-PARSE` | Lexing / parsing | Unbalanced block or invalid marker. |
| `TBA-RESOLVE` | Include / manifest | Cycle, digest mismatch or export collision. |
| `TBA-TYPE` | Planning | Incompatible TextabanaValue or channel payload. |
| `TBA-RUN` | Execution | Function error, timeout, cancellation or backpressure. |
| `TBA-ANCHOR` | Positioning | Ambiguous, orphaned or false exact mapping claim. |
| `TBA-SECURITY` | Capabilities | Missing grant, forbidden URI or secret leak. |
| `TBA-ADAPTER` | Interoperability | Loss of metadata, schema or coordinate conversion. |

### Diagnostic

Normative schema fragment · json

```json
{
  "diagnosticId": "diag:run-42:3",
  "code": "TBA-TYPE-CHANNEL-PAYLOAD",
  "severity": "error",
  "message": "claims event matchar inte schema:claim/v2",
  "anchorRef": "anchor:emit-call",
  "related": [{ "anchorRef": "anchor:manifest-channel" }],
  "phase": "planning",
  "cause": { "schemaPath": "/required/label" }
}
```

<a id="ERROR-001"></a>

> **ERROR-001** Diagnostics MUST have a stable code, severity, message, phase and position when the position is known. Host-specific stack traces MAY be attached as a protected extension.

<a id="ERROR-002"></a>

> **ERROR-002** For the same malformed construct, `code`, `recoveryKind` and `diagnosticKey` MUST be semantically stable. `diagnosticId` and source span are snapshot-bound and may move only through an explicit new analysis or re-anchoring transition.

<a id="ERROR-003"></a>

> **ERROR-003** A parse diagnostic MUST carry a half-open `sourceSpan` and `recoveryNodeId`. A related opener or declaration SHOULD be specified in `related`.

<a id="VERSION-001"></a>

> **VERSION-001** Language, IR, Result and adapter profiles are versioned independently. Breaking semantics require a new major version/schema identifier.

<a id="VERSION-002"></a>

> **VERSION-002** Extensions MUST be namespaced. Unknown optional extensions round-trip; unknown required extensions stop the run with a capability diagnostic.
