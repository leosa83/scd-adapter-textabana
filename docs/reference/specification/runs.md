# Runs and transactions

### Execution profiles

| Profil | State | Reproducerbarhet |
| --- | --- | --- |
| `fresh` | Ny isolerad modulinstans per run. | Default och högst reproducerbarhet. |
| `session` | Namngivet state återanvänds; före/efter-digest registreras. | Kontrollerad interaktivitet. |
| `attached` | Kör i befintlig kernel/process; host identity och state registreras. | Lägst reproducerbarhet, hög integration. |

queued*→*compiling*→*ready*→*running*→*committing*→***succeeded**Terminaler: failed · cancelled

**tentative**

Progress, logg och livepreview får streamas medan run pågår. Konsumenter måste kunna dra tillbaka dem.

**committed**

Endast en lyckad commit gör render och durable channel snapshots till aktuell revision.

<a id="RUN-001"></a>

> **RUN-001** Failed eller cancelled MÅSTE revokera tentative domänoutput. En extern side effect som inte kan rullas tillbaka måste deklareras och redovisas ärligt i proveniens.

<a id="RUN-002"></a>

> **RUN-002** Semantic cache key MÅSTE inkludera stage-lokala source- och IR-beroendedigests samt resolved module identity, hela den ordnade faktiskt initierade modulclosure, funktion-, context-, contract-, exakt typad input-, authored-args-, config-, profile- och environment-digests. Edge-topologi, ordnad merge och observerbar argumentordning MÅSTE påverka den rekursiva beroendeidentiteten. Playgroundens labdigest får inte ensam auktorisera en träff; full key witness MÅSTE också vara exakt lika.

<a id="RUN-003"></a>

> **RUN-003** Nondeterministiska och externa funktioner får inte cacheas utan explicit replay artifact eller dokumenterad policy.

<a id="RUN-004"></a>

> **RUN-004** Backpressure, timeout och cancellation MÅSTE propageras genom runtime och sinks; tyst eventförlust är inte tillåten.

<a id="RUN-005"></a>

> **RUN-005** Cache candidate, cache eligible, lookup, hit och reused MÅSTE rapporteras som skilda tillstånd. En invalidation preview eller matchande statisk nyckel får aldrig ensam redovisas som en träff. Den aktuella Editor Kernel-subseten kräver två exakt lika fresh observationer i skilda committed revisioner före reuse; samma revision främjar inte observationsunderlaget.

<a id="RUN-006"></a>

> **RUN-006** Cacheobservationer och verifieringar MÅSTE skrivas i ett run-lokalt journal och blir synliga atomiskt först när core-resultat, immutable post-commit-projektioner, conformance-gate och aktuell editor-head har accepterats. `observations`/`writes` avser endast committad evidens; försök redovisas separat. Failed, cancelled, stale, gate-rejected eller ersatt session MÅSTE kasta journalen.

<a id="RUN-007"></a>

> **RUN-007** Återanvända stages MÅSTE skapa ny run-kvalificerad provenance och `execution-step/lab-v2` med `functionInvoked=false`; tidigare event-, stage-, invocation- eller activity-id:n får aldrig återspelas. Materialiseringen MÅSTE peka på aktuell cachepost och exakt två unika, resolverbara observationsposter med samma `planNodeRef` och output-digest. Cachetelemetri får inte ändra semantiskt Result-ID eller normalized conformance-golden.

<a id="RUN-008"></a>

> **RUN-008** En concurrent ready-set-batch MÅSTE startas deterministiskt, dräneras med alla terminalutfall och publiceras i planordning. Ett branchfel stoppar ny scheduling. Efter drain har en aktiv terminal control-signal företräde: user cancellation ger `cancelled` och deadline ger `failed`; bland övriga branchfel blir det tidigaste planordnade felet primärdiagnostik.

<a id="RUN-009"></a>

> **RUN-009** Den aktuella runtime-subseten MÅSTE avvisa icke-numeriska policyfält och rapportera requested/effective hosttak, wave/peak concurrency, planerade och resolverade stages, kanalhändelser samt final renderstorlek. Deadline är kooperativ vid runtimegränser. Stage-, event- och renderbrott MÅSTE inträffa före durable commit och får inte beskrivas som generell CPU-/minnesisolering eller synkron preemption.

<a id="RUNTIME-CACHE-PROVENANCE"></a>

> **RUNTIME-CACHE-PROVENANCE** Conformance-grinden MÅSTE avvisa en cachematerialisering om cacheposten eller någon av dess två observationsentiteter saknas, dupliceras eller avviker i `planNodeRef` eller output-digest.
