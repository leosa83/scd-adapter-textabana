# Error model

### Felkodsfamiljer

| Prefix | Fas | Exempel |
| --- | --- | --- |
| `TBA-PARSE` | Lexing / parsing | Obalanserat block eller ogiltig marker. |
| `TBA-RESOLVE` | Include / manifest | Cykel, digest mismatch eller exportkollision. |
| `TBA-TYPE` | Planering | Inkompatibel TextabanaValue eller channel payload. |
| `TBA-RUN` | Exekvering | Funktionsfel, timeout, cancellation eller backpressure. |
| `TBA-ANCHOR` | Positionering | Ambiguous, orphan eller falskt exact mapping claim. |
| `TBA-SECURITY` | Capabilities | Saknad grant, otillåten URI eller secret leak. |
| `TBA-ADAPTER` | Interop | Förlust av metadata, schema eller coordinate conversion. |

### Diagnostic

Normativt schemafragment · json

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

> **ERROR-001** Diagnostik MÅSTE ha stabil kod, severity, message, fas och position när position är känd. Hostspecifika stacktraces FÅR bifogas som skyddad extension.

<a id="ERROR-002"></a>

> **ERROR-002** För samma malformed construct MÅSTE `code`, `recoveryKind` och `diagnosticKey` vara semantiskt stabila. `diagnosticId` och source span är snapshotbundna och får flytta sig först genom en explicit ny analys eller re-anchor-transition.

<a id="ERROR-003"></a>

> **ERROR-003** En parsediagnostik MÅSTE bära ett halvöppet `sourceSpan` och `recoveryNodeId`. Relaterad opener eller declaration BÖR anges i `related`.

<a id="VERSION-001"></a>

> **VERSION-001** Language, IR, Result och adapterprofiler versioneras oberoende. Breaking semantik kräver ny major/schemaidentifierare.

<a id="VERSION-002"></a>

> **VERSION-002** Extensions MÅSTE vara namespaced. Okända optional extensions round-trippas; okända required extensions stoppar körningen med capabilitydiagnostik.
