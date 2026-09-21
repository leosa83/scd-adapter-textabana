# Runs and transactions

### Execution profiles

| Profile | State | Reproducibility |
| --- | --- | --- |
| `fresh` | New isolated module instance per run. | Default and highest reproducibility. |
| `session` | Named state is reused; before/after digests are recorded. | Controlled interactivity. |
| `attached` | Runs in an existing kernel/process; host identity and state are recorded. | Lowest reproducibility, high integration. |

queued → compiling → ready → running → committing → **succeeded**. Other terminal states: failed · cancelled.

**tentative**

Progress, logs and live previews may stream while a run is in progress. Consumers must be able to retract them.

**committed**

Only a successful commit makes render and durable channel snapshots the current revision.

<a id="RUN-001"></a>

> **RUN-001** Failed or cancelled runs MUST revoke tentative domain output. An external side effect that cannot be rolled back must be declared and accurately reported in provenance.

<a id="RUN-002"></a>

> **RUN-002** The semantic cache key MUST include stage-local source and IR dependency digests, resolved module identity, the entire ordered closure of actually initialized modules, and function, context, contract, exactly typed input, authored arguments, config, profile and environment digests. Edge topology, ordered merge and observable argument order MUST affect the recursive dependency identity. The playground's lab digest cannot alone authorize a hit; the full key witness MUST also be exactly equal.

<a id="RUN-003"></a>

> **RUN-003** Nondeterministic and external functions cannot be cached without an explicit replay artifact or documented policy.

<a id="RUN-004"></a>

> **RUN-004** Backpressure, timeout and cancellation MUST propagate through the runtime and sinks; silent event loss is not permitted.

<a id="RUN-005"></a>

> **RUN-005** Cache candidate, cache eligible, lookup, hit and reused MUST be reported as distinct states. An invalidation preview or matching static key can never alone be reported as a hit. The current Editor Kernel subset requires two exactly equal fresh observations in distinct committed revisions before reuse; the same revision does not advance the observation evidence.

<a id="RUN-006"></a>

> **RUN-006** Cache observations and verifications MUST be written to a run-local journal and become visible atomically only after the core result, immutable post-commit projections, conformance gate and current editor head have been accepted. `observations`/`writes` refer only to committed evidence; attempts are reported separately. A failed, cancelled, stale, gate-rejected or replaced session MUST discard the journal.

<a id="RUN-007"></a>

> **RUN-007** Reused stages MUST create new run-qualified provenance and `execution-step/lab-v2` with `functionInvoked=false`; previous event, stage, invocation or activity ids can never be replayed. Materialization MUST point to the current cache entry and exactly two unique, resolvable observation records with the same `planNodeRef` and output digest. Cache telemetry cannot change the semantic Result ID or normalized conformance golden.

<a id="RUN-008"></a>

> **RUN-008** A concurrent ready-set batch MUST start deterministically, be drained with all terminal outcomes and be published in plan order. A branch failure stops new scheduling. After draining, an active terminal control signal takes precedence: user cancellation produces `cancelled` and a deadline produces `failed`; among other branch failures, the earliest error in plan order becomes the primary diagnostic.

<a id="RUN-009"></a>

> **RUN-009** The current runtime subset MUST reject non-numeric policy fields and report requested/effective host limits, wave/peak concurrency, planned and resolved stages, channel events and final render size. Deadlines are cooperative at runtime boundaries. Stage, event and render violations MUST occur before durable commit and cannot be described as general CPU/memory isolation or synchronous preemption.

<a id="RUNTIME-CACHE-PROVENANCE"></a>

> **RUNTIME-CACHE-PROVENANCE** The conformance gate MUST reject cache materialization if the cache entry or either of its two observation entities is missing, duplicated or differs in `planNodeRef` or output digest.
