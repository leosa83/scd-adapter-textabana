# Jupyter and notebooks

Textabana modellerar notebookinteroperabilitet som en komplett, versionerad snapshot med stabila cellidentiteter. Kärnan producerar kanoniska events; en ren post-commit-adapter skapar en host-neutral JSON-vy. Jupyter, nbformat och kernels är separata transport- och hostlager.

**Körbar Notebook Interop-subset**

`notebook/1` kör whole-snapshot, explicita cell-id:n, tre verkliga MIME-representationer, source digests, stale-jämförelse samt profilerna `fresh`, `session` och `attached`. Endast `fresh` har körbar strukturell projektion. Jupyter Messaging, nbformat-roundtrip, session/attached kernelkörning och Comms/widgets är uttryckligen unsupported.

### Exakt exekverad notebookmodell i playgrounden

| Kanal | Payload | Semantik |
| --- | --- | --- |
| `notebook.snapshot` | notebookId, snapshotId, profile, wholeSnapshot, cellIds | Exakt en komplett snapshot; cellistan följer författad presentationsordning. |
| `notebook.cells` | cellId, title, source, sourceDigest, metadata | En post per stabil cell med CellSelector, Anchor och bevarad författad metadata. |
| `notebook.outputs` | outputDigest, sourceDigest, status, mimeBundle | Output binds till samma cells källa och provenanceaktivitet; aktuell output är fresh. |
| `notebook.state` | requestedProfile, executionSupport, kernelState, limitations | Gör profil och faktisk support explicit utan att fabricera kernelstate. |

### Whole snapshot med lätta cellmarkörer

Körbar fixture · notebook-snapshot · textabana

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

### Host-neutral notebookprojektion

Körbar lab-envelope · application/json · json

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

Ny strukturell snapshot och projektion utan dold eller beständig kernelstate.

**session**

Profilnamnet kan förhandlas, men exekvering mot en extern session är contract-only.

**attached**

En host får deklarera extern kernel, men playgrounden verifierar eller kör den inte.

**Framtida Jupyter-host**

Messaging, nbformat, Comms och widgets kräver egna verifierade adaptrar.

<a id="JUPYTER-001"></a>

> **JUPYTER-001** Standard `execute_request` innehåller kod men inte cell-id eller hela notebooken. Cross-cell-semantik kräver därför att hosten skickar en hel, versionerad notebook snapshot med stabila `cell.id`. Playgrounden avvisar partial snapshots.

<a id="JUPYTER-002"></a>

> **JUPYTER-002** MIME-alternativen `text/plain`, `text/markdown` och `application/vnd.textabana.result+json` representerar samma logiska cellvärde. Separata Textabanakanaler får inte modelleras som MIME-alternativ.

<a id="JUPYTER-003"></a>

> **JUPYTER-003** Jupyter streams och displays ska mappas till namespaced adapterkanaler som `host.jupyter.stdout`, `host.jupyter.stderr` och `host.jupyter.display` — aldrig till `system.out` som process-stdout.

<a id="JUPYTER-004"></a>

> **JUPYTER-004** En notebookadapter MÅSTE bevara okänd författad metadata, reservera `metadata.textabana` för adapterfält och märka varje output med cells source digest.

<a id="JUPYTER-005"></a>

> **JUPYTER-005** Cellordning är presentationsordning och FÅR inte bli implicit exekverings- eller kernelstate. Notebookens begärda stateprofil är skild från kärnans `Result.run.profile`.

<a id="JUPYTER-006"></a>

> **JUPYTER-006** En äldre output är stale exakt när `previousOutput.sourceDigest !== currentCell.sourceDigest`. En stale output FÅR visas som revisionsmetadata men aldrig som aktuell output.

<a id="JUPYTER-007"></a>

> **JUPYTER-007** Varje cell MÅSTE ha explicit, unik identitet. Saknat eller duplicerat cell-id stoppar körningen atomiskt före channel commit.
