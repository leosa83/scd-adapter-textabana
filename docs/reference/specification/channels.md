# Typed channels

Channels follow the logging pattern's open namespace, but a channel name must resolve to a descriptor. JSON is the control plane; Arrow and ArtifactRef are the data plane.

### ChannelDescriptor and event envelope

Normative schema fragment · json

```json
{
  "descriptor": {
    "name": "claims",
    "payloadKind": "object",
    "mediaType": "application/json",
    "schemaRef": "schema:claim/v2",
    "delivery": "snapshot",
    "persistence": "durable",
    "ordering": "global-sequence",
    "key": ["payload.claimId"],
    "required": false,
    "sensitivity": "internal"
  },
  "event": {
    "schema": "textabana.event/v1",
    "eventId": "run:42:17",
    "runId": "run:42",
    "sequence": 17,
    "channel": "claims",
    "kind": "candidate",
    "phase": "run",
    "target": { "anchorRef": "anchor:claim-42" },
    "origin": { "stageId": "extract:1" },
    "correlation": { "traceId": "trace:...", "spanId": "span:..." },
    "provenanceRef": "activity:extract-claims",
    "state": "committed",
    "payload": { "label": "Textabana" },
    "extensions": {}
  }
}
```

### ChannelDescriptor — portable contract

| Field | Allowed values | Rule |
| --- | --- | --- |
| `name` | Open, namespaced name | Must be unique in the result; system.* is reserved. |
| `payloadKind / mediaType / schemaRef` | TextabanaValue + media type + JSON Schema | Determine validation and adapter selection. |
| `delivery` | snapshot · stream | Describes consumption mode, not commit status. |
| `persistence` | durable · transient | Transient events are excluded from the committed snapshot. |
| `ordering` | global-sequence or declared key | Must provide reproducible iteration. |
| `key` | One or more payload fields | Optional stable domain identity/idempotency. |
| `required` | boolean | Whether absence of an event makes the run invalid. |
| `sensitivity` | Host-defined classification | An adapter may only tighten it, never silently lower it. |

`return value` — **Primary value**

Becomes input to the next stage and ultimately the result's `render`.

`context.emit(name, event)` — **Side flow**

Appends a validated event without changing the pipeline value.

`result.channel(name)` — **Target read API**

Illustrative helper. The current SDK reads `resultEnvelope.channelSnapshots[name].events` after a run.

<a id="CHANNEL-001"></a>

> **CHANNEL-001** Channel names are unrestricted except for the reserved namespace `system.*`. `render` is reserved as a result field.

<a id="CHANNEL-002"></a>

> **CHANNEL-002** In a strict profile, the descriptor and payload schema MUST be declared before emit. A permissive legacy profile MAY synthesize a generic JSON descriptor on the first emit but cannot claim typed-channel conformance.

<a id="CHANNEL-003"></a>

> **CHANNEL-003** Events are append-only within a run. A schema error, cyclic payload or unserializable value MUST be rejected, not lossily converted to text.

<a id="CHANNEL-004"></a>

> **CHANNEL-004** Each accepted emit receives an order key `(planStep, invocationOrder, localEmitIndex)`. `sequence` is assigned during deterministic merge/commit.

<a id="CHANNEL-005"></a>

> **CHANNEL-005** A function module does not run once per channel. A single function call MAY emit to any number of channels.

**Strict channels in the playground**

Strict mode requires a declared descriptor and rejects undeclared channels, reserved names and cyclic or non-serializable payloads. Inline schemas use Ajv2020 under [textabana.channel-schema/2020-12-v1](../channel-schemas.md): nested rules, local references, enums and bounds are enforced; unsupported features and malformed schemas are rejected at declaration. Validation does not coerce or mutate payloads and also applies to schema-bearing permissive channels. `schemaRef` does not resolve or fetch a schema, and a declared descriptor may still omit an inline schema, so this is not full typed-channel conformance. Editor Kernel has credit-controlled metadata streaming after commit; continuous stage streaming and general sink backpressure remain unimplemented.
