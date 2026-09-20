# Editor Kernel

Editor Kernel är ett host-neutralt control plane runt parser, compiler och runtime. Den körbara workern använder `textabana.editor-kernel/lab-v1`. En editor kan analysera en ofullständig revision utan exekvering, välja exakt giltig revision att köra och prenumerera på committade metadataförändringar.

**Host** — CodeMirror · notebook · pipeline

**Editor Kernel** — open · change · analyze · subscribe · run · cancel

**Atomic delivery** — Result · metadata delta · anchor continuity

### Editor Kernel-kommandon

| Kommando | Inputgrind | Observerbart utfall |
| --- | --- | --- |
| `open` | documentId, path och source | Immutable snapshot på documentRevision 1. |
| `change` | baseRevision och sorterade ChangeSet-ranges | Ny document head eller atomiskt protokollfel. |
| `analyze` | documentId och valfri exakt revision | CST, AST, partial typed IR och diagnostics; inga moduler eller stages körs. |
| `subscribe` | Exakta channel names eller * | Snapshot-then-delta-cursor för vald leverans. |
| `credit` | subscriptionId och positiv credit | Återupptar en bounded post-commit metadataström. |
| `cache-export / cache-import` | Digestbundet host-checkpoint | Explicit cachepersistens och sessionstransport. |
| `run` | Exakt documentRevision | Immutable run snapshot och atomiskt Result. |
| `cancel` | runId | Kooperativ cancellation vid deklarerade gränser. |

En vanlig idempotent `open` får returnera sessions aktuella revision när dokument-id, path och source redan matchar. En avsiktlig reset använder playground-flaggans `replaceSession: true`, skapar en ny session på revision 1 och gör sena svar från den äldre sessionen inaktuella.

### ChangeSet — playground-envelope

Körbar lab-subset · json

```json
{
  "type": "change",
  "schema": "textabana.change-set/lab-v1",
  "requestId": "request:17",
  "documentId": "doc:claims",
  "changeSetId": "change:client:42",
  "baseRevision": 11,
  "coordinateUnit": "unicode-code-point",
  "changes": [{ "range": { "from": 128, "to": 131 }, "insert": "ny" }]
}
```

01**Document version**

Innehållsidentitet. Undo kan återge samma version på en senare monoton documentRevision.

02**Document revision**

Sessionslokal editgeneration. Den påverkar inte semantisk Result-identitet.

03**Published revision**

Senaste head-revision med en lyckad atomisk run; failed och cancelled flyttar den inte.

04**Metadata cursor**

Monoton leveransposition per subscription, separat från event sequence inom en run.

<a id="EDITOR-KERNEL-001"></a>

> **EDITOR-KERNEL-001** Editor Kernel MÅSTE vara ett control plane runt språk och runtime. Det får inte kunna anropas som en dokumentfunktion eller införa dold pipelineordning.

<a id="EDITOR-KERNEL-002"></a>

> **EDITOR-KERNEL-002** Varje accepterad run MÅSTE fånga ett immutable snapshot med exakt `documentId`, `documentRevision` och `documentVersion`. Senare changes får inte ändra detta snapshot.

<a id="EDITOR-KERNEL-003"></a>

> **EDITOR-KERNEL-003** `system.out` och andra channels är semantisk output som kan prenumereras på. De får inte bära `open`, `change` eller annan document lifecycle-semantik.

<a id="DOCUMENT-001"></a>

> **DOCUMENT-001** Snapshot och monoton revision är separata begrepp. En no-op ChangeSet får returnera `unchanged` utan att skapa en revision.

<a id="DOCUMENT-002"></a>

> **DOCUMENT-002** Failed eller cancelled run MÅSTE lämna senast committade metadata-baslinje orörd. Ett historiskt resultat får visas som stale men aldrig som aktuellt för en nyare head.

<a id="DOCUMENT-003"></a>

> **DOCUMENT-003** En host MÅSTE avancera sin protokoll-head från kärnans korrelerade `open`- eller `change`-svar. Optimistiskt antagen revision/version får inte användas som grund för nästa change eller run.

<a id="ANALYZE-001"></a>

> **ANALYZE-001** `analyze` MÅSTE vara read-only, revisionsbundet och fritt från modulinitiering och stage-effekter. Det FÅR returnera partial IR med recovery även när samma snapshot inte kan köras.

<a id="CHANGE-001"></a>

> **CHANGE-001** Alla ranges i en ChangeSet MÅSTE avse samma base snapshot, vara nollbaserade, halvöppna, sorterade och icke-överlappande samt tillämpas atomiskt.

<a id="CHANGE-002"></a>

> **CHANGE-002** Canonical change offsets räknas i Unicode code points. UTF-16-, line/column- eller editor-native-koordinater MÅSTE konverteras av en hostadapter före protokollgränsen; en främmande deklarerad `coordinateUnit` MÅSTE avvisas före mutation.

<a id="CHANGE-003"></a>

> **CHANGE-003** Stale revision eller version, ogiltig range och överlappning MÅSTE ge strukturerat protokollfel utan sourcemutation eller semantisk run.

<a id="SUBSCRIPTION-001"></a>

> **SUBSCRIPTION-001** Ett channelfilter begränsar endast leverans. Det får aldrig ändra core-resultatets channels, exekvering eller adapterfan-out.

<a id="SUBSCRIPTION-002"></a>

> **SUBSCRIPTION-002** Varje delta MÅSTE ange basis, target och cursor. En konsument med annan basis måste resynkronisera i stället för att applicera deltat.

<a id="DELTA-001"></a>

> **DELTA-001** Metadata-delta är en deterministisk post-commit-jämförelse mellan immutable snapshots; det muterar aldrig föregående `TextabanaResult`.

<a id="DELTA-002"></a>

> **DELTA-002** Cross-run matching MÅSTE använda deklarerad channel key eller explicit domänidentitet, aldrig run-lokala `eventId` eller `sequence`. Ounik identitet får inte ge ett falskt `moved` eller `changed`.

<a id="DELTA-003"></a>

> **DELTA-003** `changed` betyder samma stabila identitet med ändrad semantik eller payload; `moved` betyder semantiskt ekvivalent payload med ny fysisk target. Payloadändring har företräde.

<a id="DELTA-004"></a>

> **DELTA-004** Endast succeeded commit får publicera durable `added`, `removed`, `changed` eller `moved`. Failed och cancelled publicerar ett tomt `not-committed`-delta och behåller baslinjen.

<a id="REANCHOR-001"></a>

> **REANCHOR-001** Anchor-records är immutable och versionsbundna. Cross-revision continuity MÅSTE publiceras som en separat transition med metod och utfall; `ambiguous` och `orphaned` förblir olösta.

### Tre oberoende former av inkrementalitet

| Förmåga | Betydelse | Playground |
| --- | --- | --- |
| Inkrementell input | Hosten skickar ChangeSets i stället för att ersätta hela dokumentet. | Implementerat |
| Invalidation preview | Två pre-transform-grafer jämförs till direct, transitive, unchanged, added och removed utan att återanvända output. | Rådgivande lab-subset |
| Inkrementell stage-exekvering | Editor-sessionen kan återanvända verifierad pure-stageoutput och överlappa oberoende säkra async-grenar. | Avgränsad lab-subset |
| Parser-/compilerreuse | Giltiga Lezer-fragment återanvänds efter ChangeSets och en exakt analyserad revision återanvänder sin compiler-snapshot; grafen byggs fortfarande per run. | Avgränsad lab-subset |
| Inkrementell leverans | Hosten får semantiska deltan och kan välja credit-bunden post-commit-streaming. | Implementerat |

**Exakt gräns för den körbara subseten**

Workern håller en in-memory documentsession, applicerar versionguardade Unicode-patchar och erbjuder read-only `analyze` med formell parser och lokal recovery. En exakt analyserad revision återanvänder sin compiler-snapshot; nästa ChangeSet kan återanvända giltiga Lezer-fragment. En deterministisk ready-set-scheduler får överlappa oberoende, snapshotbara effects-free stages asynkront i samma Worker. Cachen kan flyttas explicit som ett digestbundet host-checkpoint och committade metadatadeltan kan streamas med credit-baserad backpressure. Multicore-exekvering, kontinuerlig stage-streaming, OT/CRDT, generell strukturell re-anchor, fullständiga editorintegrationer och LSP-adapter, synkron preemption och hård CPU-/minnessandbox är inte implementerade.
