# Textabana

Textabana gör läsbar text till en körbar, positionsmedveten och flerkanalig semantisk källa. Samma dokument kan producera en primär render, valfritt många namngivna kanaler samt metadata som förblir knuten till källans positioner.

Den publicerade specifikationen och playgrounden finns på [textpipe-editor.leo-salmonsson.chatgpt.site](https://textpipe-editor.leo-salmonsson.chatgpt.site).

## Playground Labs

Åtta interaktiva labs visar samma källa och valda run från olika semantiska perspektiv:

- **Language & Scope** — lossless CST, AST, typed IR, recovery, Unicode-spans, block, öppna intervall, pre-execution-graf, invalidation preview och separat observerat körspår.
- **Editor Kernel** — documentsession, revisionguardade ChangeSets, channel subscriptions, metadata-delta och anchor continuity.
- **Editor Metadata** — `system.out`, row/line, Anchor, SourceMap och jämförelse mellan revisioner.
- **Channel & Result** — deklarerade kanaldeskriptorer, strict validation, global eventtimeline och atomiskt result envelope.
- **Data & Lineage** — typade dataset/schema-events, stabila records, deterministisk inner join, cell-/record-lineage, derived aggregation och en source-bound JSON-tabellprojektion.
- **Notebook Interop** — whole snapshots, stabila cell-id:n, tre MIME-representationer, explicit stateprofil och digest-baserad stale detection.
- **Annotation & Review** — immutable modellkandidater, modell-/prompt-/inputdigests, confidence method, append-only accept/reject/supersede och resolverbara W3C-/Label Studio-projektioner.
- **Conformance** — profilval, stage gates, härledda subset-anspråk, versionssatt normalized golden snapshot, strukturell diff, exakta negativa cases och kooperativ cancellation.

Channel & Result innehåller även en adapterinspektör. Den visar det körbara kontraktet efter core commit utan att starta en separat run.

Fixturepaketet innehåller bland annat `parser-recovery`, `scope-torture`, `editor-revision`, `editor-kernel-revisions`, `channel-fanout`, `base64-inverse`, `failed-run`, `data-join`, `notebook-snapshot`, `annotation-review`, `conformance-golden`, två ytterligare negativa cases och `cancellation-probe`.

## Embedded Editor Kernel

Textabana kan bäddas in som en dokumentkärna bakom editorer. Workern implementerar det versionssatta protokollet `textabana.editor-kernel/lab-v1`: hosten öppnar ett dokument, skickar atomiska Unicode-code-point-ChangeSets mot en explicit basrevision, kör read-only `analyze`, prenumererar på kanaler och kör exakt valt snapshot. `analyze` returnerar CST, AST, partial typed IR och recovery utan att initiera moduler eller exekvera stages. Hosten avancerar sin head först från kärnans korrelerade acknowledgement, aldrig från en optimistiskt antagen revision.

Delta matchas med stabil channel-/domänidentitet, aldrig med run-lokala event-id:n. Failed och cancelled run lämnar föregående committade deltabaslinje orörd. Stabilt anchor-id har företräde; annars får en unik TextQuote + origin relinkas. Flera kandidater blir `ambiguous` och ingen kandidat blir `orphaned` — kärnan gissar inte.

Subseten ger inkrementell dokumenttransport och inkrementell metadataleverans. Den använder en formell Lezer-parser och `textabana.ir/lab-v2`. Våg 3 har nu börjat med en planning-only `textabana.execution-plan/lab-v2`: efter modulinitiering men före första transform byggs en typed DAG som själv styr den sekventiella körningen. En advisory invalidation preview kan jämföra mot senaste lyckade editorbaslinje. Varje `analyze`/`run` gör fortfarande en full dokumentparse, alla stages körs fresh och cache reads, writes, hits samt reuse är noll. Inkrementell parseråteranvändning, stageoutput-cache och selektiv eller parallell exekvering återstår i [Editor Kernel-planen](./EDITOR_KERNEL_PLAN.md).

## Parser och typed IR

Dokumentet går genom exakt en auktoritativ kedja: `source → Lezer CST → Textabana AST → typed IR → compile gate`. Include-resolution, config, Language Lab och runtime läser samma resultat. Error-level recovery ger partial editorstruktur men blockerar modulinitiering, plan och domänexekvering. Fenced code och `\>>>>`/`\<<<<` är literal syntax; funktionsoutput reparsas aldrig. Alla publika spans använder halvöppna Unicode-code-point-offsets. Det körbara grammatikkontraktet, samtliga implementerade recoveryfamiljer, typed node-unionen och Lezer-beslutet finns i [parserkontraktet](./TEXTABANA_PARSER.md).

Ett giltigt snapshot får `textabana.execution-plan/lab-v2` och `textabana.execution-graph/lab-v1` efter att include-moduler har initierats men innan någon transform anropas. Source-, stage-, merge- och rendernoder binds med typed edges och deterministisk topologisk ordning. Observerad `executionTrace` är en separat artefakt vars poster refererar grafens stage-noder via `planNodeRef`; även ett senare misslyckat stage lämnar därför resten av den förkompilerade grafen inspekterbar.

Varje stage publicerar ett planning-only cache-recept med stage-lokala source- och IR-digests samt resolved module identity, module-, input-, args-, config-, profile- och environment-komponenter. Exakt typed input-digest materialiseras först vid anropet och skiljer bland annat whitespace och värdetyper. `behavior` beskriver mapping och används aldrig som puritysignal: legacyfunktioner utan explicit `state`, `determinism` och `effects` är `unknown` och icke-cachebara. En deklarerad cachekandidat är fortfarande varken verifierat pure, en cache hit eller reuse, och playgrounden återanvänder ännu ingenting.

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

Dokumentationen är **Textabana Language & Interop draft 0.7 med Våg 3 lab-addendum**. Webbmotorn implementerar `textabana.parser/lab-v1`, `textabana.cst/lab-v1`, `textabana.ast/lab-v1`, `textabana.ir/lab-v2`, `textabana.execution-plan/lab-v2`, `textabana.execution-graph/lab-v1` och `textabana.invalidation-preview/lab-v1` samt uttryckligen avgränsade playground-subsets av `language-core/0.4`, `runtime-json/1`, `editor/1`, `editor-kernel/1`, `adapter-contract/1`, `data/1`, `notebook/1` och `annotation/1`; den gör ännu inte anspråk på full profilkonformitet eller inkrementell exekvering.

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
- `runtime/textabana.grammar` — versionssatt Lezer-grammatik för den radankrade syntaxytan.
- `runtime/parser.js` — CST → AST → typed IR, Unicode-spans, diagnostics och recovery.
- `runtime/worker-entry.js` — modulruntime, exekvering, kanaler, trace, resultatmodell och adapterregister.
- `public/runtime-worker.js` — deterministiskt genererad klassisk Worker-bundle som UI och headless-test kör.
- `TEXTABANA_PARSER.md` — formell grammatik, lagergränser, recoverymatris och parserarkitekturbeslut.
- `IMPLEMENTATION_PLAN.md` — versionspolicy, sprintar och acceptansgrindar.
- `EDITOR_KERNEL_PLAN.md` — nästa fem vågor från dokumentprotokoll till produktionskonformitet.
- `tests/` — regressioner och fixturekontrakt.
