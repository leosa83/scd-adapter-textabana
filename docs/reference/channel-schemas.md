# Channel schema policy

`textabana.channel-schema/2020-12-v1` is the executable policy introduced in sprint 5.14A. It is reported as `capabilities.extensions.channelSchemaPolicy`. It uses the repository's locked Ajv 8.20.0 `Ajv2020` implementation, not a second handwritten payload validator. The policy admits a bounded set of JSON Schema 2020-12 features and rejects unsupported keywords rather than silently ignoring them.

This is an implementation contract, not a claim of complete Textabana typed-channel or JSON Schema conformance. The frozen `textabana.channel-core/v1` profile still covers its original fixed descriptors and payload probes, not arbitrary schemas.

## Declaration and emission

Each accepted channel declaration may carry an inline `schema`, either an object or a boolean. Omitting `schema` means no inline payload validation; `schemaRef` is an identifier, not a resolver. This remains true in strict channel mode, including the built-in channels. Strict mode requires a declared descriptor, not an inline schema on every descriptor.

The first declaration wins. Its schema is copied, checked and compiled before the declaring function's transform starts, even if the function emits no events. A later declaration cannot replace that schema. An unused function is not eagerly declared or checked. Invalid channel names retain the existing declaration/emit behavior.

Every schema-bearing channel is validated in both strict and permissive channel modes. Validation precedes event budget consumption, sequence allocation, anchor construction and event append. The published payload is the same detached value that was validated. Validation does not coerce types, apply defaults, remove additional properties or mutate caller-owned data. Payload objects retain their own keys, insertion order, Unicode text and numeric values, including signed zero; there is no Unicode normalization.

| Boundary | Behavior |
|---|---|
| Dialect | An omitted `$schema` means 2020-12. An explicit value must be `https://json-schema.org/draft/2020-12/schema`, including at nested schema positions. |
| Validation | Boolean schemas; `type` including unions; `enum`/`const`; numeric bounds and `multipleOf`; string lengths and `pattern`; object properties, required/dependent rules and additional/unevaluated properties; array items, prefix items, contains, size/uniqueness and unevaluated items; composition, negation and conditionals. |
| References | `$defs`, anchors and fragment-only `$ref`/`$dynamicRef` within the one schema document. Each descriptor has a private Ajv registry. External, cross-channel and cross-run resolution is disabled. No schema is fetched from the network. |
| Annotations | `$comment`, `title`, `description`, `default`, `deprecated`, `readOnly`, `writeOnly` and `examples` are annotations, not payload assertions or mutations. `$id` supplies schema identity/base-URI context, not permission to fetch. |
| Rejected features | Unknown keywords, other dialects, `format`, content vocabulary, custom vocabularies, custom keywords, async validation and legacy/OpenAPI extensions such as `nullable`, `definitions` and `dependencies`. Rejection includes unsupported keywords in unused `$defs`; literal keys inside `const`, `enum` and examples are data, not schema keywords. |
| Schema admission | Plain JSON object/boolean, at most 65,536 canonical UTF-8 bytes and 32 nested subschema levels below the root. Ajv additionally validates keyword value types and strict-schema consistency. |
| Payload admission | The existing canonical JSON checker rejects cycles, non-finite numbers, undefined/functions/symbols/bigints, lone surrogates, non-plain objects, accessors, hidden/symbol properties and sparse/decorated arrays. A separate copy preserves key order and signed zero rather than publishing canonicalized bytes. |

Ajv strict-schema checks are enabled. Strict type-context, required-property-declaration and tuple-completeness lint rules are disabled: valid schemas can require a field without also describing it, use assertions without a redundant `type`, or intentionally accept partial tuples. Schema validation, finite-number checks and own-property handling remain enabled. No format or custom-keyword plugins are registered.

## Failure and compatibility

Malformed or unsupported schemas fail with `TBA-CHANNEL-SCHEMA-LAB`. A payload violation keeps the existing `TBA-TYPE-CHANNEL-LAB` code, with an English message that identifies the failing keyword and instance path. Callers should use codes for control flow, not parse message wording. A failed run publishes no render, channels, descriptors, anchors, source maps or committed provenance, including events emitted by earlier successful stages.

This intentionally tightens the old implementation: schemas whose `enum`, `minimum`, nested properties or references were previously ignored can now reject a payload. Invalid schemas that used to pass unnoticed fail at first declaration. Explicit `schema: false` now rejects every payload; explicit `schema: null` is invalid rather than equivalent to omission. Schema-bearing permissive channels now reject non-JSON values instead of lossily converting them. Removing a constraint or omitting the schema to bypass a failure is not a conformance fix.

Schemas and module code remain trusted inputs. Ajv compiles schemas dynamically in the same execution environment where the existing module loader uses `new Function`. This does not provide a sandbox, a strict-CSP runtime, regex denial-of-service protection, preemptive timeouts or hard memory limits. The separate precompiled semantic-bundle validator still supports its existing no-dynamic-code-generation environment. The Worker build ships the bundled dependencies' original license texts in [runtime-worker.NOTICES.txt](../../public/runtime-worker.NOTICES.txt).

See the [compatibility record](../compatibility-5.14.md), [kernel ownership](../../runtime/README.md) and [standards assessment](../STANDARDS_DIRECTION.md). Upstream behavior is documented in [Ajv strict mode](https://ajv.js.org/strict-mode.html), [Ajv options](https://ajv.js.org/options.html) and [JSON Schema 2020-12](https://json-schema.org/draft/2020-12).

## Evidence

`tests/channel-schema.test.mjs` exercises nested validation, local references, enums, numeric bounds, boolean schemas, union types, 2020-12 tuples, composition, unevaluated properties, malformed/unsupported contracts, registry isolation, snapshots and real Worker rollback. `tests/channel-core.test.mjs` and the frozen semantic/profile suites protect their existing narrower contracts. These local tests do not constitute independent general JSON Schema certification.
