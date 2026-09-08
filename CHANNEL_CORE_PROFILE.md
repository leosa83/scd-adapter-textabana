# Textabana channel core — independent reference profile v1

Profile `textabana.channel-core/v1`, version `1.0.0`, extends the bounded [scoped text profile](./SCOPED_TEXT_PROFILE.md) with a fixed channel function catalog. The [text core specification](./TEXT_CORE_PROFILE.md) and scoped specification remain normative for source admission, parsing, lowering, pure transforms and interval/block execution. All three specifications are pinned by this profile's manifest. The earlier profiles and frozen fixtures retain their original scope.

## Run and reproduce

```sh
python3 reference/channel_core.py run examples/channel-core.md
node cli/textabana.mjs conformance-channel-core > channel-core-report.json
```

Python 3.10+ runs three sibling files: `channel_core.py`, `scoped_text.py` and `text_core.py`. They independently parse, lower and evaluate source and maintain channel state using only the standard library. They run outside the repository with no Node on PATH. `run` returns JSON and exits nonzero on rejection; `batch` accepts `{sources: [...]}` and returns `{profile, results}`. Interpreter failure, invalid protocol output or timeout fails the suite rather than satisfying a negative fixture.

The JavaScript bridge uses the existing parser for admission and the actual Worker for execution. It injects one trusted include containing the concatenated fixed text and channel modules, with strict channels, sequential execution and the limits below. Caller-supplied modules and arbitrary channel descriptors are outside this profile. The shared JavaScript admission helper does not consult Python output.

## Fixed functions and payload

The five pure text functions retain their earlier contract. Every channel function returns its input unchanged unless it fails. Domain arguments are JSON double-quoted strings; unused arguments have no effect.

| Function | Behavior |
|---|---|
| `publish` | Emit one payload to `channel`, default `records`. |
| `publishRow` | Emit through `system.out.row`, always to `system.out` in row mode. Ignore the supplied `channel` and `mode`. |
| `fanout` | Emit one payload each to `records`, `progress`, `audit`, then `system.out`, in that order. Ignore `channel`. |
| `burst` | Emit `count` copies, default `"1"`, to `channel`. Count is an integer string from 0 through 128. Zero emits nothing and does not validate the channel or payload size. Location arguments are still validated. |
| `publishMutable` | Emit a payload, then change the original label to `"changed"` and nested stageId to `"changed-stage"`, and emit again. The first event retains its original deep-copied payload. |
| `publishThenFail` | Emit once, then fail the stage. No result is committed. |
| `declareOnly` | Declare required durable `required.empty` and optional durable `optional.empty`; emit nothing. Ignore domain arguments. |
| `invalidEvent` | Deliberately reject a `records` payload: `reason` is `missing` (default), `type`, `scalar`, `undefined`, `nonfinite`, `cycle` or `bigint`. Unknown reasons also fail. These fixed probes cover required fields, immediate field types and lossless JSON serialization, not general JSON Schema validation. |

Except for `declareOnly`, invoking a channel function declares `records` and `audit` as durable and `progress` as transient. Declarations occur on invocation, including a zero burst; an unused empty interval declares nothing. First declaration wins. `system.out` is initially declared durable and `diagnostics` transient. A channel emitted by `publish` or `burst` must already be declared. ECMAScript whitespace is trimmed from channel names; names are case-sensitive. Undeclared names, `render` and reserved `system.*` names other than `system.out` fail.

Normal payloads are exactly:

```json
{"text":"<stage input>","label":"","meta":{"id":"user-id","runId":"user-run","duration":"user-duration","nested":{"stageId":"user-stage"}}}
```

Arguments `label`, `id`, `runId`, `duration` and `stageId` replace the corresponding string values, including with empty strings. These payload fields are user data and remain exact in every comparison; they are never scrubbed as operational metadata. No Unicode normalization occurs.

Location uses `mode="line"` or `"row"` (default line), `rowId` (default `"row"`, empty allowed), `row` (default `"1"`, integer 1–1,000,000) and `rowSet` (default `"profile"`, also used for an empty argument). Integer strings have no sign, leading zeros except `"0"`, decimal point, exponent or whitespace. A nonempty `kind` overrides the default: `annotation` for `system.out`, `diagnostic` for `diagnostics`, otherwise `event`. Repeated row IDs remain separate events; descriptor keys do not deduplicate them.

## Events and snapshots

Every successful emission consumes the next global sequence number starting at 1, including transient events. Each event records the committed invocation's one-based ordinal. Stage execution order and block/interval inheritance follow the scoped text contract; events capture the input at the time that function is invoked, before later text transforms.

All fixed custom descriptors use object payloads, `application/json`, schemaRef `textabana.channel-core/payload-v1`, snapshot delivery, global-sequence ordering, key `["payload.label"]`, internal sensitivity and `declared: true`. Only `required.empty` is required. Their inline schema requires an object with `text`, `label` and `meta`; the first two must be strings and `meta` an object. Additional properties are allowed. Built-in `system.out` uses schemaRef `textabana.system.out/v2`, key `["target.anchorRef"]` and no inline schema. Built-in diagnostics uses `textabana.diagnostic/v1`, an empty key and no inline schema.

Durable snapshots contain each emitted durable channel and each declared required durable channel, including an empty event list. Optional empty and all transient channels are excluded. Global sequence gaps are preserved when transient events are absent from snapshots. The report compares the full normalized descriptor of every included snapshot and its ordered global sequence references.

Successful projection extends the scoped result with:

```text
events: [{sequence, channel, kind, phase: "run", state: "committed",
          payload, target: {mode, rowId, row, rowSet}, stage}]
snapshots: {channelName: {descriptor, events: [globalSequenceNumbers]}}
```

The bridge checks raw event identity uniqueness, sequence continuity, channel partitioning, target aliases and the link to the actual committed invocation before projection. It also checks that event anchor references resolve and source maps connect each event to its anchor and generating activity. Snapshot events must exactly equal the corresponding raw durable events before normalization. These are JavaScript host integrity checks; Python does not independently reproduce source positions, anchors or full provenance graphs. Generated IDs, timestamps, line offsets and source-map positions are outside the cross-runtime projection.

## Limits and failure

Existing limits remain: 65,536 UTF-8 source bytes, 32 nested blocks, 32 active intervals, 128 authored stages, 128 expanded invocations and 262,144 UTF-8 render bytes. Expanded invocation count is checked before execution. New limits are 64 emitted events across all channels and 16,384 UTF-8 bytes of compact JSON for each normal payload. The fixed module checks payload size before calling the channel API, which then validates channel/payload and charges the event budget. The intentionally invalid serialization probes fail as stages without normal payload-size checking. Source/admission, stage and limit rejection retain the previous error classes; multiple independent errors are only claimed to have the frozen fixtures' specified precedence.

Any failure yields empty output, no committed stages, no events and no snapshots. Earlier successful emissions, required declarations and render are rolled back together. Before normalizing a Worker error, the bridge verifies no commit, output, channels, descriptors, snapshots, anchors, source maps or committed provenance activities remain. Attempted execution trace entries may remain as diagnostics and are not represented as committed invocations.

## Frozen suite and claim

The 80 fixtures contain explicit expected render, error, ordered invocation ledger, event payloads/order/targets and durable snapshots. Each runtime must match the expectation independently. The manifest binds count, fixtures and all three specifications; the report binds original source digests, the three Python files, fixed modules, runner/admission code, parser, generated Worker, host bridges and lockfile. Implementation bytes must remain unchanged during the run.

Only a fully passing suite claims independent implementations for this bounded profile. This means separately implemented parsing/lowering/evaluation/channel state, not independent authorship or third-party certification. `canonicalRuntime`, `semanticArtifactEquivalence` and `fullProfileConformance` remain false. A report describes its recorded source snapshot, not the currently edited Playground document or live CI status.

Remaining work includes arbitrary module loading/ABI, broader channel/schema policies, exact source-map and provenance equivalence, caches, concurrency, editor changes, additional scope policies, full production profiles, configured release signing and a published registry service. Wave 5 remains active.
