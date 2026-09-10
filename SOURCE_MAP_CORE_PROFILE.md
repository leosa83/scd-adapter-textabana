# Textabana source map core — independent reference profile v1

Profile `textabana.source-map-core/v1`, version `1.0.0`, extends [channel core](./CHANNEL_CORE_PROFILE.md) with source positions and normalized event/anchor/invocation relationships. The [scoped text](./SCOPED_TEXT_PROFILE.md) and [text core](./TEXT_CORE_PROFILE.md) specifications remain normative for admission, parsing, lowering and the fixed function catalog. All four specifications are pinned by the new manifest. Earlier suites keep their original cases and comparison scope.

## Run and reproduce

```sh
python3 reference/source_map_core.py run examples/source-map-core.md
node cli/textabana.mjs conformance-source-map-core > source-map-core-report.json
```

The independent Python implementation needs Python 3.10+ and four sibling files: `source_map_core.py`, `channel_core.py`, `scoped_text.py` and `text_core.py`. These files parse and lower the original source, evaluate functions and maintain their own channel, position, anchor and mapping state. They use only the standard library and run outside the repository without Node. They consume neither JavaScript parser output nor Worker events. `run` returns JSON and exits nonzero on rejection; `batch` accepts `{sources: [...]}`. Interpreter failures, invalid response JSON and timeouts fail the suite.

JavaScript executes the actual Worker through the shared channel bridge. The bridge prepends one trusted include for the fixed catalog. The compared coordinates always refer to the **original authored source**: subtract the include's physical line count from line numbers and its Unicode code-point length from absolute positions. Compute both offsets from the actual prefix; do not hardcode them. Generated event, anchor and activity IDs are validated as raw references before being replaced by local ordinals.

## Source coordinates

| Field or construct | Meaning |
|---|---|
| Physical line | One-based, split only at LF. CR and U+FEFF remain unsupported by the base profile. U+2028/U+2029 inside literal text do not create physical LF lines. |
| Position | Zero-based Unicode code points, with an exclusive end. The selected whole physical line excludes its terminating LF. Positions are neither UTF-8 bytes nor UTF-16 code units. |
| Stage `declarationLine` | The original line containing the function declaration. All stages in a same-line pipeline share this line; inherited intervals retain their own opening line. |
| Text-buffer source | First through last physical line in the buffer. Interval boundaries, blocks and config declarations flush the preceding buffer. |
| Block source | Opening line + 1 through closing line − 1, clamping end to at least start. This includes nested source markers, independently of the transformed child output. Every block pipeline stage and inherited interval uses this same range. |
| Empty block | Its source range and default target are the closing-marker line. Its rendered input is still empty. |
| Escaped marker or fenced text | Rendering follows the base profile, but anchor selectors always select the original raw source. An escape backslash removed from render remains in the quoted source and its position range. |
| Default event target | The stage execution source's first line. Fixed channel functions expose row identity/number/mode but no custom source line, column or selector arguments. |

The exact quote is the entire selected raw line. Quote prefix is the last **48 Unicode code points** of the previous physical line; suffix is the first 48 code points of the next line. Missing neighbors produce empty strings. Neither quote context includes an LF. These windows preserve whole Unicode scalar values, including astral characters such as emoji. They do not promise whole grapheme clusters: combining marks or a zero-width-joiner sequence may cross the boundary. No Unicode normalization is applied.

For example, `>>>> publish\n<<<< publish` renders an empty string but selects `<<<< publish` at line 2, position 13–25. `>>>> publish\n\n<<<< publish` instead renders LF and selects an empty line at position 13–13.

## Anchor identity and final state

Line-mode events share an anchor when they target the same physical line, regardless of rowId or row number. A row-mode event with an empty rowId uses that same line identity. A row-mode event with a nonempty rowId uses the run's row identity, regardless of physical line or rowSet.

Reusing an identity updates that anchor's selectors, projections and origin to the **last emission**, while preserving its position in the anchor list from first creation. Earlier events retain their original target line and source range but continue to reference the same final anchor. Thus an earlier event's target line can legitimately differ from its final resolved anchor's line. A new anchor is not synthesized separately for every event.

Existing runtime row IDs use a 32-bit lab FNV-1a key over UTF-16 code units. Different authored rowIds that collide must fail the whole run before an ambiguous event can be committed. For example, `costarring` and `liquid` collide; the same `costarring` used twice remains valid. The Python implementation independently calculates this collision check. This is a collision guard within the run, not a conversion of lab IDs into cryptographic or cross-document canonical identities. Event budget is checked before the collision guard.

Transient events participate in anchor creation, overwriting and source maps, even though their channels are excluded from durable snapshots. A later failure removes their tentative state along with all other output. Required empty channels create snapshots but no anchors or source maps.

## Compared projection

The profile includes all channel-core output, exact payloads, committed invocation order and durable snapshots. It adds the following fields:

```text
stages[i]: { ..., declarationLine, source: {startLine, endLine} }
events[i]: { ..., source: {startLine, endLine, mapping: "derived"},
             target: { ..., line, anchor } }
anchors: [{anchor, position: {start, end, unit: "unicode-code-point"},
           quote: {exact, prefix, suffix}, row, rowId, line, stage, function}]
sourceMaps: [{event, anchor, mapping: "derived", stage}]
```

`stage` is the one-based committed invocation ordinal, `event` is the global event sequence, and `anchor` is the one-based ordinal of the actual anchor's first creation. Maps are kept in emission order. Anchor origin identifies its last emitter. Full durable descriptors and snapshot event sequence references retain the channel-core contract. Every payload field, including user-authored values named `stageId`, `runId` or `id`, remains unchanged; only known operational reference fields receive ordinals.

Before projection the JavaScript bridge checks raw event IDs, unique and ordered anchor identities, channel partitioning, source paths/ranges, target aliases, stage declaration/source links, generating activities, source-map references and the anchor's last-emitter relationship. Host and Result anchor/map arrays must agree. Raw position and quote selectors must describe the original authored line and its defined context. Durable snapshot events must exactly equal the corresponding raw events before any normalization. A broken reference or partial result cannot be hidden by constructing a fresh anchor from an event's line.

Generated wrapper identities, document version hashes and the constant trusted module/document names are not cross-runtime output fields. They are checked where needed to establish the bridge's reference relationships. This profile does not compare the complete provenance graph, artifact identity packages, arbitrary caller-defined selectors, custom source mappings, cross-document anchors or editor revision history.

## Errors and limits

The base source, nesting, stage, render, payload and event budgets remain unchanged. Failed results have empty output and no committed stages, events, snapshots, anchors or maps. Error classes remain `syntax`, `unsupported`, `stage` and `limit`; a row-key collision is a stage failure. Actual failed Worker state is checked for empty channels, descriptors, positions, mappings and committed provenance activities before an error is normalized. A failed attempt may remain in diagnostic execution traces without becoming a committed invocation.

Sprint 5.7 corrects two runtime defects without changing valid existing identity strings: quote context now slices by code points, and distinct row identities cannot silently overwrite one another after a hash collision. Earlier source-bound reports are regenerated against these Worker bytes. Existing frozen semantic artifact identities must still pass; changed implementation fingerprints are not evidence of an expanded claim for an older profile.

## Frozen suite and claim

The 70 fixtures contain authored source and explicit expected results, including numeric positions, exact quotes and alias relationships. They cover Unicode and 48-code-point boundaries, empty/blank/nested blocks, literal escapes/fences, interval buffering and order, block inheritance, transformation versus raw source, reused anchors and scope aliases, transient events, row-key collisions and rollback. Some reuse earlier channel scenarios with additional independently authored coordinate expectations; these are 70 checks in the new profile, not 70 wholly new language features. Each runtime must match each expectation independently.

The manifest pins all expected values, count and four specifications. Reports bind original source digests, all four Python files, both fixed modules, both channel/source-map runners, admission code, parser, execution graph, source and generated Worker, host bridges and lockfile. Those implementation bytes must remain unchanged throughout the suite. Missing Python or tampering with only a position expectation cannot produce a passing claim.

Only a fully passing suite claims independent implementations for `textabana.source-map-core/v1`. This means separately implemented parsing, execution and source/anchor state, not independent authorship or third-party certification. `canonicalRuntime`, `semanticArtifactEquivalence` and `fullProfileConformance` remain false. A downloadable report records one source snapshot and does not verify the currently edited Playground document or live CI status.

Wave 5 remains open for arbitrary module loading/ABI, broader channel and selector policies, full provenance equivalence, caches, concurrency, editor history, full production profiles, configured release signing and a published registry service.
