# Profiles and versions

Conformance Lab evaluates a selected, versioned case after the core run and adapter fan-out. The report distinguishes declared support from observed test outcomes: only an applicable playground subset whose requirements all pass becomes `claimable` for the current run.

### Conformance profiles

| Profile | Required coverage | Web runtime today |
| --- | --- | --- |
| `language-core/0.4` | Formal parser, lossless CST, typed IR, recovery, blocks, intervals, properties, pipelines, inheritance and cross=error. | Playground subset |
| `runtime-json/1` | IR, Plan, Run, Result, JSON channels and atomic commit. | Playground subset |
| `editor/1` | Anchor, SourceMap, system.out and LSP projection. | Playground subset |
| `editor-kernel/1` | Document lifecycle, revision fencing, channel subscriptions, metadata delta and anchor continuity. | Interactive subset · separate evidence |
| `adapter-contract/1` | Manifest, negotiation, immutable fan-out, fidelity, references and failure isolation. | Playground subset |
| `notebook/1` | Whole snapshot, stable cell ids, MIME bundle, state profiles, stale detection and host-neutral JSON projection; the full profile also includes verified Jupyter transport. | Playground subset |
| `data/1` | Dataset/schema events, record identity, JSON table projection and multi-input lineage; the full profile also includes the data plane and artifacts. | Playground subset |
| `annotation/1` | Immutable candidates, review revisions, supersede chains, resolvable targets and W3C/Label Studio projection. | Playground subset |
| `ml-lineage/1` | AI invocation, PROV, OpenLineage, MLflow and OTel correlation. | Contract-only · not claimable |

### Machine-readable ConformanceReport

| Field | Meaning | Current lab semantics |
| --- | --- | --- |
| `schema / reportId` | Versioned report type and deterministic report identity. | `textabana.conformance-report/lab-v1` |
| `sourceResultRef` | Binds evidence to the exact semantic Result. | Transport run id is excluded from the structural digest. |
| `suite / case` | Suite version, fixture, expected and actual terminal outcome. | Negative cases require both exact status and diagnostic code. |
| `profiles` | Declared support, applicability, requirement outcomes, derived support and claimable. | Domain profiles with no emitted data become not-run; contract-only never becomes claimable. |
| `stages` | Source → IR → Plan → Result → Projection with evidence references. | A negative case makes no positive plan or projection claim. |
| `structuralSnapshot` | Normalized lab snapshot and checked-in golden digest. | FNV-1a-lab is non-cryptographic and canonical=false. |
| `gate` | Combined blocker list derived from failed requirements and stages. | A regression or golden difference removes the run's subset claim. |

### Conformance report · abbreviated example

Executable playground subset · json

```json
{
  "schema": "textabana.conformance-report/lab-v1",
  "suite": { "suiteId": "textabana.playground/interop-0.7", "version": "1.4.0-lab.1" },
  "case": { "caseId": "golden-core-chain", "expectedOutcome": "succeeded", "actualOutcome": "succeeded" },
  "profiles": [{
    "profile": "runtime-json/1", "declaredSupport": "playground-subset",
    "status": "passed", "derivedSupport": "playground-subset", "claimable": true,
    "requirements": [{ "requirementId": "RUNTIME-ATOMIC-TERMINAL", "status": "passed", "evidenceRefs": ["lab:…"] }]
  }],
  "normalization": { "policy": "textabana.structural-snapshot/lab-v1", "ignoredPaths": ["/transport/runId", "/executionTrace/*/duration"] },
  "golden": { "status": "passed", "expectedStructuralDigest": "fnv1a-lab:…", "actualStructuralDigest": "fnv1a-lab:…" },
  "gate": { "status": "passed", "blockingRequirementIds": [] },
  "extensions": { "textabana.playground": { "canonical": false, "fullConformance": false } }
}
```

**Wave 5 · external host suite**

The CLI runs eight shared protocol cases through Worker, TypeScript, CodeMirror, Monaco and Python. The report shows 40 outcomes and binds the suite and kernel to SHA-256. Every host uses the same JavaScript kernel.

[Download the verification report (JSON)](../../../public/conformance/host-report.json)

**Verified in current labs**

Lossless CST, typed IR, incremental Lezer/compiler reuse, typed DAG, verified cache, bounded concurrency, budgets, atomic Result, Anchors/SourceMaps, credit-bound metadata streaming, host cache checkpoints, adapter isolation, TypeScript/Python host clients, CodeMirror/Monaco bindings and SHA-256-locked module packages with explicit capability grants.

**Remaining work for full conformance**

Complete production profiles for IR/Plan/Result, full JSON Schema, transparent distributed caching, cached event replay, multicore stage execution, effectful branch concurrency, continuous stage streaming, persistent document history, structural/fuzzy re-anchoring, an LSP adapter, preemption, hard CPU/memory quotas, external side-effect rollback, persistent artifacts, full polyglot runtimes, Jupyter Messaging and nbformat round trips, and external observability profiles.

### External verification · sprint 5.1

Executable host suite · bash

```bash
npm run conformance:external
node cli/textabana.mjs conformance > report.json
node cli/textabana.mjs digest report.json
node cli/textabana.mjs registry-check PACKAGE_REGISTRY.json
```

The CLI can also sign reports with an owner's Ed25519 key and verify them against a separately trusted public key. The downloadable reports are unsigned. Existing lab ids are retained; sprint 5.2 adds separate source-bound SHA-256 identities for IR, Plan and committed Result.

### Semantic identities · sprint 5.2

Executable artifact profile · bash

```bash
node cli/textabana.mjs identify examples/document.md > identity.json
node cli/textabana.mjs verify-identity identity.json
node cli/textabana.mjs conformance-semantic > semantic-report.json
```

Enable SHA-256 identities in the Playground and open Conformance → Identities to inspect the artifacts. The external profile verifies 28 outcomes against fixed identities, including incremental parsing and actual cache reuse. [Download the semantic profile report (JSON)](../../../public/conformance/semantic-report.json). Integrity verification proves the bundle's internal consistency; complete production profiles, broader runtime comparisons, release signing and a registry service remain unimplemented.

### Executable artifact contract · sprint 5.3

80 contract cases · bash

```bash
node cli/textabana.mjs verify-identity identity.json
node cli/textabana.mjs conformance-contract > contract-report.json
```

The verifier checks JSON structure, checksums, the identity chain, available source bytes and internal references between IR, plan, events, anchors and source maps. Click Verify bundle in the identities view, or download the bundle for the same check in the CLI. The [JSON Schema](../../../public/contracts/semantic-bundle-v1.schema.json) and [contract report](../../../public/conformance/contract-report.json) can be downloaded separately. The 80 frozen cases include 14 valid bundles and 66 expected rejections. A rehashed render change can still form a valid bundle: the verifier does not rerun the modules and does not attest to correct execution.

### Independent text profile · sprint 5.4

70 comparison cases · bash

```bash
python3 reference/text_core.py run examples/text-core.md
node cli/textabana.mjs conformance-text-core > text-core-report.json
```

A standalone Python parser and evaluator execute the same bounded text profile as the JavaScript kernel. The Python version needs neither Node nor the project's JavaScript code. The 70 fixed cases compare exact rendered text, error outcomes and commit status for nested blocks, pipelines, Unicode, resource limits and other cases. [Download the report](../../../public/conformance/text-core-report.json). The claim covers only textabana.text-core/v1; full language semantics, modules, channels, cache and identical IR/Plan/Result artifacts are excluded.

### Independent interval profile · sprint 5.5

80 comparison cases · bash

```bash
python3 reference/scoped_text.py run examples/scoped-text.md
node cli/textabana.mjs conformance-scoped-text > scoped-text-report.json
```

The textabana.scoped-text/v1 profile extends comparison to open intervals, named closes, numeric ordering and blocks that inherit or disable outer intervals. The 80 fixed cases compare both render and the complete order of committed function calls. The call-count limit is checked before execution; invalid scope/block boundaries leave no committed result. [Download the interval report](../../../public/conformance/scoped-text-report.json). Arbitrary modules, alternative crossing policies, cache and full production conformance remain unimplemented.

### Independent channel profile · sprint 5.6

80 comparison cases · bash

```bash
python3 reference/channel_core.py run examples/channel-core.md
node cli/textabana.mjs conformance-channel-core > channel-core-report.json
```

The textabana.channel-core/v1 profile also compares exact payloads, global event order and stored channel results. Transient events retain their sequence positions but are excluded from durable snapshots. The 80 fixed cases verify payload copying, required empty channels, block inheritance and rollback of the entire result on channel or budget errors, among other cases. [Download the channel report](../../../public/conformance/channel-core-report.json). Source positions and full provenance equivalence are excluded from the cross-runtime comparison.

### Independent position profile · sprint 5.7

70 comparison cases · bash

```bash
python3 reference/source_map_core.py run examples/source-map-core.md
node cli/textabana.mjs conformance-source-map-core > source-map-core-report.json
```

The textabana.source-map-core/v1 profile compares where each event belongs in the authored text: declaration lines, source ranges, Unicode positions, quotes and links to anchors and function calls. The 70 fixed cases include empty blocks, intervals, reused row anchors and emoji at quote boundaries. Different row ids with the same internal anchor key are rejected atomically. [Download the position report](../../../public/conformance/source-map-core-report.json). Full provenance graphs, editor history and semantic artifact equivalence remain outside this profile.

### Module contract · sprint 5.8

54 verification cases · bash

```bash
node cli/textabana.mjs conformance-module-gate > module-gate-report.json
```

The module gate verifies digests, locking, grants and unambiguous function declarations. Report counters show whether module startup code ran: invalid declarations stop before loading, while actual export contracts are checked after loading but before transform. [Download the module report](../../../public/conformance/module-gate-report.json). This is a lab gate around the same JavaScript kernel, not independent module execution or a JavaScript sandbox.

### Independent package admission · sprint 5.9

72 comparison cases · bash

```bash
node cli/textabana.mjs conformance-module-admission > module-admission-report.json
```

Python and JavaScript compare 72 decisions about manifests, locking, digests and grants. Python executes no module code. Successful admission checks are reported separately from subsequent export and execution failures; an invalid later package is to stop all startup code. [Download the package comparison](../../../public/conformance/module-admission-report.json). Independence covers package admission, not module execution or sandbox security.

<a id="CONF-001"></a>

> **CONF-001** An implementation MUST publish a machine-readable capability response with exact profile versions, limits, value kinds, runtimes and extensions.

<a id="CONF-002"></a>

> **CONF-002** A profile claim MUST be bound to a versioned suite and verify source → IR → plan → result → projection. Profiles without relevant input MUST be `not-run`, not passed.

<a id="CONF-003"></a>

> **CONF-003** An adapter cannot change Language Core semantics to fit the host's execution model.

<a id="CONF-004"></a>

> **CONF-004** Declared support and verification outcomes MUST be separate. A missing or failed mandatory requirement blocks `claimable` even when the capability catalog says playground-subset.

<a id="CONF-005"></a>

> **CONF-005** `contract-only` and `unsupported` can never be interpreted as a successful implementation claim. A passing no-fabrication requirement verifies only the contract boundary.

<a id="CONF-006"></a>

> **CONF-006** A structural snapshot MUST publish its normalization policy, ignored transport fields, digest algorithm, actual digest and versioned expected digest when a golden baseline exists.

<a id="CONF-007"></a>

> **CONF-007** Negative fixtures MUST run in isolation and require the expected terminal status, exact diagnostic code and atomically empty durable commit. A negative pass can never rewrite the core result as succeeded.

<a id="CONF-008"></a>

> **CONF-008** Cancellation MUST have its own terminal state. The current subset implements cooperative cancellation and cooperative deadlines at runtime boundaries, and reported stage, event and render limits. Credit-controlled metadata streaming after commit is supported. It claims no synchronous preemption, multicore execution, continuous stage streaming, general sink backpressure or queue quota, hard CPU/memory sandbox or rollback of external side effects.
