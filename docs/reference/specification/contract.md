# Semantic contract

The following invariants form the language's foundation. An optimization, adapter or future syntax must not violate them.

1. The source snapshot is immutable and versioned.
2. Control syntax does not appear in the rendering unless explicitly escaped as literal text.
3. Blocks are balanced trees; intervals are ordered sets of active scopes, not an artificial tree.
4. The same deterministic inputs and plan produce the same value, event content and event order.
5. The default is `block output → ambient interval input`, exactly once at the block boundary.
6. An explicit `@intervals` stage disables implicit interval injection.
7. `return` affects the primary pipeline; `emit` affects only a side channel.
8. Inheritance covers the entire function call: both its return value and emissions.
9. Channels are append-only within a run and are never implicitly read by the same pipeline.
10. Global `sequence` is unique, monotonic and derived from the plan, never from the wall clock.
11. Commit is atomic. `tentative` is not the same as durable output.
12. Persistent positions are bound to the document version and Anchor; row and line are projections.
13. `mapping=exact` requires a verifiable output–input relationship.
14. Manifests, digests and capabilities are resolved before module code executes.
15. Large or binary results are referenced as artifacts rather than embedded in the control plane.
16. Secrets are never serialized in source, IR, events, results or logs.
17. The entire source snapshot is parsed before module initialization. Recovery is visible to the editor but never executable.
