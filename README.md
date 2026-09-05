# Textabana

Textabana gör läsbar text till en körbar, positionsmedveten och flerkanalig semantisk källa. Samma dokument kan producera en primär render, valfritt många namngivna kanaler samt metadata som förblir knuten till källans positioner.

Den publicerade specifikationen och playgrounden finns på [textpipe-editor.leo-salmonsson.chatgpt.site](https://textpipe-editor.leo-salmonsson.chatgpt.site).

## Playground Labs

Åtta interaktiva labs visar samma källa och valda run från olika semantiska perspektiv:

- **Language & Scope** — block, öppna intervall, inheritance, scope-segment och faktisk exekveringsordning.
- **Editor Kernel** — documentsession, revisionguardade ChangeSets, channel subscriptions, metadata-delta och anchor continuity.
- **Editor Metadata** — `system.out`, row/line, Anchor, SourceMap och jämförelse mellan revisioner.
- **Channel & Result** — deklarerade kanaldeskriptorer, strict validation, global eventtimeline och atomiskt result envelope.
- **Data & Lineage** — typade dataset/schema-events, stabila records, deterministisk inner join, cell-/record-lineage, derived aggregation och en source-bound JSON-tabellprojektion.
- **Notebook Interop** — whole snapshots, stabila cell-id:n, tre MIME-representationer, explicit stateprofil och digest-baserad stale detection.
- **Annotation & Review** — immutable modellkandidater, modell-/prompt-/inputdigests, confidence method, append-only accept/reject/supersede och resolverbara W3C-/Label Studio-projektioner.
- **Conformance** — profilval, stage gates, härledda subset-anspråk, versionssatt normalized golden snapshot, strukturell diff, exakta negativa cases och kooperativ cancellation.

Channel & Result innehåller även en adapterinspektör. Den visar det körbara kontraktet efter core commit utan att starta en separat run.

Fixturepaketet innehåller `scope-torture`, `editor-revision`, `editor-kernel-revisions`, `channel-fanout`, `base64-inverse`, `failed-run`, `data-join`, `notebook-snapshot`, `annotation-review`, `conformance-golden`, två ytterligare negativa cases och `cancellation-probe`.

## Embedded Editor Kernel

Textabana kan bäddas in som en dokumentkärna bakom editorer. Workern implementerar det versionssatta protokollet `textabana.editor-kernel/lab-v1`: hosten öppnar ett dokument, skickar atomiska Unicode-code-point-ChangeSets mot en explicit basrevision, prenumererar på kanaler och kör exakt valt snapshot. En lyckad run levererar ett separat `textabana.metadata-delta/lab-v1` med `added`, `removed`, `changed`, `moved` och `unchanged`, plus redovisad anchor continuity.

Delta matchas med stabil channel-/domänidentitet, aldrig med run-lokala event-id:n. Failed och cancelled run lämnar föregående committade deltabaslinje orörd. Stabilt anchor-id har företräde; annars får en unik TextQuote + origin relinkas. Flera kandidater blir `ambiguous` och ingen kandidat blir `orphaned` — kärnan gissar inte.

Subseten ger inkrementell dokumenttransport och inkrementell metadataleverans. Den gör fortfarande full dokumentparse, bygger planen från den fulla execution trace och kör en fresh full run. Inkrementell parser/exekvering, persistent historik, OT/CRDT, generell strukturell re-anchor samt färdiga CodeMirror-/Monaco-/LSP-paket ligger i senare vågor i [Editor Kernel-planen](./EDITOR_KERNEL_PLAN.md).

## Conformance-grind

Varje worker-run producerar en separat `textabana.conformance-report/lab-v1`. Rapporten binder evidens till samma semantiska `TextabanaResult`, skiljer deklarerad support från observerat kravutfall och gör endast en tillämplig playground-subset `claimable` när samtliga krav passerar. Domänprofiler utan relevanta kanaler är `not-run`; `ml-lineage/1` förblir `contract-only` och kan aldrig bli claimable.

`conformance-golden` jämför source, moduldigests, IR, plan, Result, Anchor/SourceMap, capabilities och adapterprojektioner mot ett incheckat structural digest. Transport-id:n och mätt duration exkluderas genom en publicerad normaliseringspolicy. Digesten är uttryckligen icke-kryptografisk `fnv1a-lab` och snapshoten är `canonical=false`.

Negativa cases passerar endast när både terminalstatus och exakt diagnostikkod matchar och den durable committen är tom. Cancellation är ett eget `cancelled`-tillstånd med atomisk rollback, men subseten är kooperativ vid async- och stage-gränser: den preempterar inte synkrona CPU-loopar och lovar ingen rollback av externa sidoeffekter. Webbrapporten känner inte CI-status och är inte full profilkonformitet.

## Adaptergrund

Sprint 1 i [implementationsplanen](./IMPLEMENTATION_PLAN.md) implementerar `AdapterManifest`, `AdapterProjection` och `AdapterRun`. Alla adaptrar läser samma immutable `TextabanaResult`; deras output ligger i separata projektioner med explicit source-result-bindning, fidelity report, referenser och diagnostik.

`org.textabana.result-summary` är en körbar, deterministisk referensadapter. `org.textabana.data-table` är en körbar `data/1` playground-subset. `org.textabana.notebook` producerar en host-neutral, source-bound JSON-projektion från fyra kanoniska notebookkanaler. `org.textabana.annotation-review` projicerar fyra kanoniska annotationskanaler till en W3C Web Annotation `AnnotationPage` och en testad Label Studio task/import-subset.

Data-subseten producerar inga låtsasartefakter: Arrow IPC, Parquet, DuckDB, beständiga `ArtifactRef`-outputs och OpenLineage-export är uttryckligen `unsupported` tills verkliga bytes, digests och transportsamband implementeras.

Notebook-subseten gör inga falska Jupyteranspråk. Jupyter Messaging, nbformat-roundtrip, session/attached kernelkörning samt Comms/widgets är uttryckligen `unsupported`. `fresh` är en körbar strukturell projektion; `session` och `attached` är explicita profiltokens utan simulerad kernelstate.

Annotation-subseten gör inga falska modell- eller verktygsanspråk. Den kör ingen AI-modell och har ingen persistent review store. `ml-lineage/1`, W3C PROV, OpenLineage, MLflow, OpenTelemetry, full Label Studio API-/projektroundtrip samt doccano/Prodigy/brat är fortsatt `contract-only` eller `unsupported`. Alla labdigests är uttryckligen `fnv1a-lab`, inte kryptografisk SHA-256.

## Status

Dokumentationen är **Textabana Language & Interop draft 0.6**. Webbmotorn implementerar uttryckligen avgränsade playground-subsets av `language-core/0.4`, `runtime-json/1`, `editor/1`, `editor-kernel/1`, `adapter-contract/1`, `data/1`, `notebook/1` och `annotation/1`; den gör ännu inte anspråk på full profilkonformitet. UI:t redovisar funktioner som ännu saknas som `contract-only`, `unsupported` eller `planned`.

## Utveckling

Krav: Node.js `>=22.13.0`.

```bash
npm ci
npm test
```

`npm test` bygger siten och kör headless-kontrakt för runtime, fixtures, dokumentation och renderad output.

Viktiga filer:

- `app/specification.tsx` — språk- och interoperabilitetsspecifikation.
- `app/page.tsx` — delad editor, fixtures och playgroundskal.
- `app/playground-labs.tsx` — de åtta resultat- och editorprojektionerna.
- `public/runtime-worker.js` — parser, modulruntime, kanaler, trace, resultatmodell och post-commit adapterregister.
- `IMPLEMENTATION_PLAN.md` — versionspolicy, sprintar och acceptansgrindar.
- `EDITOR_KERNEL_PLAN.md` — nästa fem vågor från dokumentprotokoll till produktionskonformitet.
- `tests/` — regressioner och fixturekontrakt.
