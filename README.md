# Textabana

Textabana gör läsbar text till en körbar, positionsmedveten och flerkanalig semantisk källa. Samma dokument kan producera en primär render, valfritt många namngivna kanaler samt metadata som förblir knuten till källans positioner.

Den publicerade specifikationen och playgrounden finns på [textpipe-editor.leo-salmonsson.chatgpt.site](https://textpipe-editor.leo-salmonsson.chatgpt.site).

## Playground Labs

Åtta interaktiva labs visar samma källa och valda run från olika semantiska perspektiv:

- **Language & Scope** — lossless CST, AST, typed IR, recovery, Unicode-spans, block, öppna intervall, pre-execution-graf, rådgivande invalidation, faktisk execution report och separat observerat körspår.
- **Editor Kernel** — documentsession, revisionguardade ChangeSets, channel subscriptions, metadata-delta och anchor continuity.
- **Wave 3 closure** — inkrementell Lezer-/compiler-reuse, portabla cachecheckpoints och credit-bunden post-commit metadata-streaming.
- **Editor Metadata** — `system.out`, row/line, Anchor, SourceMap och jämförelse mellan revisioner.
- **Channel & Result** — deklarerade kanaldeskriptorer, strict validation, global eventtimeline och atomiskt result envelope.
- **Data & Lineage** — typade dataset/schema-events, stabila records, deterministisk inner join, cell-/record-lineage, derived aggregation och en source-bound JSON-tabellprojektion.
- **Notebook Interop** — whole snapshots, stabila cell-id:n, tre MIME-representationer, explicit stateprofil och digest-baserad stale detection.
- **Annotation & Review** — immutable modellkandidater, modell-/prompt-/inputdigests, confidence method, append-only accept/reject/supersede och resolverbara W3C-/Label Studio-projektioner.
- **Conformance** — profilval, stage gates, härledda subset-anspråk, versionssatt normalized golden snapshot, strukturell diff, exakta negativa cases och kooperativ cancellation.

Channel & Result innehåller även en adapterinspektör. Den visar det körbara kontraktet efter core commit utan att starta en separat run.

Fixturepaketet innehåller bland annat `parser-recovery`, `scope-torture`, `editor-revision`, `editor-kernel-revisions`, `verified-stage-cache`, `channel-fanout`, `base64-inverse`, `failed-run`, `data-join`, `notebook-snapshot`, `annotation-review`, `conformance-golden`, två ytterligare negativa cases och `cancellation-probe`.

## Embedded Editor Kernel

Textabana kan bäddas in som en dokumentkärna bakom editorer. Workern implementerar det versionssatta protokollet `textabana.editor-kernel/lab-v1`: hosten öppnar ett dokument, skickar atomiska Unicode-code-point-ChangeSets mot en explicit basrevision, kör read-only `analyze`, prenumererar på kanaler och kör exakt valt snapshot. `analyze` returnerar CST, AST, partial typed IR och recovery utan att initiera moduler eller exekvera stages. Hosten avancerar sin head först från kärnans korrelerade acknowledgement, aldrig från en optimistiskt antagen revision.

Delta matchas med stabil channel-/domänidentitet, aldrig med run-lokala event-id:n. Failed och cancelled run lämnar föregående committade deltabaslinje orörd. Stabilt anchor-id har företräde; annars får en unik TextQuote + origin relinkas. Flera kandidater blir `ambiguous` och ingen kandidat blir `orphaned` — kärnan gissar inte.

## Host-SDK och säkra modulpaket

`sdk/typescript` innehåller den framework-neutrala klienten och tunna bindningar för CodeMirror och Monaco. Samtliga editoroffsets konverteras till kärnans Unicode-code-point-koordinater. `sdk/python` innehåller samma JSON-meddelandeklient och en Jupyter-kompatibel MIME-projektion som endast accepterar committade resultat.

Ett säkert JavaScript-modulpaket använder `textabana.module-manifest/lab-v1`, ett namespaced paket-id, semantisk version, exakt entrypoint och SHA-256 över källbytes. `options.moduleLock` måste låsa exakt samma identitet, digest och entrypoint. `options.capabilityGrants` måste explicit ge varje required-, channel- och resource-capability innan entrypoint laddas. Efter laddning verifieras att exporterade funktioners `state`, `determinism` och `effects` exakt matchar manifestet. Detta är en paket- och behörighetsgrind, inte en JavaScript-sandbox.

Subseten ger inkrementell dokumenttransport, inkrementell metadataleverans och konservativ selektiv stage-exekvering. Den använder en formell Lezer-parser och `textabana.ir/lab-v2`. Efter modulinitiering men före första transform byggs en typed `textabana.execution-plan/lab-v2` som styr en deterministisk ready-set-scheduler. Oberoende stages med det betrodda kontraktet `pure + deterministic + effects=[]`, render-only output och lossless snapshotbart input får överlappa asynkront i samma Worker; unknown, stateful och effectful stages är seriella barriärer. `textabana.invalidation-preview/lab-v1` jämför rådgivande mot senaste lyckade editorbaslinje; faktisk lookup, hit, fresh invocation, reuse och scheduler-wave redovisas separat i `textabana.execution-report/lab-v1`.

Stage-cachen är minnes- och sessionslokal under körning men kan exporteras och importeras som ett explicit, digestbundet host-checkpoint. En kandidat måste deklarera `pure + deterministic + effects=[]`, sakna kanaler och icke-render-output och ge exakt samma typade output för samma fulla key witness i två skilda committed editorrevisioner. Witnessen binder authored args med observerbar egenskapsordning, den rekursiva delgrafen och hela den faktiskt initierade modulclosure i initieringsordning; FNV-labbucket jämförs alltid med den fulla witnessen. Först därefter får en senare förekomst materialisera en klonad output.

Cachevärdedomänen är medvetet strikt: endast `null`, sträng, boolesk, ändliga tal, täta standardarrayer och extensible plain/null-prototype objects med standarddeskriptorer accepteras. Alias/cykler, getters, symboler, specialprototyper, sparse eller utökade arrayer, readonly/frozen värden, proxies och för stora outputs körs fresh. Pending observationer committas först efter core-resultat, immutable adapterfan-out, conformance-gate och aktuell editor-head; failed, cancelled, stale, gate-rejected, cache-CAS och ersatta sessioner lämnar ingen committad evidens. Rapporten skiljer attempts från synliga writes/observations även vid eviction. Alla startade concurrent branches dräneras med `allSettled`, men values, trace, provenance och cachejournal publiceras alltid i planordning.

Run-policyn tar endast strikt positiva heltal och har hosttak för samtidiga invocationer, planerade stage-resolutioner, kanalhändelser och final renderstorlek i UTF-8-bytes samt en valfri kooperativ deadline. Deadline kontrolleras vid runtime-/checkpointgränser och budgetfel ger ett atomiskt `failed`-resultat; user cancellation förblir `cancelled`. Outputs från faktiskt samtidiga fresh-invocations detacheras direkt vid settlement genom en förlustfri snapshot av den portabla TextabanaValue-domänen. Parsern återanvänder giltiga Lezer-fragment efter ChangeSets och en redan analyserad revision återanvänds som compiler-snapshot. Stream-subscriptions levererar endast committade metadatadeltan och stannar när hostens credit är förbrukad. Detta är inte en sandbox: synkron kod kan inte preempteras, cachecheckpoint lagras av hosten och kontinuerlig stage-output-streaming, cached event replay samt multicore-exekvering ingår inte.

## Parser och typed IR

Dokumentet går genom exakt en auktoritativ kedja: `source → Lezer CST → Textabana AST → typed IR → compile gate`. Include-resolution, config, Language Lab och runtime läser samma resultat. Error-level recovery ger partial editorstruktur men blockerar modulinitiering, plan och domänexekvering. Fenced code och `\>>>>`/`\<<<<` är literal syntax; funktionsoutput reparsas aldrig. Alla publika spans använder halvöppna Unicode-code-point-offsets. Det körbara grammatikkontraktet, samtliga implementerade recoveryfamiljer, typed node-unionen och Lezer-beslutet finns i [parserkontraktet](./TEXTABANA_PARSER.md).

Ett giltigt snapshot får `textabana.execution-plan/lab-v2` och `textabana.execution-graph/lab-v1` efter att include-moduler har initierats men innan någon transform anropas. Source-, stage-, merge- och rendernoder binds med typed edges och deterministisk topologisk ordning. Observerad `executionTrace` använder `textabana.execution-step/lab-v2`: varje post refererar en stage-nod via `planNodeRef` och redovisar antingen fresh invocation eller cachematerialisering. Även ett senare misslyckat stage lämnar därför resten av den förkompilerade grafen inspekterbar.

Varje stage publicerar ett cache-recept med stage-lokala source- och IR-digests, edge-/mergeberoende, funktions- och contextdigest samt resolved module identity, ordnad initierad module closure, input-, authored-args-, config-, contract-, profile- och environment-komponenter. Exakt typad input-digest materialiseras först vid stage-resolution och skiljer bland annat whitespace och värdetyper; full key witness jämförs dessutom byte-för-byte så att ett 32-bitars labdigest aldrig ensamt kan ge en träff. `behavior` beskriver mapping och används aldrig som puritysignal: legacyfunktioner utan explicit `state`, `determinism` och `effects` är `unknown` och icke-cachebara. Två lika observationer verifierar bara den aktuella sessionens cachepost under en betrodd deklaration — inte att godtycklig JavaScript faktiskt är ren. En reuse får alltid nya run-lokala instans-ID:n och pekar på två exakt kvalificerade, resolverbara observationsentiteter.

## Conformance-grind

Våg 5 är aktiv. Sprint 5.1 tillför en [fristående CLI och extern värdsuite](./conformance/README.md): kör samma dokumentflöde genom Worker, TypeScript, CodeMirror, Monaco och Python, kanonisera strikt JSON med JCS/SHA-256, signera/verifiera rapporter med egna Ed25519-nycklar och verifiera det lokala [paketregistret](./PACKAGE_REGISTRY.json). Sprint 5.2 tillför [källbundna SHA-256-identiteter för IR, Plan och Result](./SEMANTIC_IDENTITY.md), verifieringspaket och en extern artefaktprofil med 28 utfall. Sprint 5.3 tillför ett [exekverbart artefaktkontrakt](./SEMANTIC_CONTRACT.md) med publicerat JSON Schema, strikt referensverifiering och 80 frysta positiva/negativa kontraktfall. Aktivera SHA-256-identiteter och öppna Conformance → Identiteter → Verifiera paket i labbet. Profilerna använder samma JavaScript-kärna och innebär inte full produktionskonformitet; befintliga labb-ID:n finns kvar.

Sprint 5.4 tillför den första [oberoende textprofilen](./TEXT_CORE_PROFILE.md): en fristående Python-parser och evaluator jämförs med JavaScript-kärnan i 70 frysta fall, totalt 140 runtimeutfall. Text, nästlade block, pipelines, Unicode, syntaxfel och resursgränser ingår. Python-filen kör utan Node och utan resten av repot. CLI-kommandot `conformance-text-core` och rapporten i Conformance-labbet redovisar det avgränsade anspråket. Bredare språk-/domänkonformitet, release-signering och registertjänst återstår.

Sprint 5.5 utökar detta med [oberoende intervallsemantik](./SCOPED_TEXT_PROFILE.md): 80 nya fall för överlappande intervall, namn-/id-matchning, numerisk ordning, blockarv och atomiska fel. Båda implementationerna jämförs även mot en explicit ordnad lista över committade funktionsanrop. `conformance-scoped-text` reproducerar rapporten. Den tidigare textprofilen behålls.

Sprint 5.6 lägger till [oberoende kanalresultat](./CHANNEL_CORE_PROFILE.md): 80 nya fall jämför render, anropsordning, exakta payloads, global händelseordning och sparade kanalresultat. Tillfälliga händelser räknas i ordningen; payloadkopiering, obligatoriska tomma kanaler och atomisk återställning vid fel verifieras. `conformance-channel-core` reproducerar rapporten. Godtyckliga moduler, full proveniensekvivalens, cache och produktionskonformitet återstår.

Sprint 5.7 lägger till [oberoende positionskoppling](./SOURCE_MAP_CORE_PROFILE.md): 70 fall jämför deklarationsrader, källintervall, Unicode-positioner, citatkontext och länkar mellan händelser, ankare och funktionsanrop. Ankare med samma rad-id behåller korrekt sista position; olika rad-id:n med kolliderande interna nycklar stoppar hela körningen. Citatkontext kapar inte längre emoji mitt i ett tecken. `conformance-source-map-core` reproducerar rapporten. Full proveniensgraf och semantisk artefaktekvivalens ligger fortsatt utanför denna profil.

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

Dokumentationen är **Textabana Language & Interop draft 0.7 med Våg 3 lab-addendum**. Webbmotorn implementerar `textabana.parser/lab-v1`, `textabana.cst/lab-v1`, `textabana.ast/lab-v1`, `textabana.ir/lab-v2`, `textabana.execution-plan/lab-v2`, `textabana.execution-graph/lab-v1`, `textabana.execution-step/lab-v2`, `textabana.invalidation-preview/lab-v1` och `textabana.execution-report/lab-v1` med nästlade scheduler-/resursrapporter samt uttryckligen avgränsade playground-subsets av `language-core/0.4`, `runtime-json/1`, `editor/1`, `editor-kernel/1`, `adapter-contract/1`, `data/1`, `notebook/1` och `annotation/1`. Den gör anspråk på sessionslokal selective reuse och begränsad async branch-concurrency i en Worker — inte generell inkrementell, flertrådad eller full profilkonform exekvering.

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
- `runtime/run-policy.js` — bounded ready-set-policy, kooperativ deadline och stage-/event-/renderbudget.
- `runtime/stage-cache.js` — förlustfri cachevärdesdomän, tvåobservationsverifiering och atomisk sessionscommit.
- `public/runtime-worker.js` — deterministiskt genererad klassisk Worker-bundle som UI och headless-test kör.
- `TEXTABANA_PARSER.md` — formell grammatik, lagergränser, recoverymatris och parserarkitekturbeslut.
- `IMPLEMENTATION_PLAN.md` — versionspolicy, sprintar och acceptansgrindar.
- `EDITOR_KERNEL_PLAN.md` — nästa fem vågor från dokumentprotokoll till produktionskonformitet.
- `tests/` — regressioner och fixturekontrakt.
