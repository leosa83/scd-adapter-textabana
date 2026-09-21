# Adapter contract

An adapter is an explicit, versioned post-commit projection of an already produced `TextabanaResult`. It may choose a representation for a host or standard, but cannot mutate the source, core result or its semantic identities.

**Immutable Result** — exact committed input

**Adapter fan-out** — manifest · negotiation · pure projection

**Projection envelopes** — separate · versioned · source-bound

### AdapterManifest — contract before execution

| Field | Semantics | Sprint 1 |
| --- | --- | --- |
| `adapterId / version / profile` | Independent adapter identity and profile claim. | Required and digest-bound. |
| `accepts` | Accepted Result schemas, profiles, channels and artifact kinds. | Negotiated before projection. |
| `produces` | Projection kind, value kind, mediaType and schemaRef. | Exactly one output for the reference adapter. |
| `capabilities` | Required and optional host/runtime capabilities. | A missing required capability produces unsupported. |
| `support` | playground-subset · contract-only · unsupported. | Contract-only can never produce fabricated output. |
| `fidelity` | lossless · selective · lossy and omittedPaths. | Selective output must retain sourceResultRef. |

### AdapterManifest

Executable lab envelope · json

```json
{
  "schema": "textabana.adapter-manifest/lab-v1",
  "adapterId": "org.textabana.result-summary",
  "version": "1.0.0-lab.1",
  "contract": "adapter-contract/1",
  "profile": "adapter-contract/1",
  "support": "playground-subset",
  "phase": "post-commit",
  "execution": "pure",
  "accepts": { "resultSchemas": ["textabana.result/lab-v1"], "profiles": ["runtime-json/1"], "channels": [], "artifactKinds": [] },
  "produces": [{ "projectionKind": "result-summary", "valueKind": "object", "mediaType": "application/json", "schemaRef": "textabana.result-summary/lab-v1" }],
  "capabilities": { "required": ["atomic-success-result"], "optional": ["anchors"] },
  "deterministic": true,
  "fidelity": { "mode": "selective", "requiresSourceResult": true, "omittedPaths": ["render.data"] }
}
```

### AdapterProjection

Executable lab envelope · json

```json
{
  "schema": "textabana.adapter-projection/lab-v1",
  "projectionId": "projection:...",
  "adapterRef": { "adapterId": "org.textabana.result-summary", "version": "1.0.0-lab.1", "manifestDigest": "fnv1a:..." },
  "sourceResultRef": { "resultId": "lab:...", "resultSchema": "textabana.result/lab-v1", "sourceVersion": "fnv1a:..." },
  "status": "succeeded",
  "output": { "projectionKind": "result-summary", "mediaType": "application/json", "schemaRef": "textabana.result-summary/lab-v1", "data": {} },
  "mapping": "derived",
  "fidelity": { "mode": "selective", "requiresSourceResult": true, "omittedPaths": ["render.data"] },
  "references": { "eventRefs": [], "anchorRefs": [], "sourceMapRefs": [], "provenanceRefs": [] },
  "diagnostics": []
}
```

<a id="ADAPTER-001"></a>

> **ADAPTER-001** An adapter MUST declare its id, version, profile, accepted result schemas, produced representations, capability needs and fidelity policy before it runs.

<a id="ADAPTER-002"></a>

> **ADAPTER-002** Every projection MUST reference the exact `source resultId` and manifest digest. The same deterministic input, manifest version and configuration MUST produce the same `projectionId`.

<a id="ADAPTER-003"></a>

> **ADAPTER-003** Adapters read the same immutable Result through independent fan-out. Adapter-to-adapter data flow requires an explicit, acyclic dependency edge; list or UI order is never semantic order.

<a id="ADAPTER-004"></a>

> **ADAPTER-004** Event identity, Anchor, SourceMap, artifact and provenance MUST be preserved by reference or individually reported as losses. An empty loss field is a verifiable assertion.

<a id="ADAPTER-005"></a>

> **ADAPTER-005** An adapter failure MUST NOT change core run status or mutate a committed Result. The failure is returned as adapter diagnostics in the adapter run.

<a id="ADAPTER-006"></a>

> **ADAPTER-006** A contract-only descriptor may be negotiated and inspected but cannot produce simulated output or serve as evidence of profile conformance.

**Adapter foundation in the playground**

`org.textabana.result-summary` and the data, notebook and annotation adapters run after commit as independent, pure projections. The adapter tab shows the manifest, source-result binding, stable projection identity, fidelity and resolvable references. `org.textabana.ml-lineage` remains contract-only and produces no simulated model or observability output.
