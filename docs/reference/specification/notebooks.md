# Jupyter and notebooks

Textabana models notebook interoperability as a complete, versioned snapshot with stable cell identities. The kernel produces canonical events; a pure post-commit adapter creates a host-neutral JSON view. Jupyter, nbformat and kernels are separate transport and host layers.

**Executable Notebook Interop subset**

`notebook/1` supports whole snapshots, explicit cell ids, three actual MIME representations, source digests, stale comparisons and the profiles `fresh`, `session` and `attached`. Only `fresh` has an executable structural projection. Jupyter Messaging, nbformat round trips, session/attached kernel execution and Comms/widgets are explicitly unsupported.

### Exact notebook model executed in the playground

| Channel | Payload | Semantics |
| --- | --- | --- |
| `notebook.snapshot` | notebookId, snapshotId, profile, wholeSnapshot, cellIds | Exactly one complete snapshot; the cell list follows authored presentation order. |
| `notebook.cells` | cellId, title, source, sourceDigest, metadata | One entry per stable cell with CellSelector, Anchor and preserved authored metadata. |
| `notebook.outputs` | outputDigest, sourceDigest, status, mimeBundle | Output is bound to the same cell's source and provenance activity; current output is fresh. |
| `notebook.state` | requestedProfile, executionSupport, kernelState, limitations | Make the profile and actual support explicit without fabricating kernel state. |

### Whole snapshot with lightweight cell markers

Executable fixture · notebook-snapshot · textabana

```textabana
>>>>! include "./modules/notebook.js"

>>>> notebook_snapshot profile="fresh" notebook_id="voyage-analysis"
## Cell: Source overview {#cell-source owner="research"}
Aurora lämnade Göteborg den 4 maj.

## Cell: Route summary {#cell-route audience="operations"}
**Sista kända rutt:** Göteborg → Guayaquil.

## Cell: Confidence {#cell-confidence kind="metric"}
{"confidence": 0.82, "status": "candidate"}
<<<< notebook_snapshot
```

### Host-neutral notebook projection

Executable lab envelope · application/json · json

```json
{
  "schema": "textabana.notebook-projection/lab-v1",
  "notebook": { "notebookId": "voyage-analysis", "snapshotId": "snapshot:...", "stateProfile": "fresh", "wholeSnapshot": true },
  "cells": [{
    "cellId": "cell-source",
    "sourceDigest": "fnv1a:...",
    "mimeBundle": { "text/plain": "...", "text/markdown": "...", "application/vnd.textabana.result+json": {} },
    "output": { "outputSourceDigest": "fnv1a:...", "stale": false, "sourceMapRef": "mapping:..." }
  }]
}
```

**fresh**

New structural snapshot and projection without hidden or persistent kernel state.

**session**

The profile name can be negotiated, but execution against an external session is contract-only.

**attached**

A host may declare an external kernel, but the playground neither verifies nor executes it.

**Future Jupyter host**

Messaging, nbformat, Comms and widgets require their own verified adapters.

<a id="JUPYTER-001"></a>

> **JUPYTER-001** A standard `execute_request` contains code but neither a cell id nor the entire notebook. Cross-cell semantics therefore require the host to send a complete, versioned notebook snapshot with stable `cell.id`. The playground rejects partial snapshots.

<a id="JUPYTER-002"></a>

> **JUPYTER-002** The MIME alternatives `text/plain`, `text/markdown` and `application/vnd.textabana.result+json` represent the same logical cell value. Separate Textabana channels cannot be modeled as MIME alternatives.

<a id="JUPYTER-003"></a>

> **JUPYTER-003** Jupyter streams and displays are to be mapped to namespaced adapter channels such as `host.jupyter.stdout`, `host.jupyter.stderr` and `host.jupyter.display`, never to `system.out` as process stdout.

<a id="JUPYTER-004"></a>

> **JUPYTER-004** A notebook adapter MUST preserve unknown authored metadata, reserve `metadata.textabana` for adapter fields and mark each output with the cell's source digest.

<a id="JUPYTER-005"></a>

> **JUPYTER-005** Cell order is presentation order and MUST NOT become implicit execution or kernel state. The notebook's requested state profile is separate from the core `Result.run.profile`.

<a id="JUPYTER-006"></a>

> **JUPYTER-006** An older output is stale exactly when `previousOutput.sourceDigest !== currentCell.sourceDigest`. A stale output MAY be shown as revision metadata but never as current output.

<a id="JUPYTER-007"></a>

> **JUPYTER-007** Every cell MUST have an explicit, unique identity. A missing or duplicate cell id stops the run atomically before channel commit.
