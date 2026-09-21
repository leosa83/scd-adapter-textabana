# TextabanaResult

### Result envelope · target contract

Normative schema fragment · json

```json
{
  "schema": "textabana.result/v1",
  "resultId": "sha256:...",
  "run": { "runId": "run:...", "instanceId": "run-instance:...", "profile": "fresh", "status": "succeeded" },
  "source": { "documentId": "doc:claims", "version": "sha256:..." },
  "render": { "kind": "text", "mediaType": "text/markdown", "data": "..." },
  "channelSnapshots": {
    "system.out": { "descriptor": {}, "events": [] },
    "claims": { "descriptor": {}, "events": [] }
  },
  "artifacts": [],
  "provenance": { "entities": [], "activities": [], "agents": [] },
  "diagnostics": [],
  "hashes": { "ir": "sha256:...", "environment": "sha256:..." }
}
```

### Parts of the result

| Part | Responsibility | Rule |
| --- | --- | --- |
| `render` | Primary projection of the return pipeline. | A result field, not an emittable channel. |
| `channelSnapshots` | Zero or more named, typed event lists. | Published atomically on success. |
| `artifacts` | Content-addressed large/binary outputs. | Carry no durable credentials. |
| `provenance` | Entity–Activity–Agent relations. | Bind each durable output to how it was created. |
| `diagnostics` | Compile and run diagnostics. | Top-level is the sole canonical source of truth for execution errors. |

<a id="RESULT-001"></a>

> **RESULT-001** A successful result MUST be immutable. `resultId` SHOULD be content-addressed.

<a id="RESULT-002"></a>

> **RESULT-002** A failed or cancelled result MUST have empty committed render and empty committed domain channels, but MAY carry control-plane diagnostics.

<a id="RESULT-003"></a>

> **RESULT-003** Timestamps are transport metadata and cannot determine semantic hashes or event order.

**The result shown by the playground**

The current envelope is `textabana.result/lab-v1`, not the production schema in the fragment above. Read `response.resultEnvelope` and the channels' `channelSnapshots[name].events`; transport-level `output` and `channels` are separate convenience fields. Success commits atomically; failed and cancelled runs show empty committed render and empty domain channels. Separate SHA-256 artifact identities, credit-controlled metadata streaming after commit and explicit stage, event and render limits are available. Remaining work before full `runtime-json/1` conformance includes synchronous preemption, continuous stage streaming, general sink backpressure, hard CPU/memory quotas, external rollback and persistent binary artifacts.
