# Runtime protocol

This is the target protocol for polyglot runtimes. Today's executable host boundary is the Editor Kernel messaging protocol below; `initialize` and `execute` are not methods on the current TypeScript client. Start with the [integration guide](./integration.md) for working calls.

### Runtime methods

| Method | Requirement | Responsibility |
| --- | --- | --- |
| `initialize` | MUST | Negotiate version, environment and granted capabilities. |
| `capabilities` | MUST | Declare the host's runtimes, value kinds, limits and adapter profiles. |
| `execute` | MUST | Run a stage with typed input, arguments, anchors and run context. |
| `cancel` | MUST | Propagate cancellation to the ongoing invocation. |
| `inspect` | SHOULD | Describe a symbol, schema or runtime value to the editor. |
| `complete` | MAY | Provide completions for functions, arguments and channels. |
| `shutdown` | SHOULD | Release the session and external resources. |

### ExecuteRequest — logical form

Normative schema fragment · json

```json
{
  "runId": "run:42",
  "stageId": "extract:1",
  "functionRef": "org.example.claims/extract@2.1.0",
  "input": { "kind": "text", "mediaType": "text/markdown", "data": "..." },
  "args": { "model": "claims-v2" },
  "sourceAnchors": ["anchor:claim-input"],
  "grantedCapabilities": ["model:claims-v2"],
  "deadline": "host-monotonic-deadline",
  "cancelToken": "cancel:42:1"
}
```

Context: source snapshot · anchor builder · run / stage / profile · emit · system.out · artifacts.put · cancellation · granted capabilities · diagnostics.

<a id="RUNTIME-001"></a>

> **RUNTIME-001** `emit` is logically acknowledged. Module completion MUST flush all accepted events before the stage ends.

<a id="RUNTIME-002"></a>

> **RUNTIME-002** Functions cannot implicitly read channels. Using a channel as input requires an explicit Plan edge or adapter stage.

<a id="RUNTIME-003"></a>

> **RUNTIME-003** JavaScript, TypeScript, Python, R, Julia, SQL, WASM and external services MAY implement the same protocol without language-specific semantic treatment.
