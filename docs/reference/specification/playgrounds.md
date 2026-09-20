# Playground Labs

Language & Scope, Editor Kernel, Editor Metadata, Channel & Result, Data & Lineage, Notebook Interop, Annotation & Review och Conformance använder samma valda källa och run. Language-vyn skiljer Parser, pre-transform Graf och observerat Körspår: partial CST/AST/IR kan visas när compile gate blockerar körning, medan en giltig run visar hela grafen även om exekveringen senare avbryts.

01**Language & Scope Lab**

Lossless CST, AST, typed IR, recovery, source spans, scope-segment, pre-transform DAG, advisory invalidation, scheduler-waves/run-budget, faktisk execution report, planordnat `planNodeRef`-bundet körspår och render.

Live · verified-stage-cache · bounded async branch subset

02**Editor Kernel Lab**

Open document, revisionguardad ChangeSet, captured run snapshot, subscriptionfiltrerat metadata-delta och anchor continuity.

Live · editor-kernel-revisions · editor-kernel/1 subset

03**Editor Metadata Lab**

system.out, metadatagutter, row/line, Anchor och SourceMap i den aktuella revisionen.

Live · editor-revision

04**Channel & Result Lab**

ChannelDescriptors, strict mode, global eventtimeline, snapshots och atomiskt Result JSON.

Live · channel-fanout + failed-run

05**Data & Lineage Lab**

JSON-tabell, schema-events, stabila recordId, deterministisk inner join, derived aggregation och cell-/record-lineage.

Live · data-join · data/1 playground-subset

06**Notebook Interop Lab**

Whole-snapshot, stabila cell-id:n, tre MIME-representationer, explicit state och digest-baserad stale detection.

Live · notebook-snapshot · notebook/1 playground-subset

07**Annotation & AI Review Lab**

Immutable AI-kandidater, confidence method, append-only human review, revisionskedja, Anchor-targets samt W3C- och Label Studio-export.

Live · annotation-review · annotation/1 playground-subset

08**Conformance Lab**

Profilval, capability response, stage gates, normalized golden snapshot, strukturell diff, exakta negativa cases och kooperativ cancellation.

Live · conformance-golden · report/lab-v1

### Gemensamt playgroundkontrakt

<a id="PLAYGROUND-001"></a>

> **PLAYGROUND-001** Alla labs BÖR använda samma lilla dokument, modulmanifest, inputdata och förväntade resultatsnapshot så att relationen mellan vyerna är verifierbar.

<a id="PLAYGROUND-002"></a>

> **PLAYGROUND-002** Varje lab MÅSTE skilja författad källa, kompilerad semantik, runtimeevents och adapterprojektion visuellt.

<a id="PLAYGROUND-003"></a>

> **PLAYGROUND-003** En funktion som UI:t ännu inte implementerar MÅSTE visas som planned/unsupported och får inte simuleras som konformt resultat.

<a id="PLAYGROUND-004"></a>

> **PLAYGROUND-004** Golden fixtures ska kunna exporteras och köras headless i samma conformance suite som UI:t visualiserar.
